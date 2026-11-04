import { createHash, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const evidence = dirname(fileURLToPath(import.meta.url))
const root = resolve(evidence, "../../..")
const mac = join(root, "mac-version/opencode-web-vs-extension-feature-clipboard-mac")
const logDirectory = join(evidence, "logs")
mkdirSync(logDirectory, { recursive: true })

function command(executable, args, cwd = root, options = {}) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", timeout: 120_000, ...options })
  return {
    command: [executable, ...args],
    exitCode: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}`,
  }
}

function saveCommand(name, executable, args, cwd = root) {
  const result = command(executable, args, cwd)
  writeFileSync(join(logDirectory, `${name}.txt`), result.output)
  console.log(`${name}: ${result.exitCode === 0 ? "PASS" : "FAIL"}`)
  return { command: result.command, exitCode: result.exitCode, log: `logs/${name}.txt` }
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

const runtime = mkdtempSync(join(tmpdir(), "opencode-macos-baseline-"))
const profileNames = Object.fromEntries(["raiz", "macos"].map(name => [name, `QA-${name}-${runtime.split("-").at(-1)}`]))
const macPassword = randomBytes(32).toString("base64url")
writeFileSync(join(runtime, "macos-password.txt"), macPassword, { mode: 0o600 })
const workspace = join(runtime, "workspace")
mkdirSync(workspace, { recursive: true })
writeFileSync(join(workspace, "contexto.txt"), "Fixture local de QA. No contiene datos personales.\nPrimera línea.\nSegunda línea.\n")
writeFileSync(join(workspace, "archivo con espacios ñ.txt"), "Referencia con espacios y Unicode: áéíóú ñ.\n")
writeFileSync(join(workspace, "imagen.png"), readFileSync(join(root, "images/icon.png")))

for (const variant of ["raiz", "macos"]) {
  const profile = join(runtime, "profiles", variant, "User")
  mkdirSync(profile, { recursive: true })
  mkdirSync(join(runtime, "extensions", variant), { recursive: true })
  for (const area of ["config", "data", "cache", "state"]) {
    mkdirSync(join(runtime, "opencode", variant, area), { recursive: true })
  }
  writeFileSync(join(profile, "settings.json"), JSON.stringify({
    "extensions.autoCheckUpdates": false,
    "extensions.autoUpdate": false,
    "update.mode": "none",
    "telemetry.telemetryLevel": "off",
    "workbench.startupEditor": "none",
    "window.restoreWindows": "none",
    "opencodeWeb.executablePath": "/opt/homebrew/bin/opencode",
  }, null, 2) + "\n")
}

const cli = "/Applications/VSCodium.app/Contents/Resources/app/bin/codium"
const versionEnvironment = { ...process.env }
for (const [variable, directory] of Object.entries({
  XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data", XDG_CACHE_HOME: "cache", XDG_STATE_HOME: "state",
})) versionEnvironment[variable] = join(runtime, "opencode", "raiz", directory)
const openCodeVersion = command("/opt/homebrew/bin/opencode", ["--version"], root, { env: versionEnvironment })
const installed = join(process.env.HOME, ".vscode-oss/extensions/extensions.json")
const environment = {
  capturedAtUtc: new Date().toISOString(),
  userTimezone: "America/Santiago",
  rootRevision: command("git", ["rev-parse", "HEAD"]).output.trim(),
  system: command("sw_vers", []).output.trim(),
  architecture: command("uname", ["-m"]).output.trim(),
  node: process.version,
  npm: command("npm", ["--version"]).output.trim(),
  bunInstalled: command("/bin/zsh", ["-c", "command -v bun"]).exitCode === 0,
  editor: { executable: cli, ...command(cli, ["--version"]) },
  openCodeExecutable: "/opt/homebrew/bin/opencode",
  openCodeVersion: openCodeVersion.exitCode === 0 ? openCodeVersion.output.trim() : null,
  openCodeVersionEvidence: openCodeVersion,
  originalProfileExtensions: existsSync(installed) ? json(installed).map(item => ({
    id: item.identifier.id, version: item.version,
  })) : [],
  toolchain: Object.fromEntries(["typescript", "esbuild", "eslint"].map(name => [
    name, json(join(root, "node_modules", name, "package.json")).version,
  ])),
  dependencyInstallation: "npm install --ignore-scripts --package-lock=false; ambas variantes usan la misma instalación. No se utilizó bun.lock como instalación congelada.",
  variants: Object.fromEntries([["raiz", root], ["macos", mac]].map(([name, directory]) => [name, {
    directory,
    profileName: profileNames[name],
    version: json(join(directory, "package.json")).version,
    extensionSourceSha256: hash(join(directory, "src/extension.ts")),
    lockSha256: hash(join(directory, "bun.lock")),
  }])),
  runtime,
  workspace,
  gui: { status: "not-executed", reason: "Este script prepara la comparación; no realiza gestos de interfaz." },
}
writeFileSync(join(evidence, "entorno.json"), JSON.stringify(environment, null, 2) + "\n")
mkdirSync(join(workspace, ".vscode"), { recursive: true })
writeFileSync(join(workspace, ".vscode/launch.json"), JSON.stringify({
  version: "0.2.0",
  configurations: Object.entries(environment.variants).map(([variant, info]) => ({
    name: `QA ${variant} ${info.version}`,
    type: "extensionHost",
    request: "launch",
    runtimeExecutable: "${execPath}",
    args: [
      `--user-data-dir=${join(runtime, "profiles", variant)}`,
      `--extensions-dir=${join(runtime, "extensions", variant)}`,
      `--profile=${info.profileName}`,
      `--extensionDevelopmentPath=${info.directory}`,
      `--folder-uri=${pathToFileURL(workspace).href}`,
    ],
    env: {
      XDG_CONFIG_HOME: join(runtime, "opencode", variant, "config"),
      XDG_DATA_HOME: join(runtime, "opencode", variant, "data"),
      XDG_CACHE_HOME: join(runtime, "opencode", variant, "cache"),
      XDG_STATE_HOME: join(runtime, "opencode", variant, "state"),
      OPENCODE_SERVER_USERNAME: null,
      OPENCODE_SERVER_PASSWORD: variant === "macos" ? macPassword : null,
    },
    outFiles: [join(info.directory, "dist/**/*.js")],
  })),
}, null, 2) + "\n")

const tsc = join(root, "node_modules/typescript/bin/tsc")
const eslint = join(root, "node_modules/eslint/bin/eslint.js")
const results = {}
for (const [name, directory] of [["raiz", root], ["macos", mac]]) {
  const checks = []
  checks.push(saveCommand(`${name}-tipos`, process.execPath, [
    tsc, "-p", join(directory, "tsconfig.json"), "--outDir", join(directory, "out"),
    "--typeRoots", join(root, "node_modules/@types"),
  ], directory))
  const tests = readdirSync(join(directory, "src"))
    .filter(file => file.endsWith(".test.ts"))
    .map(file => join(directory, "out", file.replace(/\.ts$/, ".js")))
  checks.push(saveCommand(`${name}-unitarias`, process.execPath, ["--test", ...tests], directory))
  const lint = saveCommand(`${name}-lint`, process.execPath, [eslint, "src", "--format", "json"], directory)
  try {
    const diagnostics = json(join(evidence, lint.log))
    lint.errors = diagnostics.reduce((sum, file) => sum + file.errorCount, 0)
    lint.warnings = diagnostics.reduce((sum, file) => sum + file.warningCount, 0)
  } catch {}
  checks.push(lint)
  checks.push(saveCommand(`${name}-build`, process.execPath, [join(directory, "esbuild.js"), "--production"], directory))
  results[name] = {
    checks,
    allPassed: checks.every(check => check.exitCode === 0),
    bundleSha256: existsSync(join(directory, "dist/extension.js")) ? hash(join(directory, "dist/extension.js")) : null,
  }
}
writeFileSync(join(evidence, "resultados-automaticos.json"), JSON.stringify(results, null, 2) + "\n")
const dependencies = command("npm", ["ls", "--all", "--json"])
writeFileSync(join(evidence, "dependencias.json"), dependencies.output)
console.log(`Perfiles y fixtures: ${runtime}`)
console.log("Las pruebas gráficas se ejecutan aparte, mediante los perfiles preparados.")
process.exitCode = Object.values(results).every(result => result.allPassed) ? 0 : 1
