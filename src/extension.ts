// This method is called when your extension is deactivated
export function deactivate() {}

import * as vscode from "vscode"
import * as path from "path"
import * as http from "http"
import * as net from "net"
import { spawn, type ChildProcess } from "child_process"

const SIDEBAR_VIEW_ID = "opencode.sidebar"
const SIDEBAR_CONTAINER_COMMAND = "workbench.view.extension.opencode"
const EXPERIMENTAL_OPENCODE_SERVER = "http://192.168.0.249:4096"

export function activate(context: vscode.ExtensionContext) {
  let sidebarPort: number | undefined
  let sidebarServerUrl: string | undefined
  let sidebarProcess: ChildProcess | undefined
  let proxyServer: http.Server | undefined
  let proxyPort: number | undefined
  let workspaceContextServerUrl: string | undefined
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
      context.subscriptions.push(view.webview.onDidReceiveMessage((message) => handleWebviewMessage(view.webview, message)))
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

  const addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    const readyServerUrl = await ensureSidebarServer()
    if (!readyServerUrl) {
      return
    }

    await appendPrompt(readyServerUrl, fileRef)
  })

  const addToOpenCodeDisposable = vscode.commands.registerCommand("opencode.addToOpenCode", async (resource?: vscode.Uri, selectedResources?: vscode.Uri[]) => {
    const refs = await getWorkspaceUriRefs(resource, selectedResources)
    if (!refs.length) {
      log("Add to OpenCode skipped: no workspace resources")
      return
    }

    const readyServerUrl = await ensureSidebarServer()
    if (!readyServerUrl) {
      return
    }

    const text = refs.join(" ")
    log(`Adding Explorer selection to OpenCode: ${text}`)
    await appendPrompt(readyServerUrl, text)
  })

  const attachToOpenCodeDisposable = vscode.commands.registerCommand("opencode.attachToOpenCode", async (resource?: vscode.Uri, selectedResources?: vscode.Uri[]) => {
    const uris = await getAttachUris(resource, selectedResources)
    if (!uris.length) {
      log("Attach to OpenCode skipped: no resources")
      return
    }

    await ensureSidebarServer()
    if (!sidebarWebview) {
      log("Attach to OpenCode failed: no webview")
      return
    }

    const files = await readAttachmentFiles(uris)
    if (!files.length) {
      log("Attach to OpenCode skipped: no readable files")
      return
    }

    log(`Attaching files to OpenCode: ${files.map((file) => file.name).join(", ")}`)
    await sidebarWebview.postMessage({ source: "opencode-attach-files", files })
  })

  const pasteIntoOpenCodeDisposable = vscode.commands.registerCommand("opencode.pasteIntoOpenCode", async () => {
    await pasteClipboardIntoOpenCode("command")
  })

  const copyInOpenCodeDisposable = vscode.commands.registerCommand("opencode.copyInOpenCode", async () => {
    await sendEditCommandToOpenCode("copy")
  })

  const cutInOpenCodeDisposable = vscode.commands.registerCommand("opencode.cutInOpenCode", async () => {
    await sendEditCommandToOpenCode("cut")
  })

  const selectAllInOpenCodeDisposable = vscode.commands.registerCommand("opencode.selectAllInOpenCode", async () => {
    await sendEditCommandToOpenCode("selectAll")
  })

  const undoInOpenCodeDisposable = vscode.commands.registerCommand("opencode.undoInOpenCode", async () => {
    await sendEditCommandToOpenCode("undo")
  })

  const redoInOpenCodeDisposable = vscode.commands.registerCommand("opencode.redoInOpenCode", async () => {
    await sendEditCommandToOpenCode("redo")
  })

  context.subscriptions.push(
    output,
    sidebarDisposable,
    workspaceFoldersDisposable,
    addFilepathDisposable,
    addToOpenCodeDisposable,
    attachToOpenCodeDisposable,
    pasteIntoOpenCodeDisposable,
    copyInOpenCodeDisposable,
    cutInOpenCodeDisposable,
    selectAllInOpenCodeDisposable,
    undoInOpenCodeDisposable,
    redoInOpenCodeDisposable,
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

  async function ensureSidebarServer() {
    if (sidebarServerUrl && (await waitForServer(sidebarServerUrl))) {
      return sidebarServerUrl
    }

    try {
      await vscode.commands.executeCommand(SIDEBAR_CONTAINER_COMMAND)
    } catch (error) {
      log(`Failed to open sidebar for command: ${formatError(error)}`)
    }

    if (sidebarWebview) {
      await loadSidebar(sidebarWebview)
    }

    if (sidebarServerUrl && (await waitForServer(sidebarServerUrl))) {
      return sidebarServerUrl
    }

    log("OpenCode server is not ready for command")
    return undefined
  }

  async function loadSidebar(webview: vscode.Webview) {
    if (sidebarServerUrl && (await waitForServer(sidebarServerUrl))) {
      log(`Reusing opencode server at ${sidebarServerUrl}`)
      proxyPort = proxyPort ?? (await startProxyServer(sidebarServerUrl, workspaceRoot))
      webview.html = await getWebviewHtml(webview, proxyPort)
      return
    }

    webview.html = getLoadingHtml(webview)
    stopSidebarProcess()
    proxyPort = undefined
    workspaceContextServerUrl = undefined
    workspaceRoot = await waitForWorkspaceRoot()
    log(`Resolved workspace root: ${workspaceRoot ?? "<none>"}`)

    if (EXPERIMENTAL_OPENCODE_SERVER) {
      sidebarPort = undefined
      sidebarServerUrl = EXPERIMENTAL_OPENCODE_SERVER
      log(`Using experimental external opencode server: ${sidebarServerUrl}`)
      if (await waitForServer(sidebarServerUrl)) {
        proxyPort = await startProxyServer(sidebarServerUrl, workspaceRoot)
        await appendWorkspaceContext(sidebarServerUrl)
        webview.html = await getWebviewHtml(webview, proxyPort)
        return
      }

      log(`experimental opencode server did not become ready: ${sidebarServerUrl}`)
      webview.html = getErrorHtml(webview)
      return
    }

    sidebarPort = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
    sidebarServerUrl = `http://127.0.0.1:${sidebarPort}`
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

    if (await waitForServer(sidebarServerUrl)) {
      log(`opencode server is ready on port ${sidebarPort}`)
      proxyPort = await startProxyServer(sidebarServerUrl, workspaceRoot)
      await appendWorkspaceContext(sidebarServerUrl)
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
    sidebarServerUrl = undefined
  }

  async function handleWebviewMessage(webview: vscode.Webview, message: unknown) {
    if (!message || typeof message !== "object") {
      return
    }

    const payload = message as { source?: string; id?: string; uris?: unknown; text?: unknown }
    if (payload.source === "opencode-clipboard-write" && typeof payload.id === "string" && typeof payload.text === "string") {
      try {
        await vscode.env.clipboard.writeText(payload.text)
        log(`Clipboard write requested ${payload.id}: ${payload.text.length} chars`)
        await webview.postMessage({ source: "opencode-clipboard-write-result", id: payload.id, ok: true })
      } catch (error) {
        log(`Clipboard write failed ${payload.id}: ${formatError(error)}`)
        await webview.postMessage({ source: "opencode-clipboard-write-result", id: payload.id, ok: false, error: formatError(error) })
      }
      return
    }

    if (payload.source === "opencode-clipboard-read" && typeof payload.id === "string") {
      try {
        const text = await vscode.env.clipboard.readText()
        log(`Clipboard read requested ${payload.id}: ${text.length} chars`)
        await webview.postMessage({ source: "opencode-clipboard-read-result", id: payload.id, text })
      } catch (error) {
        log(`Clipboard read failed ${payload.id}: ${formatError(error)}`)
        await webview.postMessage({ source: "opencode-clipboard-read-result", id: payload.id, text: "", error: formatError(error) })
      }
      return
    }

    if (payload.source === "opencode-paste-clipboard") {
      await pasteClipboardIntoOpenCode("webview")
      return
    }

    if (payload.source !== "opencode-drop-fallback" || typeof payload.id !== "string" || !Array.isArray(payload.uris)) {
      return
    }

    const paths = await resolveWorkspaceUris(payload.uris.filter((uri): uri is string => typeof uri === "string"))
    log(`Resolved drop fallback ${payload.id}: ${paths.join(",") || "<none>"}`)
    await webview.postMessage({ source: "opencode-drop-fallback-result", id: payload.id, paths })
  }

  async function sendEditCommandToOpenCode(command: string) {
    if (process.platform !== "darwin") {
      log(`Edit command ignored on non-macOS: ${command}`)
      return
    }

    if (!sidebarWebview) {
      await vscode.commands.executeCommand(SIDEBAR_CONTAINER_COMMAND)
    }

    if (!sidebarWebview) {
      log(`Edit command failed without webview: ${command}`)
      return
    }

    log(`Sending edit command to OpenCode: ${command}`)
    await sidebarWebview.postMessage({ source: "opencode-edit-command", command })
  }

  async function pasteClipboardIntoOpenCode(source: string) {
    if (process.platform !== "darwin") {
      log(`Paste fallback ignored on non-macOS from ${source}`)
      return
    }

    const readyServerUrl = await ensureSidebarServer()
    if (!readyServerUrl) {
      return
    }

    const text = await vscode.env.clipboard.readText()
    if (!text) {
      log(`Paste fallback skipped empty clipboard from ${source}`)
      return
    }

    log(`Pasting clipboard into OpenCode from ${source}: ${text.length} chars`)
    await appendPrompt(readyServerUrl, text)
  }

  async function resolveWorkspaceUris(rawUris: string[]) {
    const seen = new Set<string>()
    const paths: string[] = []

    for (const rawUri of rawUris) {
      try {
        const uri = vscode.Uri.parse(rawUri, true)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        if (!workspaceFolder) {
          log(`Drop fallback ignored outside workspace: ${rawUri}`)
          continue
        }

        const stat = await vscode.workspace.fs.stat(uri)
        if (stat.type & vscode.FileType.File) {
          await vscode.workspace.fs.readFile(uri)
        }

        const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
        log(`Drop fallback resolved URI ${rawUri} -> ${relativePath}`)
        if (relativePath && !seen.has(relativePath)) {
          seen.add(relativePath)
          paths.push(relativePath)
        }
      } catch (error) {
        log(`Drop fallback failed for ${rawUri}: ${formatError(error)}`)
      }
    }

    return paths
  }

  async function startProxyServer(targetServerUrl: string, directory?: string) {
    proxyServer?.close()
    const target = new URL(targetServerUrl)
    const targetHost = target.hostname
    const targetPort = Number(target.port || (target.protocol === "https:" ? 443 : 80))

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

      if (request.url === "/__opencode_extension_clipboard_read") {
        vscode.env.clipboard.readText().then(
          (text) => {
            log(`Clipboard read proxied: ${text.length} chars`)
            response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
            response.end(text)
          },
          (error) => {
            log(`Clipboard read failed: ${formatError(error)}`)
            response.writeHead(500)
            response.end("Clipboard read failed")
          },
        )
        return
      }

      if (request.url === "/__opencode_extension_append_prompt" && request.method === "POST") {
        const chunks: Buffer[] = []
        request.on("data", (chunk: Buffer) => chunks.push(chunk))
        request.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          appendPrompt(targetServerUrl, text).then(
            () => {
              log(`Drop append proxied: ${text.length} chars`)
              response.writeHead(204)
              response.end()
            },
            (error) => {
              log(`Drop append failed: ${formatError(error)}`)
              response.writeHead(500)
              response.end("Append prompt failed")
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
          hostname: targetHost,
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
      const targetSocket = net.connect(targetPort, targetHost, () => {
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
    return String.raw`(function(){
  var dir=${JSON.stringify(directory)};
  var macPasteFallback=${JSON.stringify(process.platform === "darwin")};
  var key="opencode.global.dat:server";
  function report(message){try{fetch("/__opencode_extension_log?message="+encodeURIComponent(message)).catch(function(){})}catch(error){}}
  function normalizePath(value){return String(value||"").replace(/\\/g,"/").replace(/\/+$/g,"")}
  function isInsideWorkspace(filepath){var normalizedDir=normalizePath(dir);var normalizedFilepath=normalizePath(filepath);return normalizedDir&&normalizedFilepath&&(normalizedFilepath===normalizedDir||normalizedFilepath.indexOf(normalizedDir+"/")===0)}
  function relativeWorkspacePath(filepath){var normalizedDir=normalizePath(dir);var normalizedFilepath=normalizePath(filepath);return normalizedFilepath.slice(normalizedDir.length).replace(/^\/+/,"")}
  function fileUriToPath(uri){try{var url=new URL(uri);if(url.protocol!=="file:")return;var pathname=decodeURIComponent(url.pathname);if(/^\/[A-Za-z]:\//.test(pathname))pathname=pathname.slice(1);return pathname}catch(error){return}}
  function parseDropPayload(text){var values=[];var raw=String(text||"").trim();if(!raw)return values;try{var json=JSON.parse(raw);var visit=function(value){if(!value)return;if(typeof value==="string"){values.push(value);return}if(Array.isArray(value)){value.forEach(visit);return}if(typeof value==="object"){["uri","resourceUri","file","path","fsPath","external","href"].forEach(function(key){visit(value[key])})}};visit(json)}catch(error){}
    raw.split(/\r?\n/).forEach(function(line){line=line.trim();if(line&&line.charAt(0)!=="#")values.push(line)});return values
  }
  function getData(dataTransfer,type){try{return dataTransfer&&dataTransfer.getData(type)}catch(error){return ""}}
  function dataTransferTypes(dataTransfer){try{return Array.prototype.slice.call(dataTransfer&&dataTransfer.types||[])}catch(error){return []}}
  function dropPayloadValues(dataTransfer){var values=[];var mimeTypes=["text/uri-list","text/plain","application/vnd.code.uri-list","resourceurls","codefiles"];mimeTypes.forEach(function(type){parseDropPayload(getData(dataTransfer,type)).forEach(function(value){report("drop payload "+type+": "+value);values.push(value)})});return values}
  function workspaceDropPaths(values){var seen={};var paths=[];
    values.forEach(function(value){var filepath=value.indexOf("file:")===0?fileUriToPath(value):value;if(filepath&&isInsideWorkspace(filepath)){var relative=relativeWorkspacePath(filepath);report("drop resolved path "+value+" -> "+relative);if(relative&&!seen[relative]){seen[relative]=true;paths.push(relative)}}});
    return paths
  }
  function unresolvedDropUris(values){var seen={};var uris=[];
    values.forEach(function(value){try{var url=new URL(value);if(url.protocol&&url.protocol!=="file:"&&!seen[value]){report("drop unresolved URI: "+value);seen[value]=true;uris.push(value)}}catch(error){}});
    return uris
  }
  function requestDropFallback(uris){var id=String(Date.now())+"-"+String(Math.random()).slice(2);try{window.parent.postMessage({source:"opencode-drop-fallback",id:id,uris:uris},"*");report("requested drop fallback: "+uris.join(","))}catch(error){report("drop fallback request failed: "+(error&&error.message?error.message:String(error)))}return id}
  function requestClipboardText(){var id=String(Date.now())+"-"+String(Math.random()).slice(2);try{window.parent.postMessage({source:"opencode-clipboard-read",id:id},"*");report("requested clipboard text: "+id)}catch(error){report("clipboard text request failed: "+(error&&error.message?error.message:String(error)))}return id}
  function writeClipboardText(text){var id=String(Date.now())+"-"+String(Math.random()).slice(2);try{window.parent.postMessage({source:"opencode-clipboard-write",id:id,text:String(text||"")},"*");report("requested clipboard write: "+id+" "+String(text||"").length+" chars")}catch(error){report("clipboard write request failed: "+(error&&error.message?error.message:String(error)))}return id}
  function editableSelection(target){try{if(target&&typeof target.value==="string"){var start=typeof target.selectionStart==="number"?target.selectionStart:0;var end=typeof target.selectionEnd==="number"?target.selectionEnd:start;return target.value.slice(start,end)}}catch(error){}try{return String(window.getSelection?window.getSelection().toString():"")}catch(error){return ""}}
  function deleteEditableSelection(target){try{if(target&&typeof target.value==="string"){var start=typeof target.selectionStart==="number"?target.selectionStart:0;var end=typeof target.selectionEnd==="number"?target.selectionEnd:start;if(end>start){target.value=target.value.slice(0,start)+target.value.slice(end);target.selectionStart=target.selectionEnd=start;target.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"deleteByCut"}));return true}}}catch(error){report("delete editable selection failed: "+(error&&error.message?error.message:String(error)))}try{return !!(document.execCommand&&document.execCommand("delete",false))}catch(error){report("delete selection command failed: "+(error&&error.message?error.message:String(error)));return false}}
  function selectAllEditable(target){try{if(target&&typeof target.value==="string"&&typeof target.setSelectionRange==="function"){target.setSelectionRange(0,target.value.length);target.dispatchEvent(new Event("select",{bubbles:true}));return true}}catch(error){report("select all editable failed: "+(error&&error.message?error.message:String(error)))}try{return !!(document.execCommand&&document.execCommand("selectAll",false))}catch(error){report("select all command failed: "+(error&&error.message?error.message:String(error)));return false}}
  function runEditCommand(command){var target=document.activeElement||document.body;if(command==="copy"||command==="cut"){var text=editableSelection(target);if(text){writeClipboardText(text);if(command==="cut")deleteEditableSelection(target);report("edit "+command+" handled: "+text.length+" chars");return}try{if(document.execCommand&&document.execCommand(command,false)){report("edit "+command+" handled by execCommand");return}}catch(error){report("edit "+command+" command failed: "+(error&&error.message?error.message:String(error)))}report("edit "+command+" had no selection");return}if(command==="selectAll"){selectAllEditable(target);report("edit selectAll handled");return}if(command==="undo"||command==="redo"){try{if(document.execCommand&&document.execCommand(command,false)){report("edit "+command+" handled");return}}catch(error){report("edit "+command+" failed: "+(error&&error.message?error.message:String(error)))}return}report("unknown edit command: "+command)}
  function installEditCommandBridge(){if(!macPasteFallback){report("edit command bridge skipped on non-macOS");return}window.addEventListener("message",function(event){var data=event.data;if(!data||data.source!=="opencode-edit-command")return;runEditCommand(String(data.command||""))});window.addEventListener("message",function(event){var data=event.data;if(!data||data.source!=="opencode-clipboard-write-result")return;if(data.ok){report("clipboard write result ok: "+data.id)}else{report("clipboard write result failed: "+(data.error||data.id))}});document.addEventListener("keydown",function(event){if(!event.metaKey||event.ctrlKey||event.altKey)return;var key=String(event.key||"").toLowerCase();var command="";if(key==="c"&&!event.shiftKey)command="copy";if(key==="x"&&!event.shiftKey)command="cut";if(key==="a"&&!event.shiftKey)command="selectAll";if(key==="z"&&!event.shiftKey)command="undo";if(key==="z"&&event.shiftKey)command="redo";if(!command)return;event.preventDefault();event.stopImmediatePropagation();runEditCommand(command)},true);report("edit command bridge installed")}
  function insertClipboardText(text){var target=document.activeElement||document.body;try{var dataTransfer=new DataTransfer();dataTransfer.setData("text/plain",text);var pasteEvent=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:dataTransfer});if(!target.dispatchEvent(pasteEvent)){report("clipboard paste event handled: "+String(text).length+" chars");return}}catch(error){report("clipboard paste event failed: "+(error&&error.message?error.message:String(error)))}try{if(document.execCommand&&document.execCommand("insertText",false,text)){report("clipboard inserted with execCommand: "+String(text).length+" chars");return}}catch(error){report("clipboard execCommand failed: "+(error&&error.message?error.message:String(error)))}try{if(target&&typeof target.value==="string"){var start=typeof target.selectionStart==="number"?target.selectionStart:target.value.length;var end=typeof target.selectionEnd==="number"?target.selectionEnd:start;target.value=target.value.slice(0,start)+text+target.value.slice(end);target.selectionStart=target.selectionEnd=start+text.length;target.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertFromPaste",data:text}));report("clipboard inserted into input: "+String(text).length+" chars");return}}catch(error){report("clipboard input insert failed: "+(error&&error.message?error.message:String(error)))}report("clipboard text could not be inserted")}
  function installPasteBridge(){if(!macPasteFallback){report("paste bridge skipped on non-macOS");return}var pending={};window.addEventListener("message",function(event){var data=event.data;if(!data||data.source!=="opencode-clipboard-read-result")return;delete pending[data.id];if(data.error){report("clipboard read result failed: "+data.error);return}insertClipboardText(String(data.text||""))});document.addEventListener("keydown",function(event){var key=String(event.key||"").toLowerCase();if(key!=="v"||(!event.metaKey&&!event.ctrlKey)||event.altKey){return}event.preventDefault();event.stopImmediatePropagation();pending[requestClipboardText()]=true},true);report("paste bridge installed")}
  function bytesFromBase64(data){var binary=atob(String(data||""));var bytes=new Uint8Array(binary.length);for(var index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);return bytes}
  function dispatchAttachmentDrop(target,files){try{var dataTransfer=new DataTransfer();files.forEach(function(file){dataTransfer.items.add(file)});var dropEvent=new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:dataTransfer});target.dispatchEvent(dropEvent);report("redispatched synthetic attachment drop: "+files.map(function(file){return file.name}).join(","))}catch(error){report("attachment drop failed: "+(error&&error.message?error.message:String(error)))}}
  function installAttachmentBridge(){window.addEventListener("message",function(event){var data=event.data;if(!data||data.source!=="opencode-attach-files"||!Array.isArray(data.files))return;var files=[];data.files.forEach(function(file){try{files.push(new File([bytesFromBase64(file.data)],String(file.name||"attachment"),{type:String(file.type||"application/octet-stream")}));report("prepared synthetic attachment: "+String(file.name||"attachment"))}catch(error){report("prepare attachment failed: "+(error&&error.message?error.message:String(error)))}});if(files.length)dispatchAttachmentDrop(document.activeElement||document.body,files)});report("attachment bridge installed")}
  function dispatchOpenCodeDrop(target, path){var dataTransfer=new DataTransfer();dataTransfer.setData("text/plain","file:"+path);dataTransfer.setData("text/uri-list","file:"+path);report("redispatching synthetic drop: file:"+path);var dropEvent=new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:dataTransfer});target.dispatchEvent(dropEvent)}
  function dispatchOpenCodeDrops(target, paths, done){var index=0;var next=function(){if(index>=paths.length){done();return}try{dispatchOpenCodeDrop(target,paths[index]);index++;setTimeout(next,0)}catch(error){done(error)}};next()}
  function installVsCodeDropNormalizer(){var redispatching=false;var fallbackTargets={};window.addEventListener("message",function(event){var data=event.data;if(!data||data.source!=="opencode-drop-fallback-result")return;var target=fallbackTargets[data.id]||document;delete fallbackTargets[data.id];var paths=Array.isArray(data.paths)?data.paths:[];if(!paths.length){report("drop fallback returned no paths");return}redispatching=true;dispatchOpenCodeDrops(target,paths,function(error){redispatching=false;if(error){report("drop fallback dispatch failed: "+(error&&error.message?error.message:String(error)));return}report("normalized fallback drop: "+paths.join(","))})});document.addEventListener("drop",function(event){if(redispatching)return;report("drop types: "+dataTransferTypes(event.dataTransfer).join(","));var values=dropPayloadValues(event.dataTransfer);var paths=workspaceDropPaths(values);var uris=unresolvedDropUris(values);if(!paths.length&&!uris.length)return;var plain=getData(event.dataTransfer,"text/plain");if(paths.length===1&&!uris.length&&plain==="file:"+paths[0])return;event.preventDefault();event.stopImmediatePropagation();var target=event.target||document;if(uris.length){fallbackTargets[requestDropFallback(uris)]=target}if(!paths.length)return;redispatching=true;dispatchOpenCodeDrops(target,paths,function(error){redispatching=false;if(error){report("drop normalize failed: "+(error&&error.message?error.message:String(error)));return}report("normalized VS Code drop: "+paths.join(","))})},true);report("drop normalizer installed")}
  function installClipboardBridge(){try{var existing=navigator.clipboard||{};var bridged=Object.assign({},existing,{readText:function(){return fetch("/__opencode_extension_clipboard_read",{method:"GET",cache:"no-store"}).then(function(response){if(!response.ok)throw new Error("Clipboard read bridge failed: "+response.status);return response.text()}).then(function(text){report("clipboard read bridged "+String(text).length+" chars");return text})},writeText:function(text){return fetch("/__opencode_extension_clipboard",{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:String(text)}).then(function(response){if(!response.ok)throw new Error("Clipboard bridge failed: "+response.status);report("clipboard bridged "+String(text).length+" chars")})}});Object.defineProperty(navigator,"clipboard",{value:bridged,configurable:true});report("clipboard bridge installed")}catch(error){report("clipboard bridge failed: "+(error&&error.message?error.message:String(error)))}}
  installClipboardBridge();installPasteBridge();installEditCommandBridge();installAttachmentBridge();installVsCodeDropNormalizer();try{report("bootstrap executing for "+dir);var before=localStorage.getItem(key);var data=JSON.parse(before||"{}");var projects=data.projects&&typeof data.projects==="object"?data.projects:{};var local=Array.isArray(projects.local)?projects.local.filter(function(project){return project&&project.worktree!==dir}):[];projects.local=[{worktree:dir,expanded:true}].concat(local);data.list=Array.isArray(data.list)?data.list:[];data.projects=projects;data.lastProject=Object.assign({},data.lastProject,{local:dir});localStorage.setItem(key,JSON.stringify(data));report("seeded "+key+" local="+projects.local.map(function(project){return project.worktree}).join(","))}catch(error){report("seed failed: "+(error&&error.message?error.message:String(error)))}
})();`
  }

  async function appendPrompt(serverUrl: string, text: string) {
    log(`Appending prompt to opencode at ${serverUrl}: ${text.split("\n")[0]}`)
    await fetch(`${serverUrl}/tui/append-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    })
  }

  async function appendWorkspaceContext(serverUrl: string) {
    if (workspaceContextServerUrl === serverUrl) {
      return
    }

    const workspaceContext = getWorkspaceContext()
    if (!workspaceContext) {
      return
    }

    workspaceContextServerUrl = serverUrl
    await appendPrompt(serverUrl, workspaceContext)
  }

  async function appendUpdatedWorkspaceContext() {
    if (!sidebarServerUrl || !(await waitForServer(sidebarServerUrl))) {
      return
    }

    const workspaceContext = getWorkspaceContext("Updated workspace context")
    if (!workspaceContext) {
      return
    }

    await appendPrompt(sidebarServerUrl, workspaceContext)
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
    workspaceContextServerUrl = undefined
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

  async function waitForServer(serverUrl: string) {
    let tries = 25
    do {
      await new Promise((resolve) => setTimeout(resolve, 200))
      try {
        const response = await fetch(`${serverUrl}/app`)
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
    const nonce = getNonce()
    return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${port} http://127.0.0.1:${port}; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; padding: 0; width: 100%; }
      iframe { border: 0; display: block; height: 100%; width: 100%; }
    </style>
  </head>
  <body>
    <iframe id="opencode-frame" src="http://localhost:${port}/" allow="clipboard-read; clipboard-write"></iframe>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const frame = document.getElementById("opencode-frame");
      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message || typeof message !== "object") {
          return;
        }

        if (message.source === "opencode-drop-fallback" || message.source === "opencode-clipboard-read" || message.source === "opencode-clipboard-write") {
          vscode.postMessage(message);
          return;
        }

        if (message.source === "opencode-drop-fallback-result" || message.source === "opencode-clipboard-read-result" || message.source === "opencode-clipboard-write-result" || message.source === "opencode-edit-command" || message.source === "opencode-attach-files") {
          frame?.contentWindow?.postMessage(message, "*");
        }
      });
    </script>
  </body>
</html>`
  }

  function getNonce() {
    let text = ""
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    for (let index = 0; index < 32; index++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }

    return text
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

  async function getWorkspaceUriRefs(resource?: vscode.Uri, selectedResources?: vscode.Uri[]) {
    const candidates = selectedResources?.length ? selectedResources : resource ? [resource] : []
    if (!candidates.length) {
      const activeFile = getActiveFile()
      return activeFile ? [activeFile] : []
    }

    const seen = new Set<string>()
    const refs: string[] = []

    for (const uri of candidates) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
      if (!workspaceFolder) {
        log(`Add to OpenCode ignored outside workspace: ${uri.toString()}`)
        continue
      }

      try {
        await vscode.workspace.fs.stat(uri)
      } catch (error) {
        log(`Add to OpenCode could not stat ${uri.toString()}: ${formatError(error)}`)
        continue
      }

      const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
      if (!relativePath || seen.has(relativePath)) {
        continue
      }

      seen.add(relativePath)
      refs.push(`@${relativePath}`)
    }

    return refs
  }

  async function getAttachUris(resource?: vscode.Uri, selectedResources?: vscode.Uri[]) {
    const candidates = selectedResources?.length ? selectedResources : resource ? [resource] : []
    if (candidates.length) {
      return candidates
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri
    if (activeUri?.scheme === "file") {
      return [activeUri]
    }

    return (await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: true })) ?? []
  }

  async function readAttachmentFiles(uris: vscode.Uri[]) {
    const files: Array<{ name: string; type: string; data: string }> = []
    const seen = new Set<string>()

    for (const uri of uris) {
      if (seen.has(uri.toString())) {
        continue
      }
      seen.add(uri.toString())

      try {
        const stat = await vscode.workspace.fs.stat(uri)
        if (!(stat.type & vscode.FileType.File)) {
          log(`Attach ignored non-file resource: ${uri.toString()}`)
          continue
        }

        const data = await vscode.workspace.fs.readFile(uri)
        files.push({
          name: path.basename(uri.fsPath),
          type: getMimeType(uri.fsPath),
          data: Buffer.from(data).toString("base64"),
        })
      } catch (error) {
        log(`Attach failed to read ${uri.toString()}: ${formatError(error)}`)
      }
    }

    return files
  }

  function getMimeType(filePath: string) {
    const extension = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      ".gif": "image/gif",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
    }

    return mimeTypes[extension] ?? "application/octet-stream"
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
