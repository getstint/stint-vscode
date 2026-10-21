import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EditorId, editorFromAppName, userAgent } from "./editor";
import { isExcluded, projectForFile, relativeEntity } from "./project";
import { sameFileEveryMs, shouldSend } from "./schedule";

describe("editor detection", () => {
  test("names each VS Code fork from its app name", () => {
    expect(editorFromAppName("Visual Studio Code")).toBe(EditorId.VsCode);
    expect(editorFromAppName("Cursor")).toBe(EditorId.Cursor);
    expect(editorFromAppName("Windsurf - Next")).toBe(EditorId.Windsurf);
    expect(editorFromAppName("VSCodium")).toBe(EditorId.VsCodium);
  });

  test("the user agent carries the editor for the server's detection", () => {
    expect(userAgent(EditorId.Cursor, "1.7.0", "0.1.0")).toContain("cursor/1.7.0 vscode-stint/0.1.0");
  });
});

describe("heartbeat schedule", () => {
  test("a new file or a save always sends", () => {
    expect(shouldSend(null, "a.ts", 0, false)).toBe(true);
    expect(shouldSend({ entity: "a.ts", at: 0 }, "b.ts", 1, false)).toBe(true);
    expect(shouldSend({ entity: "a.ts", at: 0 }, "a.ts", 1, true)).toBe(true);
  });

  test("the same file sends at most every two minutes", () => {
    expect(shouldSend({ entity: "a.ts", at: 0 }, "a.ts", sameFileEveryMs - 1, false)).toBe(false);
    expect(shouldSend({ entity: "a.ts", at: 0 }, "a.ts", sameFileEveryMs, false)).toBe(true);
  });
});

describe("projects and paths", () => {
  const root = mkdtempSync(join(tmpdir(), "stint-vscode-"));
  mkdirSync(join(root, "repo", ".git"), { recursive: true });
  mkdirSync(join(root, "repo", "src"), { recursive: true });
  writeFileSync(join(root, "repo", ".git", "HEAD"), "ref: refs/heads/feat/status-bar\n");

  test("the git root names the project and its branch", () => {
    expect(projectForFile(join(root, "repo", "src", "a.ts"), undefined)).toEqual({
      root: join(root, "repo"),
      name: "repo",
      branch: "feat/status-bar",
    });
  });

  test("outside a repo the workspace folder is the project", () => {
    mkdirSync(join(root, "plain"), { recursive: true });
    expect(projectForFile(join(root, "plain", "notes.md"), join(root, "plain"))?.name).toBe("plain");
  });

  test("paths are sent relative to the project and never outside it", () => {
    expect(relativeEntity(join(root, "repo", "src", "a.ts"), join(root, "repo"))).toBe("src/a.ts");
    expect(relativeEntity(join(root, "elsewhere.ts"), join(root, "repo"))).toBeNull();
  });

  test("exclude patterns", () => {
    expect(isExcluded("/w/app/secret/keys.ts", ["**/secret/**"])).toBe(true);
    expect(isExcluded("/w/app/.env", ["**/.env"])).toBe(true);
    expect(isExcluded("/w/app/src/a.ts", ["**/secret/**"])).toBe(false);
  });
});
