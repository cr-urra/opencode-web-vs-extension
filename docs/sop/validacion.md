# SOP: validacion de cambios

## Objetivo

Aplicar el conjunto minimo de verificaciones automaticas y manuales antes de integrar un cambio.

## Secuencia automatica base

Con dependencias instaladas:

```bash
bun run check-types
bun run lint
bun run test:unit
bun run package
```

Interpretacion:

- `check-types`: TypeScript estricto sin emitir.
- `lint`: inspeccion ESLint; warnings no hacen fallar el comando actual.
- `test:unit`: compila `src/` a `out/` y ejecuta solo `out/pathUtils.test.js` con `node:test`.
- `package`: vuelve a ejecutar tipos/lint y genera `dist/extension.js` productivo.

## No usar como unica evidencia

```bash
bun run test
```

Actualmente llama `vscode-test`, pero no hay `.vscode-test.*` ni suite Mocha compatible. Debe considerarse un gap conocido hasta crear la configuracion/suite o corregir el script.

## Matriz por tipo de cambio

| Area cambiada | Validacion adicional obligatoria |
| --- | --- |
| `src/pathUtils.ts` | Agregar casos POSIX, Windows y UNC en `pathUtils.test.ts`. |
| Lifecycle/proceso | Startup limpio, reuse, sidebar visible/oculta, child exit y cierre sin huerfanos. |
| Proxy HTTP | HTML inyectado, assets streaming, error 502, headers y body grande controlado. |
| WebSocket | Upgrade y trafico bidireccional; cierre del host y del target. |
| Mensajes webview | Payload valido/invalido, origen/source, orden, app no lista, vista dispuesta/stale y ACK/fallo. |
| Referencias | Editor, lineas, Explorer multiple, directorio, fuera de workspace y multi-root. |
| Attachments | MIME conocido/desconocido, duplicados, unreadable, externo, editor dirty/untitled y limites. |
| Clipboard/edicion | macOS real; confirmar que no duplica paste ni intercepta otros targets. |
| `package.json` | Comando visible, menu, shortcuts por SO, engine y manifest consistency. |
| Build/tooling | Checkout limpio, install frozen, build desarrollo/productivo. |
| Release | VSIX inspeccionado localmente; no publicar durante validacion. |
| Documentacion | Links relativos, indice y concordancia con codigo. |

## Escenarios manuales esenciales

### Workspace simple

1. Abrir una carpeta.
2. Verificar `cwd` y contexto en Output.
3. Comprobar referencia, attachment y clipboard.

### Multi-root cercano

1. Abrir dos carpetas bajo un padre comun.
2. Verificar el ancestro comun registrado.
3. Enviar archivos con nombres iguales desde ambas carpetas.
4. Confirmar como los resuelve OpenCode.

### Multi-root amplio

1. Abrir carpetas cuyo unico padre comun sea home, `/` o drive root.
2. No usar datos sensibles.
3. Confirmar el alcance antes de permitir que el agente opere.
4. Registrar cualquier acceso fuera de los folders reales como defecto.

### Fallos

1. Ejecutar sin `opencode` en PATH.
2. Usar una version incompatible o un servidor que no responde `/app`.
3. Matar el child despues de ready.
4. Confirmar UI, logs y ausencia de procesos huerfanos.

### Clipboard y drag-and-drop en macOS (caso Tahoe vs Mac antiguo)

Contexto: bug reportado donde paste y drag-and-drop no funcionan en un MacBook nuevo con
macOS Tahoe, pero si funcionan en un MacBook de 2012. Fix en rama `feature/clipboard-mac`
(ver `src/extension.ts`: captura de drop en el documento padre del webview, fallback de
paste para `contenteditable` via Selection/Range, y fallback final a `/tui/append-prompt`).

Precondicion: instalar el VSIX de prueba (`dist/opencode-clipboard-mac-test.vsix`) y abrir
`Output > OpenCode` antes de cada paso para leer los logs en tiempo real.

**Caso 1: Paste via atajo de teclado (Cmd+V)**

1. Abrir la sidebar de OpenCode con un workspace cargado.
2. Copiar un texto de varias lineas fuera de VS Code (por ejemplo desde Notas o Safari).
3. Hacer click en el prompt de OpenCode para enfocarlo y ubicar el cursor en medio de un
   texto existente (no al final).
4. Presionar `Cmd+V`.
5. Esperado: el texto copiado se inserta exactamente en la posicion del cursor, sin
   duplicarse y sin perder el texto que ya estaba escrito.
6. En Output deberia verse la secuencia: `edit paste requested clipboard text` ->
   `Clipboard read requested ... N chars` -> uno de:
   `clipboard paste event handled`, `clipboard inserted with execCommand`,
   `clipboard inserted into input` o `clipboard inserted into contenteditable`.
7. Si en cambio aparece `clipboard text could not be inserted, falling back to
   append-prompt`, el texto debe igual aparecer en la conversacion (como mensaje
   nuevo via `/tui/append-prompt`), nunca debe perderse en silencio.

**Caso 2: Paste via Command Palette**

1. Con el prompt de OpenCode enfocado, abrir la Command Palette y ejecutar
   `OpenCode: Paste into OpenCode`.
2. Esperado: mismo resultado y mismos logs que el Caso 1.

**Caso 3: Paste via menu Edit > Paste**

1. Repetir con el menu nativo `Edit > Paste` de macOS en vez del atajo.
2. Esperado: mismo resultado. Sirve para descartar que el problema sea especifico del
   atajo de teclado (foco/`webviewId`) y no del mecanismo de insercion.

**Caso 4: Drag and drop de archivo desde Finder**

1. Arrastrar un archivo (imagen o texto) desde Finder hacia el prompt de OpenCode.
2. Esperado: el archivo se adjunta como attachment.
3. En Output: `parent drop resolved N file(s)` (nueva captura a nivel del webview padre).
   Si en su lugar aparece `drop types: ...` seguido de `redispatched synthetic attachment
   drop`, significa que el drop si llego al iframe directamente (ruta antigua) - anotar
   cual de las dos rutas se activo, ya que es el dato clave para confirmar el diagnostico.

**Caso 5: Drag and drop de archivo desde el Explorer de VS Code**

1. Arrastrar un archivo del Explorer (dentro del workspace) hacia el prompt de OpenCode.
2. Esperado: se inserta la referencia `@ruta/relativa` sin abrir el archivo en un editor
   nuevo ni duplicar la referencia.
3. En Output: `parent drop requesting fallback for N uri(s)` seguido de la resolucion en
   el extension host (`Resolved drop fallback ...`).

**Caso 6: Regresion en Mac antiguo**

1. Repetir los Casos 1 a 5 en el MacBook 2012 (o el entorno donde el bug ya estaba
   resuelto).
2. Esperado: mismo comportamiento correcto que antes del fix, sin duplicar drops ni
   pegar texto dos veces. Si aparecen logs de la ruta nueva (`parent drop ...`) ademas de
   los de la ruta antigua para el mismo evento, es señal de doble insercion y debe
   tratarse como regresion critica.

**Datos a registrar si algun caso falla:**

- Version de VS Code/Electron/Chromium (`Code > About`).
- Version de `opencode` (`opencode --version`).
- Arquitectura (Apple Silicon / Intel).
- Ultima linea de Output antes de que el caso fallara.

## Revision de artefacto

Antes de una publicacion, inspeccionar que el VSIX incluya como minimo:

- `package.json`.
- `README.md`.
- `LICENSE`.
- `dist/extension.js`.
- `images/icon.png` e `images/icon.svg`.

Y que no incluya secretos, `.env`, fuentes no intencionales, `node_modules`, sourcemaps,
outputs de test, ni archivos sin trackear en git que queden sueltos en el working tree
(carpetas de scratch de herramientas de debugging como `.playwright-cli/`, docs de trabajo
en progreso, etc.). `.vscodeignore` no filtra por estado de git: cualquier cosa que exista
en disco puede terminar dentro del VSIX aunque nunca se haya commiteado. Revisar siempre el
arbol de "Files included in the VSIX" que imprime `vsce`, no asumir que `.vscodeignore` ya
lo cubrio.

## Criterio de salida

Un cambio queda validado cuando:

1. Pasan los comandos automaticos aplicables.
2. Se ejecutan los escenarios manuales de su area.
3. No aparecen errores nuevos en Output ni procesos huerfanos.
4. Se actualizan los documentos afectados.
5. Se registran limitaciones no resueltas, en vez de ocultarlas.
