import { randomUUID } from "node:crypto";

interface ExplorerSelectionClipboard {
  readText(): PromiseLike<string>;
  writeText(text: string): PromiseLike<void>;
  copyPaths(): PromiseLike<unknown>;
}

// VS Code does not pass Explorer resources to commands invoked by a keybinding.
// Its built-in copyFilePath command reads the focused Explorer's full selection.
export function createExplorerSelectionReader(clipboard: ExplorerSelectionClipboard) {
  let pending: Promise<string[]> | undefined;

  return () => {
    if (pending) {
      return pending;
    }
    // Reuse a capture already in flight: its caller may focus the sidebar as soon
    // as it completes, so a queued Copy Path could read the wrong selection.
    pending = (async () => {
      const previous = await clipboard.readText();
      const marker = `__OPENCODE_EXPLORER_SELECTION_${randomUUID()}__`;
      let copied = marker;
      await clipboard.writeText(marker);
      try {
        await clipboard.copyPaths();
        copied = await clipboard.readText();
        return copied === marker ? [] : copied.split(/\r?\n/).filter(line => line.length > 0);
      } finally {
        // Do not replace something the user copied while the command was running.
        const current = await clipboard.readText();
        if (current === marker || current === copied) {
          await clipboard.writeText(previous);
        }
      }
    })().finally(() => { pending = undefined; });
    return pending;
  };
}

interface WorkspaceUri<T> {
  fsPath: string;
  path: string;
  with(change: { path: string }): T;
}

export function copiedPathsToWorkspaceUris<T extends WorkspaceUri<T>>(
  paths: readonly string[],
  roots: readonly T[],
  platform: NodeJS.Platform = process.platform,
  copyPathSeparator = "auto",
): T[] {
  // A backslash is a legal filename character on POSIX. Only interpret it as a
  // separator on Windows, or when Copy Path was explicitly configured to use it.
  const normalize = (value: string, backslashes = platform === "win32") =>
    (backslashes ? value.replace(/\\/g, "/") : value).replace(/\/+$/, "");
  const key = (value: string) => platform === "win32" ? value.toLowerCase() : value;
  const folders = roots.map(uri => ({ uri, path: normalize(uri.fsPath) }))
    .sort((left, right) => right.path.length - left.path.length);
  const seen = new Set<string>();
  const uris: T[] = [];

  for (const copied of paths) {
    const filepath = normalize(copied, platform === "win32" || copyPathSeparator === "\\");
    const folder = folders.find(root => key(filepath) === key(root.path) || key(filepath).startsWith(key(root.path) + "/"));
    if (!folder || seen.has(key(filepath))) {
      continue;
    }
    seen.add(key(filepath));
    const suffix = filepath.slice(folder.path.length);
    uris.push(folder.uri.with({ path: folder.uri.path.replace(/\/+$/, "") + suffix || "/" }));
  }

  return uris;
}
