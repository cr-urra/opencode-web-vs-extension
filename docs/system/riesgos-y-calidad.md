# Riesgos, seguridad y calidad

## Modelo de confianza

| Limite | Privilegios/datos | Suposicion actual |
| --- | --- | --- |
| Workspace -> Extension Host | Paths, archivos y posible configuracion hostil | Se activa y ejecuta CLI sin consultar workspace trust. |
| Extension Host -> OpenCode child | Entorno completo, cwd y permisos del usuario | CLI encontrado en `PATH` es confiable y compatible. |
| OpenCode frontend -> bridge | Clipboard, archivos, logs y mensajes | Cualquier contenido del origen proxied se considera confiable. |
| Procesos locales -> proxy loopback | Endpoints privilegiados | Loopback es tratado como frontera suficiente. |
| Extension -> APIs privadas OpenCode | Endpoints, storage, eventos DOM | Permaneceran compatibles sin version negotiation. |

## Registro priorizado

### Alta

| Riesgo | Evidencia | Impacto |
| --- | --- | --- |
| Endpoints de clipboard/prompt sin autenticacion ni limites | `startProxyServer`, lineas 405-479 | Procesos locales, y potencialmente contenido web segun politicas del browser, pueden leer/escribir clipboard o anexar prompts. |
| Mensajes privilegiados sin validar origen/source | Wrapper y bootstrap, lineas 592-611 y 782-795 | Contenido comprometido del iframe puede cruzar al VS Code API. |
| Arranques concurrentes no serializados | Multiples callers de `loadSidebar`; estado compartido | Procesos huerfanos, proxy cruzado, estado borrado por callbacks viejas. |
| Ancestro comun demasiado amplio | `getCommonParentPath`, `getWorkspaceRoot` | OpenCode puede arrancar en home, `/` o drive root, mas alla del workspace. |
| Sin workspace trust | Activacion automatica y `spawn` | Un workspace no confiable dispara un ejecutable con permisos del usuario. |
| Buffering/attachments sin limites | HTTP bodies, HTML y base64 | Bloqueo o agotamiento de memoria del Extension Host/webview. |

### Media

| Riesgo | Consecuencia |
| --- | --- |
| Cierre best-effort, no espera ni mata sockets/descendientes | Procesos o conexiones sobreviven al cierre. |
| Puerto objetivo aleatorio no reservado | Colision o conexion accidental a otro servicio con `/app`. |
| Bind del CLI no forzado | La exposicion real depende del default de OpenCode. |
| Requests sin timeout individual | Un fetch aceptado pero colgado evita que termine el retry global. |
| Mensajes enviados antes de app lista y sin ACK | Acciones de usuario se pierden silenciosamente. |
| Referencias multi-root inconsistentes | Paths incorrectos o ambiguos para el cwd comun. |
| Soporte remote/virtual no definido | localhost, spawn y `fsPath` pueden no representar el mismo entorno. |
| External HTTPS incompleto | El codigo parsea HTTPS pero usa `http.request` y TCP sin TLS. |
| Containment browser lexical | `..`, casing Windows y UNC pueden resolverse incorrectamente. |
| Dependencia de APIs privadas y eventos sinteticos | Actualizaciones de OpenCode/Chromium pueden romper integracion. |
| CLI stdout/stderr descartados | Diagnostico insuficiente de fallos de startup. |
| Logs de primera linea y paths absolutos | Exposicion de informacion sensible en Output. |

### Baja o mantenibilidad

- `src/extension.ts` concentra responsabilidades y dificulta pruebas.
- Protocolos muertos (`opencode-insert-text`, append proxy, paste handler parcial) amplian superficie.
- `document.execCommand` esta deprecado.
- El iframe no tiene `title`; loading/error no tienen semantica accesible ni retry.
- `sidebarWebview` no se limpia al disponer la vista; mensajes pueden dirigirse a una referencia stale y perder el fallback.
- `getStatusHtml` no escapa su argumento, aunque hoy recibe constantes.
- MIME map limitado y attachments con basenames duplicados.
- Reabrir la vista recrea el iframe y estado transitorio.

## Observabilidad

### Disponible

- Output channel `OpenCode` con timestamp ISO.
- Logs de activacion, raiz, proceso, readiness, proxy, WebSocket, bridge, drops, attachments y clipboard.
- HTTP 502 cuando falla un request proxied.
- Pagina generica de error si el startup no queda listo.

### Faltante o enganoso

- `stdio: "ignore"` elimina stdout/stderr del CLI.
- El mensaje pide revisar “opencode terminal output”, pero no existe terminal.
- `formatError()` pierde stack y conserva solo message.
- No hay correlation/generation ID para distinguir arranques.
- No hay metricas, telemetry, health continuo, restart ni diagnostico exportable.
- No existe una estrategia uniforme: condiciones esperadas suelen registrarse, pero rechazos de `appendPrompt`/`postMessage` pueden propagarse sin log propio y el resultado de entrega de `postMessage` se ignora.

## Cobertura de pruebas actual

Solo hay ocho unit tests de `getCommonParentPath`:

- Windows single-root y common parent.
- Drive root y drives diferentes.
- UNC y casing Windows.
- Common parent y casing POSIX.

No existe cobertura para activacion, comandos, proceso, proxy, WebSocket, inyeccion, mensajes, clipboard, attachments, workspace changes, cierre o compatibilidad real con OpenCode.

El script `test` usa `vscode-test`, pero no existe `.vscode-test.*`; ademas las pruebas escritas usan `node:test`, mientras `vscode-test` ejecuta Mocha. `test:unit` es el unico recorrido de test claramente definido.

## Calidad de tooling y distribucion

1. TypeScript usa `strict`, pero `skipLibCheck` oculta errores de declarations.
2. `@types/vscode` con rango caret puede resolver APIs posteriores al engine minimo 1.94.
3. ESLint solo emite warnings y no usa `--max-warnings=0`.
4. No hay formatter ni `.editorconfig`.
5. No hay CI ni matriz macOS/Windows/Linux.
6. No hay clean, coverage, artifact inspection ni package smoke test.
7. `bun.lock` conserva un nombre de paquete viejo.
8. `sst-env.d.ts` parece residuo de otro stack.
9. `package.json` declara MIT, mientras `LICENSE` contiene GPL-3.0.
10. El repository URL del manifest apunta a upstream, no a este repositorio.
11. Herramientas de publicacion no estan fijadas como dependencias.

## Controles recomendados antes de ampliar funcionalidad

1. Serializar lifecycle con una unica operacion de startup y generation token.
2. Definir politica de workspace root y bloquear raices amplias no intencionales.
3. Usar workspace trust antes de spawn/acceso privilegiado.
4. Proteger endpoints/mensajes con token por sesion, origen y source esperados.
5. Limitar cuerpos, HTML y attachments; implementar cancelacion/timeouts.
6. Capturar diagnosticos del CLI sin exponer secretos.
7. Extraer componentes testeables para proxy, recursos y protocolos.
8. Crear tests de Extension Host e integracion con una version fijada de OpenCode.
9. Resolver metadata/licencia antes de la siguiente publicacion.
