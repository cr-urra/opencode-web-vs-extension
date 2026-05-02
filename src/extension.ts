// This method is called when your extension is deactivated
export function deactivate() {}

import * as vscode from "vscode"
import * as path from "path"
import * as http from "http"
import * as net from "net"
import { spawn, type ChildProcess } from "child_process"

const SIDEBAR_VIEW_ID = "opencode.sidebar"
const SIDEBAR_CONTAINER_COMMAND = "workbench.view.extension.opencode"

export function activate(context: vscode.ExtensionContext) {
  let sidebarPort: number | undefined
  let sidebarProcess: ChildProcess | undefined
  let proxyServer: http.Server | undefined
  let proxyPort: number | undefined
  let workspaceContextPort: number | undefined
  let workspaceRoot: string | undefined
  let sidebarWebview: vscode.Webview | undefined
  const output = vscode.window.createOutputChannel("OpenCode")

  log("Activating extension")

  const sidebarDisposable = vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, {
    resolveWebviewView(view) {
      sidebarWebview = view.webview
      view.webview.options = {
        enableScripts: true,
      }
      log("Resolving sidebar webview")
      view.onDidChangeVisibility(() => {
        if (view.visible) {
          void loadSidebar(view.webview)
        }
      })
      void loadSidebar(view.webview)
    },
  })

  const workspaceFoldersDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    void reloadSidebarIfWorkspaceRootChanged()
  })

  let addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    if (!sidebarPort || !(await waitForServer(sidebarPort))) {
      return
    }

    await appendPrompt(sidebarPort, fileRef)
  })

  context.subscriptions.push(
    output,
    sidebarDisposable,
    workspaceFoldersDisposable,
    addFilepathDisposable,
    new vscode.Disposable(() => stopSidebarProcess()),
  )

  void openSidebarOnStartup()

  async function openSidebarOnStartup() {
    await new Promise((resolve) => setTimeout(resolve, 500))

    try {
      log("Opening sidebar container")
      await vscode.commands.executeCommand(SIDEBAR_CONTAINER_COMMAND)
    } catch (error) {
      log(`Failed to open sidebar container: ${formatError(error)}`)
    }
  }

  async function loadSidebar(webview: vscode.Webview) {
    if (sidebarPort && (await waitForServer(sidebarPort))) {
      log(`Reusing opencode server on port ${sidebarPort}`)
      proxyPort = proxyPort ?? (await startProxyServer(sidebarPort, workspaceRoot))
      webview.html = await getWebviewHtml(webview, proxyPort)
      return
    }

    webview.html = getLoadingHtml(webview)
    sidebarPort = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
    stopSidebarProcess()
    proxyPort = undefined
    workspaceContextPort = undefined
    workspaceRoot = await waitForWorkspaceRoot()
    log(`Resolved workspace root: ${workspaceRoot ?? "<none>"}`)
    const processEnv = {
      ...process.env,
      _EXTENSION_OPENCODE_PORT: sidebarPort.toString(),
      OPENCODE_CALLER: "vscode",
      ...(workspaceRoot ? { PWD: workspaceRoot, INIT_CWD: workspaceRoot } : {}),
    }
    sidebarProcess = spawn("opencode", ["serve", "--port", sidebarPort.toString()], {
      cwd: workspaceRoot,
      env: processEnv,
      shell: process.platform === "win32",
      stdio: "ignore",
    })
    log(`Started opencode serve on port ${sidebarPort} with cwd ${workspaceRoot ?? "<default>"}`)
    sidebarProcess.once("exit", () => {
      log(`opencode serve exited on port ${sidebarPort}`)
      sidebarProcess = undefined
    })

    if (await waitForServer(sidebarPort)) {
      log(`opencode server is ready on port ${sidebarPort}`)
      proxyPort = await startProxyServer(sidebarPort, workspaceRoot)
      await appendWorkspaceContext(sidebarPort)
      webview.html = await getWebviewHtml(webview, proxyPort)
      return
    }

    log(`opencode server did not become ready on port ${sidebarPort}`)
    webview.html = getErrorHtml(webview)
  }

  function stopSidebarProcess() {
    proxyServer?.close()
    proxyServer = undefined
    sidebarProcess?.kill()
    sidebarProcess = undefined
  }

  async function startProxyServer(targetPort: number, directory?: string) {
    proxyServer?.close()

    const server = http.createServer((request, response) => {
      if (request.url?.startsWith("/__opencode_extension_log")) {
        const url = new URL(request.url, "http://127.0.0.1")
        log(`Injected script: ${url.searchParams.get("message") ?? "<empty>"}`)
        response.writeHead(204)
        response.end()
        return
      }

      if (request.url === "/__opencode_extension_clipboard" && request.method === "POST") {
        const chunks: Buffer[] = []
        request.on("data", (chunk: Buffer) => chunks.push(chunk))
        request.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          vscode.env.clipboard.writeText(text).then(
            () => {
              log(`Clipboard write proxied: ${text.length} chars`)
              response.writeHead(204)
              response.end()
            },
            (error) => {
              log(`Clipboard write failed: ${formatError(error)}`)
              response.writeHead(500)
              response.end("Clipboard write failed")
            },
          )
        })
        return
      }

      if (request.url === "/__opencode_extension_bootstrap.js") {
        log("Serving injected workspace bootstrap script")
        response.writeHead(200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        })
        response.end(getWorkspaceBootstrapScript(directory))
        return
      }

      const headers = { ...request.headers }
      delete headers["accept-encoding"]

      const proxyRequest = http.request(
        {
          hostname: "127.0.0.1",
          port: targetPort,
          path: request.url,
          method: request.method,
          headers,
        },
        (proxyResponse) => {
          const contentType = proxyResponse.headers["content-type"]
          const shouldInject = request.method === "GET" && typeof contentType === "string" && contentType.includes("text/html")

          if (!shouldInject) {
            response.writeHead(proxyResponse.statusCode ?? 500, proxyResponse.headers)
            proxyResponse.pipe(response)
            return
          }

          const chunks: Buffer[] = []
          proxyResponse.on("data", (chunk: Buffer) => chunks.push(chunk))
          proxyResponse.on("end", () => {
            const html = Buffer.concat(chunks).toString("utf8")
            const injectedHtml = injectOpenProjectDeepLink(html, directory)
            log(`Proxy ${injectedHtml === html ? "did not inject" : "injected"} workspace bootstrap into HTML`)
            const responseHeaders = { ...proxyResponse.headers }
            delete responseHeaders["content-length"]
            response.writeHead(proxyResponse.statusCode ?? 200, responseHeaders)
            response.end(injectedHtml)
          })
        },
      )

      proxyRequest.on("error", (error) => {
        log(`Proxy request failed: ${formatError(error)}`)
        response.writeHead(502)
        response.end("Bad Gateway")
      })

      request.pipe(proxyRequest)
    })

    server.on("upgrade", (request, socket, head) => {
      log(`Proxy websocket upgrade: ${request.url ?? "<unknown>"}`)
      const targetSocket = net.connect(targetPort, "127.0.0.1", () => {
        const headers = Object.entries(request.headers)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value ?? ""}`)
          .join("\r\n")
        targetSocket.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers}\r\n\r\n`)
        if (head.length) {
          targetSocket.write(head)
        }
        socket.pipe(targetSocket)
        targetSocket.pipe(socket)
      })

      targetSocket.on("error", (error) => {
        log(`Proxy websocket failed: ${formatError(error)}`)
        socket.destroy()
      })
    })

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve)
    })

    proxyServer = server
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Could not start opencode proxy")
    }

    log(`Started opencode proxy on port ${address.port}`)
    return address.port
  }

  function injectOpenProjectDeepLink(html: string, directory?: string) {
    if (!directory) {
      return html
    }

    const script = `<script src="/__opencode_extension_bootstrap.js"></script>`
    return html.replace(/<head([^>]*)>/i, `<head$1>${script}`)
  }

  function getWorkspaceBootstrapScript(directory?: string) {
    return `(function(){function report(message){try{fetch("/__opencode_extension_log?message="+encodeURIComponent(message)).catch(function(){})}catch(error){}}function installClipboardBridge(){try{var existing=navigator.clipboard||{};var bridged=Object.assign({},existing,{writeText:function(text){return fetch("/__opencode_extension_clipboard",{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:String(text)}).then(function(response){if(!response.ok)throw new Error("Clipboard bridge failed: "+response.status);report("clipboard bridged "+String(text).length+" chars")})}});Object.defineProperty(navigator,"clipboard",{value:bridged,configurable:true});report("clipboard bridge installed")}catch(error){report("clipboard bridge failed: "+(error&&error.message?error.message:String(error)))}}var dir=${JSON.stringify(directory)};var key="opencode.global.dat:server";installClipboardBridge();try{report("bootstrap executing for "+dir);var before=localStorage.getItem(key);var data=JSON.parse(before||"{}");var projects=data.projects&&typeof data.projects==="object"?data.projects:{};var local=Array.isArray(projects.local)?projects.local.filter(function(project){return project&&project.worktree!==dir}):[];projects.local=[{worktree:dir,expanded:true}].concat(local);data.list=Array.isArray(data.list)?data.list:[];data.projects=projects;data.lastProject=Object.assign({},data.lastProject,{local:dir});localStorage.setItem(key,JSON.stringify(data));report("seeded "+key+" local="+projects.local.map(function(project){return project.worktree}).join(","))}catch(error){report("seed failed: "+(error&&error.message?error.message:String(error)))}})();`
  }

  async function appendPrompt(port: number, text: string) {
    log(`Appending prompt to opencode on port ${port}: ${text.split("\n")[0]}`)
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    })
  }

  async function appendWorkspaceContext(port: number) {
    if (workspaceContextPort === port) {
      return
    }

    const workspaceContext = getWorkspaceContext()
    if (!workspaceContext) {
      return
    }

    workspaceContextPort = port
    await appendPrompt(port, workspaceContext)
  }

  async function appendUpdatedWorkspaceContext() {
    if (!sidebarPort || !(await waitForServer(sidebarPort))) {
      return
    }

    const workspaceContext = getWorkspaceContext("Updated workspace context")
    if (!workspaceContext) {
      return
    }

    await appendPrompt(sidebarPort, workspaceContext)
  }

  async function reloadSidebarIfWorkspaceRootChanged() {
    const nextWorkspaceRoot = getWorkspaceRoot()
    if (nextWorkspaceRoot === workspaceRoot) {
      log(`Workspace root unchanged: ${workspaceRoot ?? "<none>"}`)
      await appendUpdatedWorkspaceContext()
      return
    }

    log(`Workspace root changed from ${workspaceRoot ?? "<none>"} to ${nextWorkspaceRoot ?? "<none>"}`)
    sidebarPort = undefined
    proxyPort = undefined
    workspaceContextPort = undefined
    workspaceRoot = undefined
    stopSidebarProcess()

    if (sidebarWebview) {
      await loadSidebar(sidebarWebview)
    }
  }

  function getWorkspaceContext(title = "Workspace context") {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders?.length) {
      return
    }

    const folders = workspaceFolders.map((folder) => `- ${folder.uri.fsPath}`).join("\n")
    return `${title}:\n${folders}`
  }

  function getWorkspaceRoot() {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders?.length) {
      return
    }

    const folderPaths = workspaceFolders.map((folder) => folder.uri.fsPath)
    return getCommonParentPath(folderPaths)
  }

  async function waitForWorkspaceRoot() {
    const existingWorkspaceRoot = getWorkspaceRoot()
    if (existingWorkspaceRoot) {
      return existingWorkspaceRoot
    }

    const timeoutMs = 5000
    const intervalMs = 100
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))

      const workspaceRoot = getWorkspaceRoot()
      if (workspaceRoot) {
        return workspaceRoot
      }
    }

    return undefined
  }

  function getCommonParentPath(paths: string[]) {
    const [firstPath, ...otherPaths] = paths.map((folderPath) => path.resolve(folderPath))
    if (!firstPath) {
      return
    }

    const firstParts = firstPath.split(path.sep).filter(Boolean)
    let commonParts = [...firstParts]

    for (const folderPath of otherPaths) {
      const parts = folderPath.split(path.sep).filter(Boolean)
      let index = 0
      while (index < commonParts.length && commonParts[index] === parts[index]) {
        index++
      }
      commonParts = commonParts.slice(0, index)
    }

    const root = path.parse(firstPath).root
    return path.join(root, ...commonParts)
  }

  async function waitForServer(port: number) {
    let tries = 25
    do {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        const response = await fetch(`http://localhost:${port}/app`)
        if (response.ok) {
          return true
        }
      } catch {}

      tries--
    } while (tries > 0)

    return false
  }

  function getLoadingHtml(webview: vscode.Webview) {
    return getStatusHtml(webview, "Starting opencode...")
  }

  function getErrorHtml(webview: vscode.Webview) {
    return getStatusHtml(webview, "Could not load opencode. Check the opencode terminal output.")
  }

  function getStatusHtml(webview: vscode.Webview, message: string) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';">
    <style>
      body { align-items: center; display: flex; font-family: var(--vscode-font-family); height: 100vh; justify-content: center; margin: 0; }
    </style>
  </head>
  <body>${message}</body>
</html>`
  }

  async function getWebviewHtml(webview: vscode.Webview, port: number) {
    log(`Loading webview iframe: http://localhost:${port}/`)
    return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${port} http://127.0.0.1:${port}; style-src ${webview.cspSource} 'unsafe-inline';">
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; padding: 0; width: 100%; }
      iframe { border: 0; display: block; height: 100%; width: 100%; }
    </style>
  </head>
  <body>
    <iframe src="http://localhost:${port}/" allow="clipboard-read; clipboard-write"></iframe>
  </body>
</html>`
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
      return
    }

    const document = activeEditor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) {
      return
    }

    // Get the relative path from workspace root
    const relativePath = vscode.workspace.asRelativePath(document.uri)
    let filepathWithAt = `@${relativePath}`

    // Check if there's a selection and add line numbers
    const selection = activeEditor.selection
    if (!selection.isEmpty) {
      // Convert to 1-based line numbers
      const startLine = selection.start.line + 1
      const endLine = selection.end.line + 1

      if (startLine === endLine) {
        // Single line selection
        filepathWithAt += `#L${startLine}`
      } else {
        // Multi-line selection
        filepathWithAt += `#L${startLine}-${endLine}`
      }
    }

    return filepathWithAt
  }

  function log(message: string) {
    output.appendLine(`[${new Date().toISOString()}] ${message}`)
  }

  function formatError(error: unknown) {
    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }
}
