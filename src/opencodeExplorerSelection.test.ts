import * as assert from "assert/strict";
import { test } from "node:test";
import { copiedPathsToWorkspaceUris, createExplorerSelectionReader } from "./opencodeExplorerSelection";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("captures all copied paths with LF or CRLF and restores previous clipboard text", async () => {
  for (const delimiter of ["\n", "\r\n"]) {
    let clipboard = "previous clipboard text";
    const writes: string[] = [];
    const paths = ["/repo/first.ts", "/repo/ leading and trailing .txt "];
    const readSelection = createExplorerSelectionReader({
      readText: async () => clipboard,
      writeText: async (value) => { clipboard = value; writes.push(value); },
      copyPaths: async () => { clipboard = paths.join(delimiter) + delimiter; },
    });

    assert.deepEqual(await readSelection(), paths);
    assert.equal(clipboard, "previous clipboard text");
    assert.equal(writes.at(-1), "previous clipboard text");
  }
});

test("does not use old clipboard paths when Copy Path produces no selection", async () => {
  let clipboard = "/repo/stale-selection.ts";
  const readSelection = createExplorerSelectionReader({
    readText: async () => clipboard,
    writeText: async (value) => { clipboard = value; },
    copyPaths: async () => {},
  });

  assert.deepEqual(await readSelection(), []);
  assert.equal(clipboard, "/repo/stale-selection.ts");
});

test("restores clipboard text when the Copy Path command fails", async () => {
  let clipboard = "previous text";
  const readSelection = createExplorerSelectionReader({
    readText: async () => clipboard,
    writeText: async (value) => { clipboard = value; },
    copyPaths: async () => { throw new Error("Copy Path failed"); },
  });

  await assert.rejects(readSelection(), /Copy Path failed/);
  assert.equal(clipboard, "previous text");
});

test("does not overwrite text copied externally after the selection was captured", async () => {
  let clipboard = "previous text";
  let copied = false;
  const selectionText = "/repo/first.ts\n/repo/second.ts";
  const readSelection = createExplorerSelectionReader({
    readText: async () => {
      const value = clipboard;
      if (copied && value === selectionText) {
        clipboard = "text copied by another application";
      }
      return value;
    },
    writeText: async (value) => { clipboard = value; },
    copyPaths: async () => { copied = true; clipboard = selectionText; },
  });

  assert.deepEqual(await readSelection(), ["/repo/first.ts", "/repo/second.ts"]);
  assert.equal(clipboard, "text copied by another application");
});

test("shares one in-flight capture and starts an independent capture after completion", async () => {
  let clipboard = "previous text";
  let copyCount = 0;
  const started = deferred();
  const release = deferred();
  const readSelection = createExplorerSelectionReader({
    readText: async () => clipboard,
    writeText: async (value) => { clipboard = value; },
    copyPaths: async () => {
      copyCount++;
      if (copyCount === 1) {
        started.resolve();
        await release.promise;
      }
      clipboard = `/repo/selection-${copyCount}.ts`;
    },
  });

  const first = readSelection();
  const second = readSelection();
  assert.equal(second, first);
  await started.promise;
  assert.equal(copyCount, 1);
  assert.equal(readSelection(), first);
  release.resolve();

  assert.deepEqual(await Promise.all([first, second]), [
    ["/repo/selection-1.ts"],
    ["/repo/selection-1.ts"],
  ]);
  assert.equal(copyCount, 1);
  assert.equal(clipboard, "previous text");

  const next = readSelection();
  assert.notEqual(next, first);
  assert.deepEqual(await next, ["/repo/selection-2.ts"]);
  assert.equal(copyCount, 2);
  assert.equal(clipboard, "previous text");
});

test("shares an in-flight rejection and allows an independent successful retry", async () => {
  let clipboard = "previous text";
  let attempts = 0;
  const readSelection = createExplorerSelectionReader({
    readText: async () => clipboard,
    writeText: async (value) => { clipboard = value; },
    copyPaths: async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error("first capture failed");
      }
      clipboard = "/repo/recovered.ts";
    },
  });

  const first = readSelection();
  const second = readSelection();
  assert.equal(second, first);
  await Promise.all([
    assert.rejects(first, /first capture failed/),
    assert.rejects(second, /first capture failed/),
  ]);
  assert.equal(attempts, 1);
  assert.equal(clipboard, "previous text");

  const retry = readSelection();
  assert.notEqual(retry, first);
  assert.deepEqual(await retry, ["/repo/recovered.ts"]);
  assert.equal(attempts, 2);
  assert.equal(clipboard, "previous text");
});

class TestUri {
  constructor(
    readonly path: string,
    readonly fsPath = path,
    readonly scheme = "file",
    readonly authority = "",
  ) {}

  with(change: { path: string }): TestUri {
    return new TestUri(change.path, change.path, this.scheme, this.authority);
  }
}

test("maps POSIX paths inside the workspace and preserves spaces in filenames", () => {
  const root = new TestUri("/repo");
  const result = copiedPathsToWorkspaceUris([
    "/repo/first.ts",
    "/repo/ leading and trailing .txt ",
    "/repo-other/outside.ts",
    "/outside.ts",
    "relative.ts",
    "/repo/first.ts",
  ], [root], "linux");

  assert.deepEqual(result.map((uri) => uri.path), [
    "/repo/first.ts",
    "/repo/ leading and trailing .txt ",
  ]);
});

test("keeps POSIX workspace matching case-sensitive", () => {
  const result = copiedPathsToWorkspaceUris(["/Repo/file.ts", "/repo/file.ts"], [new TestUri("/Repo")], "linux");
  assert.deepEqual(result.map((uri) => uri.path), ["/Repo/file.ts"]);
});

test("preserves literal backslashes in Linux filenames and workspace roots", () => {
  const root = new TestUri("/repo\\name");
  const paths = ["/repo\\name/file\\name.ts", "/repo\\name/file/name.ts"];
  const result = copiedPathsToWorkspaceUris(paths, [root], "linux");
  assert.deepEqual(result.map(uri => uri.path), paths);
});

test("maps filesystem roots and preserves Unicode filenames on every platform", () => {
  for (const platform of ["darwin", "linux", "win32"] as const) {
    const windows = platform === "win32";
    const root = new TestUri(windows ? "/C:/" : "/", windows ? "C:\\" : "/");
    const result = copiedPathsToWorkspaceUris([
      windows ? "C:\\carpeta con espacios\\archivo ñ 日本語.ts" : "/carpeta con espacios/archivo ñ 日本語.ts",
    ], [root], platform);
    assert.deepEqual(result.map(uri => uri.path), [
      `${windows ? "/C:" : ""}/carpeta con espacios/archivo ñ 日本語.ts`,
    ]);
  }
});

test("honors a configured Copy Path separator without rewriting POSIX workspace roots", () => {
  const root = new TestUri("/home/dev/repo");
  const result = copiedPathsToWorkspaceUris([
    "\\home\\dev\\repo\\src\\file.ts",
    "\\home\\dev\\repo-other\\outside.ts",
  ], [root], "linux", "\\");
  assert.deepEqual(result.map(uri => uri.path), ["/home/dev/repo/src/file.ts"]);
});

test("uses the most specific workspace root and preserves its URI identity", () => {
  const outer = new TestUri("/repo");
  const inner = new TestUri("/repo/nested", "/repo/nested", "vscode-remote", "ssh-remote+dev");
  const result = copiedPathsToWorkspaceUris(["/repo/nested/src/file.ts", "/repo/other.ts"], [outer, inner], "linux");

  assert.deepEqual(result.map((uri) => [uri.path, uri.scheme, uri.authority]), [
    ["/repo/nested/src/file.ts", "vscode-remote", "ssh-remote+dev"],
    ["/repo/other.ts", "file", ""],
  ]);
});

test("maps Windows drive paths with either separator and deduplicates case-insensitively", () => {
  const root = new TestUri("/C:/Repo", "C:\\Repo");
  const result = copiedPathsToWorkspaceUris([
    "c:\\repo\\src\\first.ts",
    "C:/Repo/src/second.ts",
    "C:/REPO/src/FIRST.ts",
    "C:\\Repo-other\\outside.ts",
    "D:\\Repo\\outside.ts",
  ], [root], "win32");

  assert.deepEqual(result.map((uri) => uri.path), ["/C:/Repo/src/first.ts", "/C:/Repo/src/second.ts"]);
});

test("maps Windows UNC paths without duplicating the authority or share", () => {
  const root = new TestUri("/share/repo", "\\\\server\\share\\repo", "file", "server");
  const result = copiedPathsToWorkspaceUris([
    "\\\\SERVER\\share\\repo\\src\\file.ts",
    "//server/share/repo/src/file.ts",
    "\\\\server\\other-share\\repo\\outside.ts",
    "\\\\other-server\\share\\repo\\outside.ts",
  ], [root], "win32");

  assert.deepEqual(result.map((uri) => [uri.path, uri.authority]), [["/share/repo/src/file.ts", "server"]]);
});

test("preserves remote workspace schemes and authorities", () => {
  const root = new TestUri("/home/dev/project", "/home/dev/project", "vscode-remote", "ssh-remote+dev");
  const result = copiedPathsToWorkspaceUris(["/home/dev/project/src/file.ts"], [root], "linux");

  assert.deepEqual(result.map((uri) => [uri.path, uri.scheme, uri.authority]), [
    ["/home/dev/project/src/file.ts", "vscode-remote", "ssh-remote+dev"],
  ]);
});

test("returns no resources when there are no workspace roots", () => {
  assert.deepEqual(copiedPathsToWorkspaceUris(["/repo/file.ts"], [], "linux"), []);
});
