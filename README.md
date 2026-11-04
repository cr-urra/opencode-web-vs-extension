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

Windows and Linux file shortcuts use two-step chords to avoid `Ctrl+Alt` / AltGr conflicts on international keyboard layouts. For example, `Ctrl+K`, then `Shift+S` means press `Ctrl+K`, release both keys, and press `Shift+S`. These shortcuts are intended for the IDE editor and Explorer. macOS shortcuts are unchanged.

### File References

- `OpenCode: Send to OpenCode`
  - Linux/Windows: `Ctrl+K`, then `Shift+S`
  - macOS: `Cmd+Alt+S`
  - Sends the active file or Explorer selection to OpenCode as file references.
  - With focus in the Explorer, sends all selected files, just like the `Add to OpenCode` context-menu action. With focus in the editor, sends the active file and selected line range.
  - The Explorer context menu displays the same shortcut for both single and multiple selections.

- `OpenCode: Send Files to OpenCode`
  - Linux/Windows: `Ctrl+K`, then `Shift+M`
  - macOS: `Cmd+Alt+Shift+S`
  - Opens a native file picker and sends multiple selected files to OpenCode as references.

### Visual Attachments

- `OpenCode: Attach to OpenCode`
  - Linux/Windows: `Ctrl+K`, then `Shift+A`
  - macOS: `Cmd+Alt+A`
  - Attaches the active file or Explorer selection to OpenCode.
  - With focus in the Explorer, attaches all selected files, just like the context-menu action. With focus in the editor, attaches the active file.

- `OpenCode: Attach Files to OpenCode`
  - Windows: `Ctrl+Shift+A`
  - Linux: `Ctrl+K`, then `Shift+F` (avoids the editor's `Ctrl+Shift+A` block-comment shortcut)
  - macOS: `Cmd+Shift+A`
  - Opens a native file picker and attaches multiple selected files to OpenCode.

### Active File Mention

- `Add Filepath to Terminal`
  - Linux/Windows: `Ctrl+K`, then `Shift+K`
  - macOS: `Cmd+Alt+K`
  - Inserts the active file path, including selected line ranges when available.

After updating the extension, reload the IDE window to load the new bindings. Custom user keybindings take precedence; use **Keyboard Shortcuts** and **Show Same Keybindings** to check conflicts. **Developer: Toggle Keyboard Shortcuts Troubleshooting** shows which keys the IDE receives and which command it invokes.

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

The paste bridge preserves the original editable field and selection while reading the clipboard. It ignores repeated or expired responses and stops if the field is removed or becomes read-only. It first dispatches a plain-text paste event to the frontend, then tries `execCommand("insertText")` if the event is not handled. If both methods fail, it logs the failure without directly rewriting the field value or inserting DOM nodes. Selection/Range is still used to capture and restore the caret or selection.

Clipboard editing and active-session restoration were tested with OpenCode 2.2.5 on macOS using VSCodium. Other OpenCode versions, the legacy UI, and Windows/Linux have not been graphically validated for these changes.

## File Transfer Strategy

Natural drag/drop from VS Code into iframe-based webviews is inconsistent across platforms, especially on macOS. This extension uses reliable VS Code APIs and webview message bridges for file transfer:

- Source files can be sent as OpenCode file references.
- Images, PDFs, and binary files can be attached as visual file drops.
- File references and attachments support Explorer multi-selection through both the context menu and keyboard shortcut. Native file pickers also support multi-file reference and attachment workflows.
- If the multi-selection context menu receives an incomplete resource list, it recovers the Explorer selection and verifies that it includes the clicked resource before sending the references.

Explorer selection handling supports Windows drive and UNC paths, LF/CRLF line endings, and the `explorer.copyPathSeparator` setting. With the default separator on Linux and macOS, literal backslashes in filenames are preserved. Windows selection matching ignores path casing; Linux selection matching is case-sensitive.

The Explorer reference and attachment shortcuts, and reference menu-selection recovery, temporarily use the IDE's Copy Path command and restore the previous clipboard text. The VS Code clipboard API cannot restore images or other non-text clipboard formats. Context menus with complete resource arguments do not use the clipboard.

For reference-selection issues, open **View → Output → OpenCode**. The log records the command source, platform, selected-resource count, resolved references, and paths sent to the webview. This distinguishes selection issues from frontend delivery issues.

## Requirements

- VS Code or VSCodium `1.94.0` or newer.
- The `opencode` CLI must be installed. The extension detects it in `PATH` and standard installation locations.

## OpenCode Executable

The extension automatically checks `PATH`, `OPENCODE_INSTALL_DIR`, `XDG_BIN_DIR`, `~/bin`, `~/.local/bin`, `~/.opencode/bin`, and common package-manager locations.

If OpenCode is installed elsewhere, set `opencodeWeb.executablePath` to its absolute path in VS Code or VSCodium settings. This is a machine-specific setting, so local, SSH, WSL, and development-container environments can each use their own executable.

## Compatibility Checks

Run `npm run test:unit` for the automated tests and `npm run package` for type checking, linting, and the production build. The file-command tests simulate Windows, Linux, and macOS, including Explorer multi-selection, clipboard restoration, path casing, Unicode names, and custom Copy Path separators.

The [cross-platform workflow](.github/workflows/cross-platform.yml) is configured to run both commands on Windows, Linux, and macOS runners for pushes and pull requests. These automated checks do not exercise the native Explorer UI or clipboard; end-to-end verification still requires VS Code or VSCodium on each operating system.

## Author And Publisher

The original and official OpenCode project is authored by **sst-dev**. This extension is an unofficial VS Code/VSCodium integration and is published by **UWEsmith**.

## Acknowledgements

This extension is built as a companion to the OpenCode agent project developed by **sst-dev**. Special thanks and full credit go to sst-dev and the OpenCode contributors for creating the underlying agent and web experience that this extension integrates into VS Code and VSCodium.
