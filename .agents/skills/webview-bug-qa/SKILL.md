---
name: webview-bug-qa
description: Test, debug, or verify a fix in this VS Code extension (paste/clipboard/drag-and-drop/focus and other webview issues) with a traceable evidence trail. Use when asked to test, reproduce, or debug a bug in the extension; verify a fix before it ships; package a .vsix for manual testing; or produce a QA evidence report with screenshots.
---

This extension wraps the OpenCode webapp inside a VS Code webview iframe. Most reported
bugs (paste, clipboard, drag-and-drop, focus) live at the seam between those two layers,
not inside either one alone — so the first move is finding out which side actually owns
the defect, not editing `src/extension.ts`.

## 1. Bisect the stack

Before touching code, reproduce the reported interaction **outside VS Code**, against the
bare OpenCode webapp:

```bash
opencode serve --port <random-port>
```

Load the `playwright-cli` skill and drive a real browser against
`http://127.0.0.1:<port>/` — reproduce the *exact* reported interaction, including timing
("works fast, fails after a few seconds" means wait before acting, not click-and-go).
Screenshot every state you check; save each shot straight into the evidence folder (step 3)
as you go, not at the end.

Completion criterion: you can state, with the screenshots as evidence, whether the defect
reproduces in the bare webapp. "Inconclusive" doesn't count — either it reproduces (the fix
belongs in the OpenCode webapp, out of this repo's reach) or it doesn't (the fix belongs in
`src/extension.ts`'s webview/host bridge, or it's a VS Code/Electron core limitation this
repo can only work around defensively, never fix outright).

Close the browser and kill the server before moving on. Delete `.playwright-cli/` — it is
scratch output and must never ship inside a `.vsix` (step 2).

## 2. Verify and package

```bash
bun run check-types
bun run lint
node esbuild.js
```

Zero type errors block you; the pre-existing lint warnings (missing semicolons) are known
repo style, not your concern. Then:

```bash
bunx --bun @vscode/vsce package --no-dependencies --skip-license -o dist/<slug>.vsix
```

Never run `vsce publish` or `script/publish` — those ship to the real marketplace. Read the
"Files included in the VSIX" tree `vsce` prints and check it against the "Revisión de
artefacto" checklist in `docs/sop/validacion.md`. If anything unintended got swept in,
delete it and repackage before calling this step done.

Before trusting any "still doesn't work" result: run `code --list-extensions --show-versions
| grep -i opencode`. Two entries means the installed build and the Marketplace one are fighting
over the same view and the fix may never have activated at all — see "Dos versiones instaladas
al mismo tiempo" in `docs/sop/troubleshooting.md`.

## 3. Leave a paper trail

Every scenario you claim to have tested needs a screenshot and a verdict — a scenario
mentioned without either is not tested. Put both in one place:

```
docs/qa/<yyyymmdd>-<slug>/
  reporte.md
  01-<scenario>.png
  02-<scenario>.png
  ...
```

For the bare-webapp layer, screenshots come from `playwright-cli screenshot`. For the real
VS Code host (Extension Development Host or the packaged `.vsix`), use `screencapture` on
this Mac when a GUI session is available; when it isn't, that scenario's evidence is the
Output-channel log excerpt instead — say so explicitly, don't fake a screenshot.

`reporte.md` covers, per scenario: objetivo, pasos ejecutados, captura o log embebido,
veredicto (pass / fail / no reproducido), y si se verificó directamente o queda pendiente
de confirmar en hardware real que este entorno no tiene — ese es el contexto que el humano
en el loop necesita para confiar en el resultado sin repetir el trabajo. Reuse the
scenarios already defined in `docs/sop/validacion.md` instead of re-deriving them; extend
that file with a new scenario when a bug reveals one that isn't covered yet, rather than
duplicating it here.

For the exact strings a given fix logs, read the `report(...)` / `wrapperLog(...)` calls in
`src/extension.ts` directly — don't copy them into this skill, they drift with the code.

Completion criterion: `docs/qa/<slug>/reporte.md` exists, every scenario it lists has a
matching screenshot (or an explicit "log-only, no GUI available" note) in the same folder,
and every scenario has a verdict.
