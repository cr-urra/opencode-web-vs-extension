// Ejecuta el bundle real con una API VS Code simulada. No prueba gestos ni renderizado.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { spawn as realSpawn } from "node:child_process"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"
import { Script } from "node:vm"

const evidence = dirname(fileURLToPath(import.meta.url))
const environment = JSON.parse(readFileSync(join(evidence, "entorno.json"), "utf8"))
const results = {}

async function serveWebapp() {
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const env = { ...process.env }
  for (const [variable, directory] of Object.entries({
    XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data", XDG_CACHE_HOME: "cache", XDG_STATE_HOME: "state",
  })) {
    env[variable] = join(environment.runtime, "webapp", directory)
    mkdirSync(env[variable], { recursive: true })
  }
  env.OPENCODE_SERVER_PASSWORD = readFileSync(join(environment.runtime, "macos-password.txt"), "utf8").trim()
  delete env.OPENCODE_SERVER_USERNAME
  const child = realSpawn(environment.openCodeExecutable, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: environment.workspace, env, stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  const save = chunk => {
    output += chunk.toString()
    writeFileSync(join(evidence, "logs/webapp-servidor.txt"), output.replace(/server password [^\s]+/g, "server password [redactado]"))
  }
  child.stdout.on("data", save)
  child.stderr.on("data", save)
  child.on("error", error => { console.error(error.message); process.exitCode = 1 })
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill("SIGTERM"))
  const url = `http://127.0.0.1:${port}/`
  writeFileSync(join(evidence, "webapp.json"), JSON.stringify({ url, pid: child.pid }, null, 2) + "\n")
  console.log(`Webapp independiente: ${url}`)
  await new Promise(resolve => child.once("exit", resolve))
}

async function check(variant) {
  const logs = ["HOST SIMULADO: estos logs no provienen de una ventana real de VSCodium."]
  const children = []
  const subscriptions = []
  const commands = new Map()
  const values = new Map()
  let provider
  let resolved = false
  let html = ""
  let timeout
  let complete
  let rejectStartup
  const ready = new Promise((resolve, reject) => {
    complete = resolve
    rejectStartup = reject
    timeout = setTimeout(() => reject(new Error("El bundle no produjo un iframe en 30 segundos")), 30_000)
  })
  // Evita un rechazo sin handler mientras se evalúa activate().
  void ready.catch(() => {})
  const disposable = () => ({ dispose() {} })
  const webview = {
    cspSource: "vscode-webview:",
    onDidReceiveMessage: disposable,
    async postMessage() { return true },
    get html() { return html },
    set html(value) {
      html = value
      if (value.includes('id="opencode-frame"')) complete()
    },
  }
  const uri = { fsPath: environment.workspace, scheme: "file", toString: () => `file://${environment.workspace}` }
  const vscode = {
    Disposable: class { constructor(callback) { this.dispose = callback } },
    window: {
      createOutputChannel: () => ({ appendLine: line => logs.push(line), dispose() {} }),
      registerWebviewViewProvider: (_id, value) => { provider = value; return disposable() },
      showErrorMessage: async message => { logs.push(`ERROR UI SIMULADA: ${message}`) },
      showWarningMessage: async message => { logs.push(`AVISO UI SIMULADA: ${message}`) },
      showInformationMessage: async () => undefined,
    },
    workspace: {
      workspaceFolders: [{ uri }],
      onDidChangeWorkspaceFolders: disposable,
      onDidChangeConfiguration: disposable,
      getConfiguration: () => ({ get: (_key, fallback) => environment.openCodeExecutable || fallback }),
    },
    commands: {
      registerCommand: (name, handler) => { commands.set(name, handler); return disposable() },
      async executeCommand(name) {
        if (name === "workbench.view.extension.opencode" && !resolved) {
          resolved = true
          provider.resolveWebviewView({ webview, onDidDispose: disposable, onDidChangeVisibility: disposable })
        }
      },
    },
    env: { clipboard: { readText: async () => "", writeText: async () => undefined } },
  }
  const state = join(environment.runtime, "smoke", variant)
  const childEnvironment = {}
  for (const [variable, directory] of Object.entries({
    XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data", XDG_CACHE_HOME: "cache", XDG_STATE_HOME: "state",
  })) {
    childEnvironment[variable] = join(state, directory)
    mkdirSync(childEnvironment[variable], { recursive: true })
  }
  const localRequire = createRequire(join(environment.variants[variant].directory, "dist/extension.js"))
  const customRequire = name => {
    if (name === "vscode") return vscode
    if (name === "child_process") return {
      spawn(executable, args, options) {
        const env = { ...options.env, ...childEnvironment }
        delete env.OPENCODE_SERVER_USERNAME
        if (variant === "macos") delete env.OPENCODE_SERVER_PASSWORD
        const child = realSpawn(executable, args, { ...options, env })
        children.push(child)
        child.on("error", error => {
          logs.push(`SPAWN ERROR: ${error.message}`)
          if (args[0] === "serve") rejectStartup(error)
        })
        if (args[0] === "serve") child.once("exit", code => {
          rejectStartup(new Error(`OpenCode terminó antes de crear el iframe (código ${code})`))
        })
        return child
      },
    }
    return localRequire(name)
  }
  const result = { mode: "bundle real + VS Code API simulada; OpenCode y proxy reales", passed: false }
  try {
    const module = { exports: {} }
    const bundle = readFileSync(join(environment.variants[variant].directory, "dist/extension.js"), "utf8")
    new Script(`(function(require,module,exports){${bundle}\n})`).runInThisContext()(customRequire, module, module.exports)
    module.exports.activate({
      subscriptions,
      workspaceState: { get: key => values.get(key), update: async (key, value) => values.set(key, value) },
    })
    await ready
    clearTimeout(timeout)
    const iframe = new URL(html.match(/<iframe[^>]+src="([^"]+)"/)[1])
    const appResponse = await fetch(iframe, { signal: AbortSignal.timeout(5000) })
    const app = await appResponse.text()
    const healthResponse = await fetch(`${iframe.origin}/global/health`, { signal: AbortSignal.timeout(5000) })
    const healthText = await healthResponse.text()
    let health
    try { health = JSON.parse(healthText) } catch {}
    const bootstrapResponse = await fetch(`${iframe.origin}/__opencode_extension_bootstrap.js`, { signal: AbortSignal.timeout(5000) })
    const bootstrap = await bootstrapResponse.text()
    new Script(bootstrap)
    Object.assign(result, {
      appStatus: appResponse.status,
      healthStatus: healthResponse.status,
      healthContentType: healthResponse.headers.get("content-type"),
      healthReturnsJson: health !== undefined,
      serverVersion: health?.version ?? environment.openCodeVersion,
      bootstrapStatus: bootstrapResponse.status,
      bootstrapInjected: app.includes('/__opencode_extension_bootstrap.js'),
      bootstrapSyntaxValid: true,
      iframeCarriesAuthToken: iframe.searchParams.has("auth_token"),
      parentKeyCapturePresent: html.includes("parent keydown captured"),
      parentDropCapturePresent: html.includes("parent drop resolved"),
      contenteditableRangeFallbackPresent: bootstrap.includes("clipboard inserted into contenteditable"),
    })
    result.passed = appResponse.ok && healthResponse.ok && bootstrapResponse.ok && result.bootstrapInjected
    logs.push(JSON.stringify(result, null, 2))
  } catch (error) {
    result.error = error.message
    logs.push(`FALLO: ${error.stack}`)
  } finally {
    clearTimeout(timeout)
    for (const subscription of subscriptions.reverse()) {
      try { subscription.dispose() } catch (error) { logs.push(`DISPOSE ERROR: ${error.message}`) }
    }
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }
    await Promise.all(children.map(child => new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return resolve()
      const deadline = setTimeout(() => { child.kill("SIGKILL"); resolve() }, 2000)
      child.once("exit", () => { clearTimeout(deadline); resolve() })
    })))
    writeFileSync(join(evidence, "logs", `${variant}-arranque-simulado.txt`), logs.join("\n") + "\n")
  }
  console.log(`${variant}: ${result.passed ? "PASS" : "FAIL"}`)
  return result
}

if (process.argv.includes("--webapp")) {
  await serveWebapp()
} else {
  for (const variant of ["raiz", "macos"]) results[variant] = await check(variant)
  writeFileSync(join(evidence, "arranque-simulado.json"), JSON.stringify(results, null, 2) + "\n")
  process.exitCode = Object.values(results).every(result => result.passed) ? 0 : 1
}
