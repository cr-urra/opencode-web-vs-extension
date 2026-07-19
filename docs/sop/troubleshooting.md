# SOP: troubleshooting

## Primera recoleccion

Registrar antes de cambiar codigo:

```bash
code --version
opencode --version
bun --version
node --version
```

En VS Code abrir `View > Output` y seleccionar `OpenCode`. Capturar desde `Activating extension` hasta el fallo, evitando compartir rutas o prompts sensibles.

## Dos versiones instaladas al mismo tiempo

Sintoma: se instala un VSIX local con un fix, `code --install-extension ... --force` reporta exito, pero el comportamiento no cambia nada, como si el fix nunca se hubiera aplicado.

Causa: `package.json` declara `publisher: "UWEsmith"`, pero la extension original en Marketplace puede estar publicada como `sst-dev.opencode-web-for-ide` (ver ambigueedad de autoria en `docs/sop/release-y-publicacion.md`). VS Code identifica una extension por `publisher.name`, no solo por `name`: instalar el VSIX local con un publisher distinto NO reemplaza la version de Marketplace, la instala al lado. Ambas activan sobre el mismo `onView:opencode.sidebar` y compiten por el mismo panel.

Diagnostico:

```bash
code --list-extensions --show-versions | grep -i opencode
```

Si aparece mas de una linea, revisar `exthost.log` de la ventana afectada (ver seccion siguiente para ubicarlo) buscando:

```text
ExtensionService#_doActivateExtension sst-dev.opencode-web-for-ide, activationEvent: 'onView:opencode.sidebar'
ExtensionService#_doActivateExtension UWEsmith.opencode-web-for-ide, activationEvent: 'onView:opencode.sidebar'
[error] Error: View provider for 'opencode.sidebar' already registered
```

La que se registra primero gana el panel; la otra falla al activarse y su codigo nunca corre, sin que la UI lo indique.

Fix:

```bash
code --uninstall-extension sst-dev.opencode-web-for-ide
```

(reversible, se reinstala desde Marketplace si hace falta). Despues correr `Developer: Reload Window` — la desinstalacion no reactiva extensiones ya cargadas en una ventana abierta. Esto es exactamente por lo que `docs/sop/release-y-publicacion.md` pide instalar el VSIX en un perfil limpio antes de validar: evita este conflicto por completo.

## Leer Output sin abrir la GUI

Cada canal de Output que un extension host escribe con `createOutputChannel` tambien se persiste en disco, util para revisar logs de forma remota o sin tocar el mouse/teclado del usuario.

```bash
# Sesion de logs mas reciente
ls -td ~/Library/Application\ Support/Code/logs/*/ | head -1

# Mapear cada ventana a su carpeta de workspace
grep -m1 "Skipping acquiring lock" "<sesion>/window<N>/exthost/exthost.log" | grep -oE '[a-f0-9]{32}'
cat ~/Library/Application\ Support/Code/User/workspaceStorage/<hash>/workspace.json

# Carpeta de log del canal OpenCode para esa ventana (la mas reciente si hubo reload)
ls -dt "<sesion>/window<N>/exthost/output_logging_"*/ | head -1
cat "<esa-carpeta>"/*OpenCode*.log
```

Una recarga de ventana (`Developer: Reload Window`) crea una carpeta `output_logging_<timestamp>` nueva dentro de la misma ventana; usar siempre la mas reciente por fecha, no asumir que hay una sola.

## La vista no aparece

1. Confirmar que la extension esta habilitada.
2. Ejecutar manualmente un comando `OpenCode` o abrir el contenedor desde Activity Bar.
3. Revisar la Developer Console del Extension Host.
4. Confirmar que `dist/extension.js` existe en desarrollo local.
5. Ejecutar `bun run compile` y relanzar F5.

## `Could not load opencode`

El texto indica erroneamente “terminal output”; el proceso usa `stdio: "ignore"`. La evidencia disponible esta en Output `OpenCode`.

1. Verificar `opencode --version` desde el entorno que lanza VS Code.
2. Lanzar VS Code desde el shell para descartar diferencias de PATH.
3. Probar manualmente `opencode serve --port <puerto-libre>` en una carpeta de prueba.
4. Verificar que `GET /app` responda antes de aproximadamente cinco segundos.
5. Revisar permisos del workspace y que el ancestro comun sea valido.
6. Considerar incompatibilidad de version del CLI con `/app` o `serve --port`.

La seleccion aleatoria no reserva puerto; una colision no se reintenta con otro puerto.

## La UI carga pero no actualiza

1. Buscar `Proxy request failed` o `Proxy websocket failed`.
2. Confirmar que el child sigue vivo.
3. Ocultar/mostrar la vista para provocar health check y reload.
4. Si el child murio despues de ready, recargar el Extension Host; no hay restart automatico.
5. Confirmar compatibilidad WebSocket de la version OpenCode.

## Referencias no aparecen

1. Confirmar `Dropping refs into OpenCode webview` en Output.
2. Verificar que el recurso pertenece a un workspace registrado.
3. Confirmar que la app ya estaba lista; no hay cola ni ACK y un mensaje temprano se pierde.
4. Si la vista fue dispuesta, recargar el Extension Host: puede quedar una referencia stale y omitirse el fallback HTTP.
5. En multi-root, comparar el path generado con el `cwd` comun registrado.
6. Probar el comando activo y el picker por separado.
7. Confirmar que OpenCode aun acepta drops `file:<relative-path>`.

## Attachments no aparecen

1. Confirmar que el recurso es archivo, no directorio.
2. Revisar `Attach failed to read` o `Attach ignored non-file resource`.
3. Usar un archivo pequeno para descartar presion de memoria.
4. Confirmar `Attaching files to OpenCode` y `prepared synthetic attachment`.
5. Confirmar que el bootstrap fue inyectado. Sin workspace root no se inyecta.
6. Probar un MIME conocido: PNG, JPEG, GIF, WebP, SVG o PDF.
7. Guardar un editor dirty antes de adjuntarlo: el flujo lee la version persistida, no el buffer sin guardar.

## Clipboard o shortcuts fallan

### Todos los sistemas

1. Buscar `clipboard bridge installed`.
2. Revisar respuestas 500 y logs `Clipboard read/write failed`.
3. Confirmar que el contenido servido sigue permitiendo el bootstrap.

### macOS

1. Confirmar foco dentro del sidebar `opencode.sidebar`.
2. Buscar `edit command bridge installed`, `paste bridge installed` y `OpenCode iframe bridge ready`.
3. Probar comandos desde Command Palette para separar keybinding de bridge.
4. Revisar inserciones duplicadas o target incorrecto; los fallbacks usan eventos sinteticos y `execCommand`.
5. Si `Cmd+V` funciona recien enfocado pero falla despues de unos segundos de espera: no es perdida de foco real (confirmado con `webview-bug-qa`, capa webapp aislada no reproduce el problema). Es el `when` clause del keybinding de VS Code (`webviewId == 'opencode.sidebar'`) que puede dejar de evaluarse como verdadero con el tiempo, un limite conocido de VS Code (microsoft/vscode#129178), no algo reproducible ni arreglable desde este repo. Buscar `parent keydown captured: paste` en Output — confirma que se activo la ruta de respaldo capturada en el documento padre del webview en vez del keybinding oficial.
6. Antes de concluir que un fix no funciona, descartar primero "Dos versiones instaladas al mismo tiempo" (seccion arriba): si la extension con el fix nunca logro activarse, ninguno de estos logs va a aparecer.

En Windows/Linux los comandos edit contribuidos pueden verse, pero el host los ignora intencionalmente.

## Workspace incorrecto

1. Leer `Resolved workspace root` en Output.
2. Compararlo con todas las carpetas del workspace.
3. En drives Windows diferentes el root sera `undefined`.
4. Si el root es home, `/` o drive root, detener la prueba: el alcance puede ser demasiado amplio.
5. Recordar que el contexto anexado enumera rutas absolutas aunque no haya root comun.

## Procesos huerfanos

1. Cerrar el Extension Development Host.
2. Inspeccionar procesos `opencode serve` con herramientas del sistema.
3. Terminar solo los procesos identificados como creados por la sesion de prueba.
4. Registrar SO, secuencia de visibilidad/reload y logs de `Started`/`exited`.

Las causas probables son startups concurrentes, cierre no esperado o `shell: true` en Windows.

## Escalamiento de un bug

Incluir:

- Version de extension, VS Code, SO y CLI OpenCode.
- Tipo de workspace: simple, multi-root, remote o virtual.
- Pasos minimos y resultado esperado/actual.
- Logs sanitizados de Output.
- Si fallo `/app`, `/tui/append-prompt`, WebSocket, drop o localStorage.
- Confirmacion de proceso huerfano y consumo de memoria, si aplica.
