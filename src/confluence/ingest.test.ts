import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../test-utils.js";
import { ingestConfluenceSpace } from "./ingest.js";
import type {
  ConfluenceClientConfig,
  ConfluenceSearchResponse,
} from "./types.js";

const makeTempDir = useTempDir("confluence-ingest");

const mockFetch =
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const config: ConfluenceClientConfig = {
  baseUrl: "https://company.atlassian.net/wiki",
  auth: { mode: "bearer", token: "pat-test" },
};

const makePageResponse = (
  pages: readonly { id: string; title: string; body: string }[],
): ConfluenceSearchResponse => ({
  results: pages.map((p) => ({
    id: p.id,
    title: p.title,
    status: "current",
    body: { storage: { value: p.body } },
    _links: { webui: `/wiki/spaces/PROJ/pages/${p.id}` },
  })),
  size: pages.length,
  start: 0,
  limit: 25,
  _links: {},
});

describe("ingestConfluenceSpace", () => {
  it("writes fetched pages as markdown files", async () => {
    const dir = makeTempDir();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makePageResponse([
            {
              id: "123",
              title: "Architecture Overview",
              body: "<h1>Architecture</h1><p>Our system uses microservices.</p>",
            },
          ]),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await ingestConfluenceSpace(config, "PROJ", dir);

    expect(result.pagesWritten).toBe(1);
    expect(result.files).toEqual(["architecture-overview.md"]);

    const content = readFileSync(
      join(dir, "architecture-overview.md"),
      "utf-8",
    );
    expect(content).toContain("# Architecture");
    expect(content).toContain("microservices");
    expect(content).toContain("source: confluence");
    expect(content).toContain('page_id: "123"');
  });

  it("skips pages that already exist", async () => {
    const dir = makeTempDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "architecture-overview.md"), "existing content");

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makePageResponse([
            {
              id: "123",
              title: "Architecture Overview",
              body: "<p>new content</p>",
            },
          ]),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await ingestConfluenceSpace(config, "PROJ", dir);

    expect(result.pagesWritten).toBe(0);
    expect(result.skippedExisting).toBe(1);

    const content = readFileSync(
      join(dir, "architecture-overview.md"),
      "utf-8",
    );
    expect(content).toBe("existing content");
  });

  it("handles multiple pages", async () => {
    const dir = makeTempDir();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makePageResponse([
            { id: "1", title: "Vision", body: "<p>Our vision</p>" },
            { id: "2", title: "PRD", body: "<p>Requirements</p>" },
          ]),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await ingestConfluenceSpace(config, "PROJ", dir);

    expect(result.pagesWritten).toBe(2);
    expect(result.files).toContain("vision.md");
    expect(result.files).toContain("prd.md");
  });

  it("slugifies page titles for filenames", async () => {
    const dir = makeTempDir();
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makePageResponse([
            {
              id: "1",
              title: "API Gateway - Design & Implementation",
              body: "<p>content</p>",
            },
          ]),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await ingestConfluenceSpace(config, "PROJ", dir);

    expect(result.files).toEqual(["api-gateway-design-implementation.md"]);
  });
});
