import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

class TestUri {
  constructor(readonly path: string, readonly windows = false, readonly authority = "") {}
  get scheme() { return "file"; }
  get fsPath() {
    const value = this.authority ? `//${this.authority}${this.path}` : this.windows ? this.path.replace(/^\//, "") : this.path;
    return this.windows ? value.replace(/\//g, "\\") : value;
  }
  with(change: { path: string }) { return new TestUri(change.path, this.windows, this.authority); }
  toString() { return `file://${this.authority}${this.path}`; }
}

type Command = (...args: unknown[]) => Promise<void>;

// Exercise the registered handlers without starting an OpenCode process or
// mounting a webview. Delivery inside the webview is covered separately.
function commandHarness(platform: NodeJS.Platform = "linux", options: { root?: TestUri; copyPathSeparator?: string } = {}) {
  const windows = platform === "win32";
  const root = options.root ?? new TestUri(windows ? "/C:/repo" : "/repo", windows);
  const active = root.with({ path: `${root.path}/active.ts` });
  const commands = new Map<string, Command>();
  const executed: string[] = [];
  const inspected: string[] = [];
  const readFiles: string[] = [];
  const workspaceLookups: string[] = [];
  const logs: string[] = [];
  let clipboard = "previous clipboard text";
  let selectedPaths: string | undefined;
  let pickerResult: TestUri[] | undefined;
  let pickerCalls = 0;
  let copyError: Error | undefined;
  const disposable = { dispose() {} };
  const vscode = {
    Disposable: class { constructor(readonly dispose: () => void) {} },
    FileType: { File: 1 },
    env: { clipboard: {
      readText: async () => clipboard,
      writeText: async (text: string) => { clipboard = text; },
    } },
    window: {
      createOutputChannel: () => ({ ...disposable, appendLine: (text: string) => logs.push(text) }),
      registerWebviewViewProvider: () => disposable,
      activeTextEditor: {
        document: { uri: active },
        selection: { isEmpty: false, start: { line: 2 }, end: { line: 5 } },
      },
      showOpenDialog: async () => { pickerCalls++; return pickerResult; },
    },
    workspace: {
      workspaceFolders: [{ uri: root }],
      onDidChangeWorkspaceFolders: () => disposable,
      onDidChangeConfiguration: () => disposable,
      getConfiguration: () => ({ get: () => options.copyPathSeparator ?? "auto" }),
      getWorkspaceFolder: (uri: TestUri) => {
        workspaceLookups.push(uri.path);
        return uri.path.startsWith(`${root.path}/`) ? { uri: root } : undefined;
      },
      asRelativePath: (uri: TestUri) => {
        const relative = uri.path.slice(root.path.length + 1);
        return windows ? relative.replace(/\//g, "\\") : relative;
      },
      fs: {
        stat: async (uri: TestUri) => { inspected.push(uri.path); return { type: 1 }; },
        readFile: async (uri: TestUri) => { readFiles.push(uri.path); return Buffer.from(uri.path); },
      },
    },
    commands: {
      registerCommand: (id: string, handler: Command) => { commands.set(id, handler); return disposable; },
      executeCommand: async (id: string) => {
        executed.push(id);
        if (id === "copyFilePath" && copyError) {
          throw copyError;
        }
        if (id === "copyFilePath" && selectedPaths !== undefined) {
          clipboard = selectedPaths;
        }
      },
    },
  };
  const exported = {} as { activate(context: { subscriptions: unknown[] }): void };
  // Load local dependencies in the same simulated OS so default platform
  // arguments and path operations do not silently use the test host's OS.
  const modules = new Map<string, object>();
  function loadModule(filename: string, exports: object = {}) {
    const cached = modules.get(filename);
    if (cached) {
      return cached;
    }
    modules.set(filename, exports);
    const localRequire = createRequire(filename);
    runInNewContext(readFileSync(filename, "utf8"), {
      exports,
      require: (id: string): unknown => {
        if (id === "vscode") { return vscode; }
        if (id === "path" || id === "node:path") { return windows ? path.win32 : path.posix; }
        return id.startsWith(".") ? loadModule(localRequire.resolve(id)) : localRequire(id);
      },
      setTimeout: () => 1,
      process: { ...process, platform },
      Buffer,
    }, { filename });
    return exports;
  }
  loadModule(path.join(__dirname, "extension.js"), exported);
  exported.activate({ subscriptions: [] });
  return {
    root, active, executed, inspected, readFiles, workspaceLookups, logs,
    get clipboard() { return clipboard; },
    get pickerCalls() { return pickerCalls; },
    selectPaths: (value: string | undefined) => { selectedPaths = value; },
    failCopyPaths: () => { copyError = new Error("copyFilePath failed"); },
    setPickerResult: (value: TestUri[] | undefined) => { pickerResult = value; },
    run: async (id: string, ...args: unknown[]) => {
      const command = commands.get(id);
      assert.ok(command, `command ${id} must be registered`);
      await command(...args);
    },
  };
}

for (const platform of ["darwin", "linux", "win32"] as const) {
  const windows = platform === "win32";

  test(`Add to OpenCode inspects every Explorer context-menu resource on ${platform}`, async () => {
    const h = commandHarness(platform);
    const first = h.root.with({ path: `${h.root.path}/first.ts` });
    const second = h.root.with({ path: `${h.root.path}/folder/second.ts` });
    await h.run("opencode.addToOpenCode", first, [first, second]);
    assert.deepEqual(h.inspected, [first.path, second.path]);
    assert.equal(h.executed.includes("copyFilePath"), false);
    assert.equal(h.workspaceLookups.includes(h.active.path), false);
  });

  test(`Add to OpenCode reads every Explorer keyboard selection on ${platform}`, async () => {
    const h = commandHarness(platform);
    const first = h.root.with({ path: `${h.root.path}/first.ts` });
    const second = h.root.with({ path: `${h.root.path}/folder with spaces/second.ts` });
    h.selectPaths([first.fsPath, second.fsPath].join(windows ? "\r\n" : "\n"));
    await h.run("opencode.addToOpenCode", { fromExplorer: true });
    assert.deepEqual(h.inspected, [first.path, second.path]);
    assert.equal(h.executed.filter(id => id === "copyFilePath").length, 1);
    assert.equal(h.clipboard, "previous clipboard text");
    assert.equal(h.workspaceLookups.includes(h.active.path), false);
  });

  test(`Attach to OpenCode reads every Explorer context-menu resource on ${platform}`, async () => {
    const h = commandHarness(platform);
    const first = h.root.with({ path: `${h.root.path}/first.png` });
    const second = h.root.with({ path: `${h.root.path}/folder/second.pdf` });
    await h.run("opencode.attachToOpenCode", first, [first, second]);
    assert.deepEqual(h.readFiles, [first.path, second.path]);
    assert.equal(h.executed.includes("copyFilePath"), false);
    assert.equal(h.pickerCalls, 0);
  });

  test(`Attach to OpenCode reads every Explorer keyboard selection on ${platform}`, async () => {
    const h = commandHarness(platform);
    const first = h.root.with({ path: `${h.root.path}/first.png` });
    const second = h.root.with({ path: `${h.root.path}/folder with spaces/second.pdf` });
    const third = h.root.with({ path: `${h.root.path}/third.txt` });
    h.selectPaths([first.fsPath, second.fsPath, third.fsPath].join(windows ? "\r\n" : "\n"));
    await h.run("opencode.attachToOpenCode", { fromExplorer: true });
    assert.deepEqual(h.readFiles, [first.path, second.path, third.path]);
    assert.equal(h.executed.filter(id => id === "copyFilePath").length, 1);
    assert.equal(h.clipboard, "previous clipboard text");
    assert.equal(h.pickerCalls, 0);
  });

  test(`Attach to OpenCode reads a single Explorer keyboard selection on ${platform}`, async () => {
    const h = commandHarness(platform);
    const selected = h.root.with({ path: `${h.root.path}/selected.png` });
    h.selectPaths(selected.fsPath);
    await h.run("opencode.attachToOpenCode", { fromExplorer: true });
    assert.deepEqual(h.readFiles, [selected.path]);
    assert.equal(h.clipboard, "previous clipboard text");
    assert.equal(h.pickerCalls, 0);
  });

  test(`the multi-selection menu keeps complete native resources on ${platform}`, async () => {
    const h = commandHarness(platform);
    const first = h.root.with({ path: `${h.root.path}/first.ts` });
    const second = h.root.with({ path: `${h.root.path}/second.ts` });
    await h.run("opencode.addExplorerSelectionToOpenCode", first, [first, second]);
    assert.deepEqual(h.inspected, [first.path, second.path]);
    assert.equal(h.executed.includes("copyFilePath"), false);
    assert.equal(h.workspaceLookups.includes(h.active.path), false);
  });

  test(`the multi-selection menu recovers a partial native selection on ${platform}`, async () => {
    const h = commandHarness(platform);
    const first = h.root.with({ path: `${h.root.path}/first.ts` });
    const second = h.root.with({ path: `${h.root.path}/second.ts` });
    const third = h.root.with({ path: `${h.root.path}/folder with spaces/third.ts` });
    h.selectPaths([first.fsPath, second.fsPath, third.fsPath].join(windows ? "\r\n" : "\n"));
    await h.run("opencode.addExplorerSelectionToOpenCode", second, [second]);
    assert.deepEqual(h.inspected, [first.path, second.path, third.path]);
    assert.equal(h.executed.filter(id => id === "copyFilePath").length, 1);
    assert.equal(h.clipboard, "previous clipboard text");
  });

  test(`the multi-selection menu rejects a snapshot missing the clicked file on ${platform}`, async () => {
    const h = commandHarness(platform);
    const clicked = h.root.with({ path: `${h.root.path}/clicked.ts` });
    const other = h.root.with({ path: `${h.root.path}/other.ts` });
    const third = h.root.with({ path: `${h.root.path}/third.ts` });
    h.selectPaths([other.fsPath, third.fsPath].join(windows ? "\r\n" : "\n"));
    await h.run("opencode.addExplorerSelectionToOpenCode", clicked, [clicked]);
    assert.deepEqual(h.inspected, [clicked.path]);
    assert.equal(h.clipboard, "previous clipboard text");
  });

  test(`the multi-selection menu retains explicit resources if capture fails on ${platform}`, async () => {
    const h = commandHarness(platform);
    const clicked = h.root.with({ path: `${h.root.path}/clicked.ts` });
    h.failCopyPaths();
    await h.run("opencode.addExplorerSelectionToOpenCode", clicked, [clicked]);
    assert.deepEqual(h.inspected, [clicked.path]);
    assert.equal(h.clipboard, "previous clipboard text");
  });
}

for (const platform of ["darwin", "linux", "win32"] as const) {
  test(`menu recovery compares the clicked path using ${platform} casing rules`, async () => {
    const h = commandHarness(platform);
    const clicked = h.root.with({ path: `${h.root.path}/Clicked.ts` });
    const copied = h.root.with({ path: `${h.root.path}/clicked.ts` });
    const other = h.root.with({ path: `${h.root.path}/other.ts` });
    h.selectPaths([copied.fsPath, other.fsPath].join(platform === "win32" ? "\r\n" : "\n"));
    await h.run("opencode.addExplorerSelectionToOpenCode", clicked, [clicked]);
    assert.deepEqual(h.inspected, platform === "win32" ? [copied.path, other.path] : [clicked.path]);
  });

  test(`Explorer references preserve filenames and use ${platform} path separators`, async () => {
    const h = commandHarness(platform);
    const selected = h.root.with({ path: `${h.root.path}/carpeta con espacios/archivo ñ 日本語.ts` });
    h.selectPaths(selected.fsPath);
    await h.run("opencode.addToOpenCode", { fromExplorer: true });
    assert.deepEqual(h.inspected, [selected.path]);
    assert.ok(h.logs.some(line => line.endsWith("resolved 1 references: @carpeta con espacios/archivo ñ 日本語.ts")));
    assert.equal(h.clipboard, "previous clipboard text");
  });
}

test("Linux Explorer references preserve a literal backslash in a filename", async () => {
  const h = commandHarness("linux");
  const selected = h.root.with({ path: `${h.root.path}/file\\name.ts` });
  h.selectPaths(selected.fsPath);
  await h.run("opencode.addToOpenCode", { fromExplorer: true });
  assert.deepEqual(h.inspected, [selected.path]);
  assert.ok(h.logs.some(line => line.endsWith("resolved 1 references: @file\\name.ts")));
});

test("Linux editor references preserve a literal backslash in a filename", async () => {
  const h = commandHarness("linux");
  await h.run("opencode.addToOpenCode", h.root.with({ path: `${h.root.path}/file\\name.ts` }));
  assert.ok(h.logs.some(line => line.endsWith("resolved 1 references: @file\\name.ts")));
});

test("Windows Explorer shortcuts support UNC workspaces and CRLF selections", async () => {
  for (const command of ["opencode.addToOpenCode", "opencode.attachToOpenCode"]) {
    const root = new TestUri("/share/repo", true, "server");
    const h = commandHarness("win32", { root });
    const first = root.with({ path: `${root.path}/first.ts` });
    const second = root.with({ path: `${root.path}/carpeta con espacios/imagen ñ.png` });
    h.selectPaths([first.fsPath, second.fsPath].join("\r\n"));
    await h.run(command, { fromExplorer: true });
    assert.deepEqual(h.inspected, [first.path, second.path]);
    if (command === "opencode.attachToOpenCode") {
      assert.deepEqual(h.readFiles, [first.path, second.path]);
    }
    assert.equal(h.clipboard, "previous clipboard text");
  }
});

for (const platform of ["darwin", "linux", "win32"] as const) {
  for (const separator of ["/", "\\"] as const) {
    test(`Explorer shortcuts honor Copy Path separator ${JSON.stringify(separator)} on ${platform}`, async () => {
      for (const command of ["opencode.addToOpenCode", "opencode.attachToOpenCode"]) {
        const h = commandHarness(platform, { copyPathSeparator: separator });
        const selected = h.root.with({ path: `${h.root.path}/folder/selected.ts` });
        const copied = platform === "win32" ? selected.path.slice(1) : selected.path;
        h.selectPaths(copied.replace(/\//g, separator));
        await h.run(command, { fromExplorer: true });
        assert.deepEqual(h.inspected, [selected.path]);
        assert.equal(h.clipboard, "previous clipboard text");
      }
    });
  }
}

test("the multi-selection menu with no resources does not send the active editor", async () => {
  const h = commandHarness();
  await h.run("opencode.addExplorerSelectionToOpenCode");
  assert.deepEqual(h.inspected, []);
  assert.deepEqual(h.workspaceLookups, []);
  assert.deepEqual(h.executed, ["copyFilePath"]);
  assert.equal(h.clipboard, "previous clipboard text");
});

test("the multi-selection menu retains the clicked file if capture is empty", async () => {
  const h = commandHarness();
  const clicked = h.root.with({ path: `${h.root.path}/clicked.ts` });
  await h.run("opencode.addExplorerSelectionToOpenCode", clicked);
  assert.deepEqual(h.inspected, [clicked.path]);
  assert.equal(h.clipboard, "previous clipboard text");
});

test("an empty Explorer keyboard selection does not send the active editor", async () => {
  const h = commandHarness();
  await h.run("opencode.addToOpenCode", { fromExplorer: true });
  assert.deepEqual(h.inspected, []);
  assert.deepEqual(h.workspaceLookups, []);
  assert.deepEqual(h.executed, ["copyFilePath"]);
  assert.equal(h.clipboard, "previous clipboard text");
});

test("cancelling Add Files to OpenCode does not send the active editor", async () => {
  const h = commandHarness();
  h.setPickerResult(undefined);
  await h.run("opencode.addFilesToOpenCode");
  assert.deepEqual(h.inspected, []);
  assert.deepEqual(h.workspaceLookups, []);
  assert.deepEqual(h.executed, []);
});

test("the general Add to OpenCode command retains the active-editor fallback", async () => {
  const h = commandHarness();
  await h.run("opencode.addToOpenCode");
  assert.deepEqual(h.workspaceLookups, [h.active.path]);
  assert.deepEqual(h.inspected, []);
  assert.deepEqual(h.executed, ["workbench.view.extension.opencode"]);
});

test("an empty Explorer attachment selection does not attach the active editor or open a picker", async () => {
  const h = commandHarness();
  await h.run("opencode.attachToOpenCode", { fromExplorer: true });
  assert.deepEqual(h.inspected, []);
  assert.deepEqual(h.readFiles, []);
  assert.deepEqual(h.executed, ["copyFilePath"]);
  assert.equal(h.clipboard, "previous clipboard text");
  assert.equal(h.pickerCalls, 0);
});

test("a failed Explorer attachment capture restores the clipboard without attaching the active editor", async () => {
  const h = commandHarness();
  h.failCopyPaths();
  await h.run("opencode.attachToOpenCode", { fromExplorer: true });
  assert.deepEqual(h.inspected, []);
  assert.deepEqual(h.readFiles, []);
  assert.deepEqual(h.executed, ["copyFilePath"]);
  assert.equal(h.clipboard, "previous clipboard text");
  assert.equal(h.pickerCalls, 0);
  assert.ok(h.logs.some(line => line.includes("Attach to OpenCode could not read Explorer selection:") && line.includes("copyFilePath failed")));
});

test("the general Attach to OpenCode command retains the active-editor fallback", async () => {
  const h = commandHarness();
  await h.run("opencode.attachToOpenCode");
  assert.deepEqual(h.readFiles, [h.active.path]);
  assert.equal(h.executed.includes("copyFilePath"), false);
  assert.equal(h.pickerCalls, 0);
});

test("Attach Files to OpenCode retains the multi-file picker", async () => {
  const h = commandHarness();
  const first = h.root.with({ path: `${h.root.path}/first.png` });
  const second = h.root.with({ path: `${h.root.path}/second.pdf` });
  h.setPickerResult([first, second]);
  await h.run("opencode.attachFilesToOpenCode");
  assert.deepEqual(h.readFiles, [first.path, second.path]);
  assert.equal(h.executed.includes("copyFilePath"), false);
  assert.equal(h.pickerCalls, 1);
});

test("the Explorer Attach shortcut takes precedence and keeps the same keys on every platform", () => {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const bindings = manifest.contributes.keybindings as Array<{
    command: string; key: string; mac: string; win: string; linux: string;
    when?: string; args?: { fromExplorer?: boolean };
  }>;
  const general = bindings.find(binding => binding.command === "opencode.attachToOpenCode" && !binding.when);
  const explorer = bindings.find(binding => binding.command === "opencode.attachToOpenCode" && binding.args?.fromExplorer);
  assert.ok(general);
  assert.ok(explorer);
  assert.equal(explorer.when, "filesExplorerFocus && !inputFocus");
  assert.ok(bindings.indexOf(explorer) > bindings.indexOf(general));
  for (const key of ["key", "mac", "win", "linux"] as const) {
    assert.equal(explorer[key], general[key]);
  }
});

test("Explorer menus and editor use the same Add to OpenCode shortcuts on every platform", () => {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const bindings = manifest.contributes.keybindings as Array<{
    command: string; key: string; mac: string; win: string; linux: string;
    when?: string; args?: { fromExplorer?: boolean };
  }>;
  const general = bindings.find(binding => binding.command === "opencode.addToOpenCode" && !binding.when);
  const explorer = bindings.find(binding => binding.command === "opencode.addToOpenCode" && binding.args?.fromExplorer);
  const multiple = bindings.find(binding => binding.command === "opencode.addExplorerSelectionToOpenCode");
  assert.ok(general);
  assert.ok(explorer);
  assert.ok(multiple, "the multi-selection menu command must have a shortcut to display");
  assert.equal(explorer.when, "filesExplorerFocus && !inputFocus");
  assert.equal(multiple.when, "filesExplorerFocus && !inputFocus && listMultiSelection");
  assert.ok(bindings.indexOf(multiple) > bindings.indexOf(explorer), "multi-selection must take precedence in the Explorer");
  for (const key of ["key", "mac", "win", "linux"] as const) {
    assert.equal(explorer[key], general[key]);
    assert.equal(multiple[key], general[key]);
  }
});

test("Explorer menu routes multiple selection through a hidden command with the same title", () => {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const menus = manifest.contributes.menus as Record<string, Array<{ command: string; when?: string }>>;
  const single = menus["explorer/context"].find(item => item.command === "opencode.addToOpenCode");
  const multiple = menus["explorer/context"].find(item => item.command === "opencode.addExplorerSelectionToOpenCode");
  assert.ok(single);
  assert.ok(multiple);
  assert.equal(single.when, "!listMultiSelection");
  assert.equal(multiple.when, "listMultiSelection");
  const commands = manifest.contributes.commands as Array<{ command: string; title: string }>;
  const internal = commands.find(item => item.command === "opencode.addExplorerSelectionToOpenCode");
  assert.equal(internal?.title, "Add to OpenCode");
  assert.ok(menus.commandPalette.some(item => item.command === "opencode.addExplorerSelectionToOpenCode" && item.when === "false"));
});
