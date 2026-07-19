# Arquitectura del sistema

## Proposito tecnico

La extension adapta la interfaz web de un OpenCode instalado externamente para que funcione dentro de una barra lateral de VS Code/VSCodium. Es un host y una capa de compatibilidad, no una implementacion del agente.

## Contexto

```text
Usuario
  |
  v
VS Code/VSCodium desktop
  |
  +-- Extension Host (este repositorio)
  |     +-- VS Code API: workspace, archivos, clipboard, comandos
  |     +-- proceso hijo: opencode serve
  |     +-- proxy HTTP/WebSocket local
  |     +-- Output channel "OpenCode"
  |
  +-- Webview opencode.sidebar
        +-- documento wrapper de la extension
              +-- iframe HTTP al proxy
                    +-- frontend OpenCode externo
```

## Contenedores y limites de propiedad

### Extension Host

Codigo: [`activate()`](../../src/extension.ts#L15-L960).

Responsabilidades:

- Registrar provider, comandos y eventos de workspace.
- Mantener el estado efimero del runtime.
- Lanzar y terminar `opencode serve`.
- Leer recursos con `vscode.workspace.fs`.
- Leer/escribir el clipboard del sistema.
- Servir un proxy loopback e inyectar el bootstrap.
- Construir el HTML del webview y enrutar mensajes.

Es el limite de mayor privilegio: puede ejecutar procesos y acceder al filesystem con los permisos del usuario.

### Proceso OpenCode

Creado por [`loadSidebar()`](../../src/extension.ts#L207-L272) con:

```text
opencode serve --port <puerto-aleatorio>
```

Recibe el entorno completo del Extension Host, `OPENCODE_CALLER=vscode`, `_EXTENSION_OPENCODE_PORT` y, cuando existe, `PWD`/`INIT_CWD`. Su implementacion, bind address, autenticacion y compatibilidad no pueden verificarse desde este repositorio.

### Proxy loopback

Codigo: [`startProxyServer()`](../../src/extension.ts#L398-L557).

Se enlaza a `127.0.0.1` con puerto efimero y:

- Reenvia HTTP al servidor OpenCode.
- Reenvia upgrades WebSocket mediante sockets TCP.
- Elimina `accept-encoding` para poder modificar HTML.
- Bufferiza respuestas HTML e inyecta un script.
- Expone endpoints privilegiados de extension.

### Webview wrapper

Codigo: [`getWebviewHtml()`](../../src/extension.ts#L765-L800).

Es un documento minimo con CSP, un iframe full-size y un router `postMessage`. No contiene la UI de chat. Al reasignar `webview.html`, el iframe se recrea.

### Frontend OpenCode

Llega desde la version de `opencode` encontrada en `PATH`. La extension modifica su HTML y estado browser, pero no controla su arbol de componentes, estado, sesiones, accesibilidad o UX interna.

## Componentes logicos

Aunque viven en una sola funcion, pueden razonarse como estos componentes:

| Componente logico | Simbolos principales | Estado que usa |
| --- | --- | --- |
| Registro de extension | `activate`, `registerWebviewViewProvider`, `registerCommand` | `context.subscriptions` |
| Coordinador de lifecycle | `loadSidebar`, `ensureSidebarServer`, `stopSidebarProcess` | proceso, URL y puertos compartidos |
| Resolucion de workspace | `getWorkspaceRoot`, `waitForWorkspaceRoot`, `getCommonParentPath` | `workspaceRoot` |
| Proxy | `startProxyServer`, `injectOpenProjectDeepLink` | `proxyServer`, `proxyPort` |
| Adaptador browser | `getWorkspaceBootstrapScript` | localStorage y listeners en iframe |
| Canal de comandos | `addRefsToOpenCode`, `attachUrisToOpenCode`, edit commands | `sidebarWebview`, server URL |
| Adaptador de recursos | `getWorkspaceUriRefs`, `readAttachmentFiles`, MIME map | VS Code filesystem |
| Observabilidad | `log`, `formatError`, output channel | timestamps y mensajes de texto |

## Estado y persistencia

### Estado efimero del host

Las variables de [`activate()`](../../src/extension.ts#L16-L24) forman una maquina de estados informal:

- `sidebarPort`: puerto objetivo del CLI.
- `sidebarServerUrl`: URL considerada activa.
- `sidebarProcess`: referencia al hijo actual.
- `proxyServer` y `proxyPort`: proxy presentado al iframe.
- `workspaceContextServerUrl`: evita sembrar contexto dos veces.
- `workspaceRoot`: ancestro comun actual.
- `sidebarWebview`: ultimo webview resuelto. No se limpia en `onDidDispose`, por lo que puede quedar stale y confundirse con una vista entregable.

No hay lock, generation ID, cancelacion ni promesa unica de startup. Dos llamadas concurrentes a `loadSidebar()` pueden interferirse.

### Persistencia browser

El bootstrap modifica `localStorage["opencode.global.dat:server"]` para insertar el proyecto local y `lastProject.local`. Este esquema pertenece a OpenCode y no esta versionado aqui. El origen incluye el puerto del proxy; un proxy nuevo crea otro origen y puede perder continuidad del estado browser.

### Datos transferidos

- Contexto: rutas absolutas de carpetas, anexadas al prompt.
- Referencias: strings `@ruta` o drops sinteticos `file:ruta`.
- Attachments: archivo completo -> bytes -> base64 -> `postMessage` -> `File` browser.
- Clipboard: texto completo por mensajes o endpoints HTTP locales.
- Logs: rutas, nombres, conteos y primera linea de prompts.

No hay base de datos ni persistencia propia del Extension Host.

## Decisiones arquitectonicas observadas

| Decision implementada | Beneficio buscado | Costo o trade-off |
| --- | --- | --- |
| Reusar el frontend web de OpenCode en iframe | Evita reconstruir el producto del agente. | Acoplamiento a HTML, localStorage, DOM y endpoints privados. |
| Lanzar CLI automaticamente | Experiencia sin configuracion despues de instalar CLI. | Ejecucion implicita, dependencia de `PATH`, sin workspace trust. |
| Proxy propio | Permite inyeccion y compatibilidad clipboard/WebSocket. | Superficie privilegiada local y mayor complejidad de lifecycle. |
| Ancestro comun para multi-root | Un unico `cwd` para el servidor. | Puede ampliar el alcance a `/`, drive root o carpeta superior. |
| Archivos binarios por base64/postMessage | Funciona sin endpoint de uploads propio. | Copias multiples y memoria sin limites. |
| Todo el runtime en `activate()` | Implementacion inicial compacta. | Baja testabilidad, alto acoplamiento y carreras de estado. |
| Puertos aleatorios | Reduce configuracion y colisiones predecibles. | No reserva el puerto y cambia el origen browser. |

## Restricciones no funcionales actuales

- **Compatibilidad:** VS Code desktop `>=1.94` segun `engines`; README y metadata del manifest declaran VSCodium, sin constraint o matriz especifica. No hay evidencia de VS Code web o remote.
- **Disponibilidad:** se intenta rastrear un unico proceso, pero carreras pueden crear mas; no hay restart ni health monitoring continuo. Los checks solo ocurren al cargar/reusar o ejecutar comandos.
- **Rendimiento:** archivos y HTML se bufferizan completos; no hay limites.
- **Seguridad:** confianza implicita en OpenCode, workspace y procesos locales.
- **Mantenibilidad:** TypeScript estricto, pero cobertura limitada y puentes browser como string sin type-check propio.
- **Observabilidad:** un Output channel; stderr/stdout del CLI se descartan.

## Dependencias externas criticas

1. VS Code API y Extension Host Node.
2. Ejecutable `opencode` resoluble desde el `PATH` del host.
3. Compatibilidad de `opencode serve --port`.
4. Endpoint `/app` como health check.
5. Endpoint `/tui/append-prompt` con `{ text }` JSON.
6. HTML con `<head>` y `Content-Type: text/html`.
7. localStorage `opencode.global.dat:server` con forma compatible.
8. Frontend que acepte drops sinteticos y APIs browser usadas.
