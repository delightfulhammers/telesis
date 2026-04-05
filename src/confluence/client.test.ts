import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchSpacePages, fetchPage, ConfluenceApiError } from "./client.js";
import type {
  ConfluenceClientConfig,
  ConfluenceSearchResponse,
} from "./types.js";

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

const jsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const makeSearchResponse = (
  count: number,
  hasNext = false,
): ConfluenceSearchResponse => ({
  results: Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    title: `Page ${i + 1}`,
    status: "current",
    body: { storage: { value: `<p>Content ${i + 1}</p>` } },
    _links: { webui: `/wiki/pages/${i + 1}` },
  })),
  size: count,
  start: 0,
  limit: 25,
  _links: hasNext ? { next: "/rest/api/content?start=25" } : {},
});

describe("fetchSpacePages", () => {
  it("fetches pages from a space", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse(3)));

    const pages = await fetchSpacePages(config, "PROJ");

    expect(pages).toHaveLength(3);
    expect(pages[0].title).toBe("Page 1");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("spaceKey=PROJ");
    expect(url).toContain("expand=body.storage");
  });

  it("paginates when next link exists", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse(25, true)));
    mockFetch.mockResolvedValueOnce(jsonResponse(makeSearchResponse(5, false)));

    const pages = await fetchSpacePages(config, "PROJ");

    expect(pages).toHaveLength(30);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects non-HTTPS baseUrl", async () => {
    const httpConfig: ConfluenceClientConfig = {
      ...config,
      baseUrl: "http://internal",
    };
    await expect(fetchSpacePages(httpConfig, "PROJ")).rejects.toThrow(
      "must use HTTPS",
    );
  });

  it("throws on 401", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );
    await expect(fetchSpacePages(config, "PROJ")).rejects.toThrow(
      "authentication failed",
    );
  });
});

describe("fetchPage", () => {
  it("fetches a single page by ID", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: "123",
        title: "Test Page",
        status: "current",
        body: { storage: { value: "<p>Hello</p>" } },
        _links: { webui: "/wiki/pages/123" },
      }),
    );

    const page = await fetchPage(config, "123");

    expect(page.id).toBe("123");
    expect(page.title).toBe("Test Page");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/rest/api/content/123");
  });
});

describe("ConfluenceApiError", () => {
  it("preserves status, body, and message", () => {
    const err = new ConfluenceApiError(404, "not found", "page missing");
    expect(err.status).toBe(404);
    expect(err.body).toBe("not found");
    expect(err.message).toBe("page missing");
    expect(err.name).toBe("ConfluenceApiError");
  });
});
