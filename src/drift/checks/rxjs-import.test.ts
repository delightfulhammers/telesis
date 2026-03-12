import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useTempDir } from "../../test-utils.js";
import { rxjsImportCheck } from "./rxjs-import.js";

describe("rxjs-import-containment", () => {
  const makeTempDir = useTempDir("rxjs-import");

  it("passes when rxjs is only in bus.ts", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src", "daemon"), { recursive: true });
    writeFileSync(
      join(dir, "src", "daemon", "bus.ts"),
      'import { Subject } from "rxjs";\n',
    );
    writeFileSync(
      join(dir, "src", "daemon", "types.ts"),
      "export type EventType = string;\n",
    );

    const finding = rxjsImportCheck.run(dir);
    expect(finding.passed).toBe(true);
  });

  it("fails when rxjs is imported elsewhere", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src", "daemon"), { recursive: true });
    writeFileSync(
      join(dir, "src", "daemon", "bus.ts"),
      'import { Subject } from "rxjs";\n',
    );
    writeFileSync(
      join(dir, "src", "daemon", "watcher.ts"),
      'import { debounceTime } from "rxjs/operators";\n',
    );

    const finding = rxjsImportCheck.run(dir);
    expect(finding.passed).toBe(false);
    expect(finding.details.length).toBe(1);
    expect(finding.details[0]).toContain("watcher.ts");
  });

  it("ignores test files", () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, "src", "daemon"), { recursive: true });
    writeFileSync(
      join(dir, "src", "daemon", "bus.ts"),
      'import { Subject } from "rxjs";\n',
    );
    writeFileSync(
      join(dir, "src", "daemon", "bus.test.ts"),
      'import { Subject } from "rxjs";\n',
    );

    const finding = rxjsImportCheck.run(dir);
    expect(finding.passed).toBe(true);
  });
});
