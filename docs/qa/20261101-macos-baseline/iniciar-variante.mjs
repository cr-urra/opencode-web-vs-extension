import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const variant = process.argv[2]
if (!["raiz", "macos"].includes(variant)) {
  console.error("Uso: node docs/qa/20261101-macos-baseline/iniciar-variante.mjs raiz|macos")
  process.exit(1)
}
const evidence = dirname(fileURLToPath(import.meta.url))
const environment = JSON.parse(readFileSync(join(evidence, "entorno.json"), "utf8"))
const { runtime, workspace } = environment
const directory = environment.variants[variant].directory
if (!existsSync(workspace) || !existsSync(join(directory, "dist/extension.js"))) {
  console.error("Faltan perfiles, fixtures o build. Ejecuta preparar-baseline.mjs primero.")
  process.exit(1)
}
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(runtime, "opencode", variant, "config"),
  XDG_DATA_HOME: join(runtime, "opencode", variant, "data"),
  XDG_CACHE_HOME: join(runtime, "opencode", variant, "cache"),
  XDG_STATE_HOME: join(runtime, "opencode", variant, "state"),
}
delete env.OPENCODE_SERVER_PASSWORD
delete env.OPENCODE_SERVER_USERNAME
if (variant === "macos") env.OPENCODE_SERVER_PASSWORD = readFileSync(join(runtime, "macos-password.txt"), "utf8").trim()
const result = spawnSync(environment.editor.executable, [
  `--user-data-dir=${join(runtime, "profiles", variant)}`,
  `--extensions-dir=${join(runtime, "extensions", variant)}`,
  `--profile=${environment.variants[variant].profileName ?? `QA-${variant}-20261101`}`,
  "--new-window", `--extensionDevelopmentPath=${directory}`, `--folder-uri=${pathToFileURL(workspace).href}`,
], { env, stdio: "inherit" })
process.exitCode = result.status ?? 1
