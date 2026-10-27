# OpenCode Web IDE (Unofficial)

OpenCode Web IDE is a VS Code and VSCodium extension that complements and is based on the OpenCode agent project developed by **sst-dev**. This extension exists thanks to the OpenCode work from sst-dev and the broader OpenCode project; all credit and gratitude go to them for building the agent experience this extension integrates into the IDE.

The extension embeds the OpenCode web interface inside a VS Code/VSCodium sidebar, starts or connects to an OpenCode server, and adds IDE-specific bridges for file references, attachments, clipboard behavior, and platform-specific webview limitations.

## Features

- Runs OpenCode inside a dedicated Activity Bar sidebar view.
- Starts `opencode serve` automatically for the current workspace.
- Seeds OpenCode with the current workspace context.
- Supports VS Code and VSCodium.
- Adds selected or active files to OpenCode as file references.
- Attaches files visually to OpenCode as browser `File` drops, useful for images, PDFs, and binary files.
- Attaches the active terminal's scrollback to OpenCode as a text file from the terminal context menu.
- Restores the OpenCode v2 tabs and active session for each workspace after restarting VS Code.
- Supports multi-file attach and multi-file reference flows through native file pickers.
- Normalizes file drag/drop payloads inside the embedded webview when the platform provides usable drop data.
- Bridges clipboard read/write behavior between VS Code and the embedded OpenCode web UI.
- Adds macOS-specific handling for common shortcuts that are unreliable in VS Code webview iframes.

## Commands And Shortcuts

### File References

- `OpenCode: Send to OpenCode`
  - Linux/Windows: `Ctrl+Alt+S`
  - macOS: `Cmd+Alt+S`
  - Sends the active file or Explorer selection to OpenCode as file references.

- `OpenCode: Send Files to OpenCode`
  - Linux/Windows: `Ctrl+Alt+Shift+S`
  - macOS: `Cmd+Alt+Shift+S`
  - Opens a native file picker and sends multiple selected files to OpenCode as references.

### Visual Attachments

- `OpenCode: Attach to OpenCode`
  - Linux/Windows: `Ctrl+Alt+A`
  - macOS: `Cmd+Alt+A`
  - Attaches the active file or Explorer selection to OpenCode.

- `OpenCode: Attach Files to OpenCode`
  - Linux/Windows: `Ctrl+Shift+A`
  - macOS: `Cmd+Shift+A`
  - Opens a native file picker and attaches multiple selected files to OpenCode.

### Active File Mention

- `Add Filepath to Terminal`
  - Linux/Windows: `Ctrl+Alt+K`
  - macOS: `Cmd+Alt+K`
  - Inserts the active file path, including selected line ranges when available.

### Terminal Context

- Right-click inside the active terminal and select `Send Terminal Contents to OpenCode`.
- The extension selects and copies the terminal buffer, restores the previous clipboard text, and attaches the captured content as `terminal-output.txt`.
- Very large terminal buffers are limited to the latest 100,000 characters.

## macOS Webview Support

VS Code and VSCodium webviews can be inconsistent on macOS when common editing shortcuts are used inside iframe content. OpenCode Web IDE adds a macOS-only bridge for:

- `Cmd+C`
- `Cmd+X`
- `Cmd+V`
- `Cmd+A`
- `Cmd+Z`
- `Shift+Cmd+Z`

This bridge is intentionally limited to macOS so Linux and Windows keep their native webview behavior.

## File Transfer Strategy

Natural drag/drop from VS Code into iframe-based webviews is inconsistent across platforms, especially on macOS. This extension uses reliable VS Code APIs and webview message bridges for file transfer:

- Source files can be sent as OpenCode file references.
- Images, PDFs, and binary files can be attached as visual file drops.
- Multi-file workflows use native file pickers when keyboard shortcuts cannot access Explorer multi-selection reliably.

## Requirements

- VS Code or VSCodium `1.94.0` or newer.
- The `opencode` CLI must be installed. The extension detects it in `PATH` and standard installation locations.

## OpenCode Executable

The extension automatically checks `PATH`, `OPENCODE_INSTALL_DIR`, `XDG_BIN_DIR`, `~/bin`, `~/.local/bin`, `~/.opencode/bin`, and common package-manager locations.

If OpenCode is installed elsewhere, set `opencodeWeb.executablePath` to its absolute path in VS Code or VSCodium settings. This is a machine-specific setting, so local, SSH, WSL, and development-container environments can each use their own executable.

## Author And Publisher

The original and official OpenCode project is authored by **sst-dev**. This extension is an unofficial VS Code/VSCodium integration and is published by **UWEsmith**.

## Acknowledgements

This extension is built as a companion to the OpenCode agent project developed by **sst-dev**. Special thanks and full credit go to sst-dev and the OpenCode contributors for creating the underlying agent and web experience that this extension integrates into VS Code and VSCodium.
