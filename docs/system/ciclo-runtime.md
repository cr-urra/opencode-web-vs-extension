# Ciclo de runtime

## Activacion

La extension se activa por `onStartupFinished`, apertura de la vista o cualquiera de sus comandos, segun [`package.json`](../../package.json#L32-L47).

Secuencia:

1. `activate()` crea el Output channel.
2. Registra provider, listener de carpetas y once comandos.
3. Registra un `Disposable` que llama `stopSidebarProcess()`.
4. Espera 500 ms y ejecuta `workbench.view.extension.opencode`.
5. Al resolver la vista, habilita scripts, conecta mensajes y llama `loadSidebar()`.

El listener de visibilidad vuelve a llamar `loadSidebar()` cada vez que la vista se hace visible.

## Arranque normal

```text
resolveWebviewView
  -> loadSidebar
     -> health check de servidor existente
     -> estado "Starting opencode..."
     -> stopSidebarProcess
     -> esperar workspace root (maximo aproximado: 5 s)
     -> elegir puerto aleatorio 16384..65535
     -> spawn opencode serve --port P
     -> GET /app hasta 25 veces, cada 200 ms
     -> startProxyServer en 127.0.0.1:puerto-efimero
     -> POST contexto a /tui/append-prompt
     -> instalar wrapper con iframe al proxy
```

Referencias: [`loadSidebar()`](../../src/extension.ts#L207-L272), [`waitForWorkspaceRoot()`](../../src/extension.ts#L705-L725), [`waitForServer()`](../../src/extension.ts#L727-L742).

## Reutilizacion

Si `sidebarServerUrl` responde en `/app`:

1. Se conserva el proceso.
2. Se crea el proxy solo si `proxyPort` es `undefined`.
3. Se reasigna `webview.html` y se recrea el iframe.

La reutilizacion evita un nuevo CLI, pero no conserva necesariamente foco, scroll o contenido transitorio del iframe.

## Ejecucion de comandos con servidor no listo

`ensureSidebarServer()`:

1. Prueba el servidor recordado.
2. Abre el contenedor lateral.
3. Si existe webview, llama `loadSidebar()`.
4. Vuelve a probar el servidor.
5. Registra fallo y retorna `undefined` si no queda listo.

No presenta toast ni detalle al usuario. Referencia: [`ensureSidebarServer()`](../../src/extension.ts#L184-L205).

## Proceso hijo

Configuracion:

- `cwd`: ancestro comun del workspace o default del host.
- `env`: entorno heredado mas variables de integracion.
- `shell: true` solo en Windows.
- `stdio: "ignore"`.

Los eventos `error` y `exit` solo escriben logs y limpian `sidebarProcess`; no cierran proxy, no cambian UI y no reinician. Como los callbacks leen estado mutable, un proceso viejo puede afectar la referencia de uno nuevo.

## Proxy y carga del iframe

El proxy comienza despues de que `/app` responde. Las respuestas HTML GET se cargan completas, se inyecta `/__opencode_extension_bootstrap.js` despues de `<head>`, y luego se devuelven al iframe.

La inyeccion completa se omite cuando `workspaceRoot` es `undefined`. En ese caso tambien desaparecen puentes que tecnicamente no dependen de tener workspace, porque todos se instalan desde el mismo script.

## Cambios de workspace

[`reloadSidebarIfWorkspaceRootChanged()`](../../src/extension.ts#L665-L683) compara el ancestro comun nuevo:

- Si no cambia: mantiene runtime y anexa `Updated workspace context` al prompt.
- Si cambia: limpia puertos/contexto/root, detiene proceso y proxy, y vuelve a cargar si hay webview.

No se observan cambios de workspace trust, disponibilidad de filesystem virtual ni configuracion. Cuando no hay raiz comun, el child usa el `cwd` por defecto del Extension Host y no se inyecta el bootstrap: se pierden project seeding y los bridges de clipboard, attachments y drops provistos por la extension, aunque el servidor pueda cargar. El comportamiento nativo del frontend queda fuera de este repositorio.

## Cierre

`deactivate()` esta vacio. La limpieza depende del `Disposable` guardado en `context.subscriptions`, que ejecuta [`stopSidebarProcess()`](../../src/extension.ts#L274-L280):

1. Llama `proxyServer.close()` sin esperar.
2. Llama `sidebarProcess.kill()` sin esperar.
3. Limpia referencias principales.

No termina explicitamente sockets WebSocket, requests activos, descendientes del proceso ni procesos que ignoren la señal. En Windows, el shell intermediario aumenta la incertidumbre del cierre del arbol.

## Estados observables

| Estado logico | UI | Evidencia |
| --- | --- | --- |
| No resuelto | Ninguna vista propia | Antes de `resolveWebviewView`. |
| Starting | Texto centrado `Starting opencode...` | `getLoadingHtml`. |
| Ready | Iframe full-size | `getWebviewHtml`. |
| Startup failed | Mensaje generico | `getErrorHtml`. |
| Child died despues de ready | Iframe degradado/error de red | No hay transicion explicita. |
| Hidden | Vista oculta, proceso normalmente vivo | No se detiene al ocultar. |
| Disposed/deactivated | Limpieza best-effort | Disposable de contexto. |

## Carreras conocidas

`loadSidebar()` puede ser llamado por resolucion, visibilidad, comandos y cambios de workspace. Sin serializacion:

- Dos arranques pueden lanzar dos procesos.
- Una carga puede detener el proceso de otra.
- Una callback vieja puede limpiar estado nuevo.
- Un proxy/HTML puede apuntar a una generacion distinta.
- Un proceso sobrescrito puede quedar huerfano y no cerrarse al desactivar.
- Una vista dispuesta puede seguir referenciada por `sidebarWebview`; un comando intenta postear alli y omite el fallback HTTP.

Todo cambio de lifecycle debe probar llamadas superpuestas, no solo el happy path.
