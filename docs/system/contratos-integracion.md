# Contratos de integracion

Este documento lista interfaces publicas e internas que un cambio debe preservar o versionar.

## Contrato VS Code

### Vista

| ID | Tipo | Contenedor |
| --- | --- | --- |
| `opencode.sidebar` | `webview` | Activity Bar `opencode` |

La extension ejecuta el comando interno `workbench.view.extension.opencode` para abrirla.

### Comandos

| ID | Entrada VS Code | Resultado |
| --- | --- | --- |
| `opencode.addFilepathToTerminal` | Editor/tab activo y seleccion | Anexa `@path[#Lx[-Ly]]` al prompt. |
| `opencode.addToOpenCode` | URI y seleccion del Explorer, o archivo activo | Drop de referencias o append fallback. |
| `opencode.addFilesToOpenCode` | Picker multiarchivo | Referencias. |
| `opencode.attachToOpenCode` | Explorer, archivo activo o picker | Bytes como attachments browser. |
| `opencode.attachFilesToOpenCode` | Picker multiarchivo | Attachments browser. |
| `opencode.pasteIntoOpenCode` | Ninguna | Comando de edicion macOS. |
| `opencode.copyInOpenCode` | Ninguna | Comando de edicion macOS. |
| `opencode.cutInOpenCode` | Ninguna | Comando de edicion macOS. |
| `opencode.selectAllInOpenCode` | Ninguna | Comando de edicion macOS. |
| `opencode.undoInOpenCode` | Ninguna | Comando de edicion macOS. |
| `opencode.redoInOpenCode` | Ninguna | Comando de edicion macOS. |

IDs, menus y shortcuts estan declarados en [`package.json`](../../package.json#L49-L208); handlers en [`src/extension.ts`](../../src/extension.ts#L49-L151).

## Contrato con el CLI OpenCode

### Proceso

```text
executable: opencode
args:       serve --port <port>
cwd:        workspaceRoot, si existe
```

Variables agregadas:

| Variable | Valor |
| --- | --- |
| `_EXTENSION_OPENCODE_PORT` | Puerto objetivo en decimal. |
| `OPENCODE_CALLER` | `vscode`. |
| `PWD` | Workspace root, si existe. |
| `INIT_CWD` | Workspace root, si existe. |

El resto de `process.env` se hereda sin filtrado.

### HTTP privado consumido

| Metodo/ruta | Request | Exito esperado | Uso |
| --- | --- | --- | --- |
| `GET /app` | Sin body | Cualquier 2xx | Readiness/health. |
| `POST /tui/append-prompt` | JSON `{ "text": string }` | Cualquier 2xx | Referencias y contexto. |

Estos endpoints no estan versionados por este proyecto. Un cambio de OpenCode puede romperlos sin error de compilacion.

### Estado browser privado

Clave: `opencode.global.dat:server`.

El bootstrap espera JSON objeto y modifica:

```json
{
  "list": [],
  "projects": {
    "local": [{ "worktree": "/ruta/workspace", "expanded": true }]
  },
  "lastProject": {
    "local": "/ruta/workspace"
  }
}
```

Conserva otras propiedades y proyectos locales diferentes. No existe migration ni deteccion de schema.

## Endpoints del proxy de extension

Todos se sirven en loopback sin token de capacidad ni validacion de origen.

La columna “metodo usado” describe al consumidor actual. La implementacion acepta cualquier metodo para log, clipboard-read y bootstrap; solo clipboard-write y append-prompt exigen `POST`. Log ademas compara la ruta por prefijo.

| Metodo usado/ruta | Request | Response | Consumidor actual |
| --- | --- | --- | --- |
| `GET /__opencode_extension_log?message=...` | Query libre | `204` | Bootstrap inyectado. |
| `POST /__opencode_extension_clipboard` | Texto UTF-8 | `204` o `500` | Patch de `navigator.clipboard.writeText`. |
| `GET /__opencode_extension_clipboard_read` | Ninguna | Texto UTF-8 o `500` | Patch de `navigator.clipboard.readText`. |
| `POST /__opencode_extension_append_prompt` | Texto UTF-8 | `204` o `500` | Sin productor actual. |
| `GET /__opencode_extension_bootstrap.js` | Ninguna | JavaScript no-cache | Script inyectado. |

Los bodies y mensajes no tienen limite de tamano.

## Protocolo `postMessage`

### Iframe hacia Extension Host

El iframe publica a su padre; el wrapper reenvia a `vscode.postMessage`.

| `source` | Payload | Respuesta |
| --- | --- | --- |
| `opencode-drop-fallback` | `{ id: string, uris: string[] }` | `opencode-drop-fallback-result` |
| `opencode-clipboard-read` | `{ id: string }` | `opencode-clipboard-read-result` |
| `opencode-clipboard-write` | `{ id: string, text: string }` | `opencode-clipboard-write-result` |

`opencode-paste-clipboard` tiene handler en host, pero el wrapper no lo reenvia: ruta actualmente inalcanzable desde iframe.

### Extension Host hacia iframe

| `source` | Payload principal | Efecto |
| --- | --- | --- |
| `opencode-drop-fallback-result` | `{ id, paths }` | Drops sinteticos de paths resueltos. |
| `opencode-clipboard-read-result` | `{ id, text, error? }` | Inserta texto en macOS. |
| `opencode-clipboard-write-result` | `{ id, ok, error? }` | Solo diagnostico browser. |
| `opencode-edit-command` | `{ command }` | copy/cut/paste/selectAll/undo/redo. |
| `opencode-drop-paths` | `{ paths: string[] }` | Un drop sintetico por path. |
| `opencode-attach-files` | `{ files: Attachment[] }` | Reconstruye `File[]` y hace drop. |
| `opencode-insert-text` | `{ text }` o `{ texts }` | Soportado por iframe, sin productor host actual. |

No hay handshake de app lista, acknowledgements de entrega ni validacion de `event.origin`/`event.source`; ambos lados usan target origin `"*"`.

## Formatos de recursos

### Referencia activa

```text
@ruta/relativa.ts
@ruta/relativa.ts#L12
@ruta/relativa.ts#L12-L20
```

Las lineas son one-based. La seleccion usa la linea final literal; una seleccion que termina en columna cero de la siguiente linea puede incluir una linea adicional.

### Drop de referencia

Cada path se transforma en:

```text
text/plain:    file:ruta/relativa
text/uri-list: file:ruta/relativa
```

Se despacha `DragEvent("drop")` al elemento activo o `document.body`.

### Attachment

```ts
type Attachment = {
  name: string
  type: string
  data: string // base64
}
```

MIME reconocidos: GIF, JPEG, PDF, PNG, SVG y WebP; lo demas es `application/octet-stream`.

## Resolucion de paths

- `getActiveFile()` usa `asRelativePath(activeUri)` y exige membership en workspace.
- Explorer/picker de referencias usa `asRelativePath(uri, false)` y exige membership.
- Attachments aceptan archivos externos si VS Code entrega su URI.
- Un attachment de un editor dirty lee `workspace.fs`: transfiere la version guardada, no cambios sin guardar. Documentos untitled normalmente no producen attachment directo y pueden caer al picker.
- Fallback de URI remoto exige `getWorkspaceFolder(uri)` y usa `workspace.fs`.
- Normalizador browser compara lexicalmente contra el ancestro comun, no contra cada carpeta real.

En multi-root, un path relativo a una carpeta individual puede no coincidir con el `cwd` del ancestro comun y puede colisionar con otro folder.

## Compatibilidad que debe probarse

Antes de cambiar o actualizar OpenCode:

1. `opencode serve --port` sigue siendo valido.
2. `/app` responde y carga HTML con `<head>`.
3. HTTP y WebSocket funcionan a traves del proxy.
4. `/tui/append-prompt` conserva request/semantica.
5. La clave de localStorage conserva forma.
6. El frontend sigue aceptando drops `file:` y attachments sinteticos.
7. Clipboard y shortcuts funcionan en macOS sin duplicar inserciones.
