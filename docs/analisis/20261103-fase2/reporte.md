# Fase 2: comparación de la raíz y la referencia Mac

Fecha: 3 de noviembre de 2026, America/Santiago.

**Estado: fase 2 completada.** La raíz ya contiene los cuatro comandos y el puente de menciones/adjuntos de la referencia Mac. No se identificó una adaptación ausente que sea necesaria para los recorridos de archivos validados en la fase 1. Las diferencias específicas de Mac pendientes pertenecen principalmente al pegado y a la captura del teclado; se proponen como candidatos de una fase 3 selectiva, con criterios de validación explícitos.

No se modificaron fuentes, manifiestos, dependencias ni bundles. Esta fase produjo únicamente documentos, un comparador local y sus resultados. No se inició OpenCode, no se repitieron pruebas gráficas, no se generó un VSIX y no se publicó nada.

## Alcance y base de comparación

- Raíz: versión 1.14.43; [extension.ts](../../../src/extension.ts), [package.json](../../../package.json).
- Referencia Mac: versión 1.14.41; [extension.ts](../../../mac-version/opencode-web-vs-extension-feature-clipboard-mac/src/extension.ts), [package.json](../../../mac-version/opencode-web-vs-extension-feature-clipboard-mac/package.json).
- Evidencia funcional existente: [baseline de teclado y arranque](../../qa/20261101-macos-baseline/reporte.md) e [informe de comandos](../../qa/20261102-arrastre-manual/reporte.md).
- Menciones y adjuntos mediante comandos: dentro del alcance. Arrastre físico: excluido por el usuario. Los eventos sintéticos usados internamente por esos comandos se incluyen en la comparación porque forman parte de su transporte.

El análisis usa los archivos locales presentes, sin asumir que el árbol de documentación de la copia Mac describe también el estado actual de la raíz. El inventario y los hashes están en [comparacion.json](comparacion.json).

## Adaptaciones ya incorporadas

La comparación de tokens de TypeScript conserva los literales y omite espacios y comentarios. No es una prueba de equivalencia semántica, pero permite comprobar identidad del código comparado.

| Área | Resultado y evidencia local | Decisión |
| --- | --- | --- |
| Cuatro comandos de archivos | Identidad de títulos, IDs, eventos de activación, menús de Explorer y atajos. Identidad de los handlers `addToOpenCodeDisposable`, `addFilesToOpenCodeDisposable`, `attachToOpenCodeDisposable` y `attachFilesToOpenCodeDisposable`. Raíz: extension.ts, líneas 108, 113, 152 y 157; Mac: 63, 68, 97 y 102. | Conservar los comandos actuales; no requieren portabilidad adicional desde Mac. |
| Preparación de menciones | `addRefsToOpenCode`, `getWorkspaceUriRefs`, `getActiveFile` y las utilidades de paths son idénticos. Raíz: líneas 119, 1123 y 1087. | Conservar. La fase 1 confirmó menciones individuales y múltiples. |
| Lectura de adjuntos | `getAttachUris`, `readAttachmentFiles` y `getMimeType` son idénticos. Raíz: líneas 1159, 1178 y 1209. | Conservar. |
| Orquestación de adjuntos | La raíz separa `attachFilesToOpenCode` para reutilizarlo desde el terminal y lee los archivos antes de asegurar el servidor. La referencia lo concentra en `attachUrisToOpenCode`. El mensaje de entrega sigue siendo `opencode-attach-files`. | Mantener la organización de la raíz; la diferencia no exige trasladar código Mac. |
| Puente de menciones | `installDropPathsBridge`, `dispatchOpenCodeDrop` y `dispatchOpenCodeDrops` son idénticos en el JavaScript generado. | Conservar el transporte sintético que ya utilizan los comandos. |
| Puente de adjuntos | `installAttachmentBridge`, `bytesFromBase64` y `dispatchAttachmentDrop` son idénticos. | Conservar; ambos adjuntos múltiples quedaron comprobados en la fase 1. |
| Edición básica de macOS | Mismos seis keybindings con `when: isMac && webviewId == 'opencode.sidebar'`; `sendEditCommandToOpenCode`, `installEditCommandBridge` e `installClipboardBridge` idénticos. Los caminos de edición específicos siguen condicionados a macOS. | Conservar. La ausencia de la captura adicional del padre no significa ausencia del soporte Mac completo. |

En total, 27 funciones nombradas del puente generado son idénticas. Cuatro difieren y una existe únicamente en Mac. El comparador distingue este JavaScript de las funciones TypeScript del host.

## Avances de la raíz que deben preservarse

| Área | Implementación de la raíz | Motivo para conservarla |
| --- | --- | --- |
| Detección del ejecutable | [opencodeExecutable.ts](../../../src/opencodeExecutable.ts), configuración `opencodeWeb.executablePath` y tratamiento de ubicaciones/PATH por plataforma. | La referencia ejecuta `opencode` directamente. Reemplazar el arranque perdería la resolución actual, incluida la de instalaciones macOS fuera del PATH del editor. |
| Compatibilidad y autenticación | [opencodeCompatibility.ts](../../../src/opencodeCompatibility.ts); contraseña aleatoria, Basic Auth hacia el servidor y token inicial del iframe; detección de generación por versión/HTML. | En el baseline la raíz se autenticó automáticamente; la referencia necesitó conexión manual. La raíz evita el append legacy del contexto para v2. |
| Inicio y diagnóstico | `loadSidebar`, `waitForServer` y `showStartupError`, líneas 279, 974 y 404. Manejo de error/exit, timeout de los fetch de sondeo y mensajes de configuración. | Son mejoras propias de la raíz; no deben sustituirse por el arranque de la referencia. Esto no acredita que el lifecycle esté completamente serializado. |
| Persistencia de pestañas/sesión | [opencodeBootstrap.ts](../../../src/opencodeBootstrap.ts), `workspaceState` y reescritura del origen anterior al restaurar. | La referencia solo siembra el registro legacy del proyecto. La raíz conserva la integración v2 añadida después. Su eficacia tras un reinicio real queda para la fase de regresión. |
| Vista oculta y disposal | `retainContextWhenHidden` y limpieza de `sidebarWebview`, líneas 45–74. | La referencia vuelve a cargar al mostrar la vista; la raíz conserva el contexto mientras se oculta. |
| Contexto del terminal | `sendTerminalToOpenCode`, línea 503, y comando adicional del manifiesto. | Funcionalidad propia de la raíz que reutiliza el puente de adjuntos. Su prueba de extremo a extremo queda fuera de la matriz de cuatro comandos ya cerrada. |
| Cobertura existente | Pruebas de ejecutable, compatibilidad y bootstrap además de paths. | El baseline registró 24 pruebas unitarias en raíz y 8 en Mac; no se vuelven a contar como pruebas ejecutadas en esta fase. |

## Diferencias Mac pendientes y decisión de fase 3

| ID | Diferencia comprobada en código | Implicación y límites | Decisión propuesta |
| --- | --- | --- | --- |
| M1 | Mac guarda el elemento destino en `pendingClipboardReads[id]` y lo pasa a `insertClipboardText(text, preferredTarget)`. La raíz vuelve a consultar el foco cuando recibe el texto. | Si el foco cambia entre solicitud y respuesta, el destino podría diferir. Es una posibilidad deducida del código, no un fallo observado en la fase 1. Mac conserva el elemento, pero no una copia del rango original del cursor. | Candidato para fase 3: definir el comportamiento ante cambios de foco, probarlo y adaptar el destino de la solicitud. No cambiar los cuatro comandos de archivos. |
| M2 | Mac añade inserción en `contenteditable` mediante Selection/Range si no manejan el pegado el evento ClipboardEvent, `execCommand` ni la vía de input/textarea. La raíz termina registrando que no pudo insertar. | Es una defensa adicional. Los logs del baseline muestran que el frontend manejó el ClipboardEvent; no demuestran haber recorrido este fallback en ninguna variante. | Candidato para fase 3: cobertura del caso donde fallan las vías anteriores y fallback acotado que preserve el texto alrededor del cursor y notifique el input. |
| M3 | Mac captura Cmd+C/X/V/A/Z y Shift+Cmd+Z en el documento padre. La raíz no tiene esa captura. | Añade otra vía de entrada cuando el foco de webview deja de activar el keybinding. El baseline, incluido el pegado demorado, pasó en la raíz. No se ha demostrado que esta vía adicional sea necesaria en el equipo probado. | Condicionar la incorporación a reproducir la pérdida de captura o a una decisión explícita de robustez con pruebas de no duplicación. |
| M4 | Mac aplica `shouldRunEditCommand`: descarta el mismo comando repetido dentro de 500 ms. La raíz no tiene esa ventana. | Puede evitar disparos redundantes, pero también podría descartar dos acciones legítimas rápidas. La referencia aplica además una ventana de 500 ms en la captura del padre. Ambas consecuencias son inferencias del código. | No portar la ventana temporal por defecto. Si se incorpora M3, diseñar la deduplicación del mismo gesto y verificar dos gestos rápidos independientes. |
| M5 | Mac intenta `opencode-paste-clipboard` al fallar todas las inserciones, llegando a `/tui/append-prompt`. La raíz conserva el handler de ese mensaje, pero no ese disparo final desde `insertClipboardText`. | El endpoint legacy devolvió 405 en el OpenCode 2.2.5 del baseline. Añadir ese fallback no demostraría recuperación de pegado en v2. | No portar como solución genérica de v2. Cualquier fallback debe respetar la generación y su contrato probado. |
| M6 | Mac emite `opencode-bridge-ready` y reenvía logs adicionales del wrapper; la raíz incorpora en su lugar el relay de persistencia. | El aviso ready de la referencia únicamente se registra: no hay espera, cola ni confirmación de aplicación del comando. No garantiza por sí mismo que el frontend ya pueda consumir un adjunto o mención. | Conservar la persistencia de la raíz. Si se trabaja la entrega al iniciar, definir un contrato de disponibilidad/confirmación verificable; copiar el aviso no basta. |

Ubicaciones para M1/M2/M4/M5: `getWorkspaceBootstrapScript`, raíz línea 808 y Mac línea 578. Para M3/M6: `getWebviewHtml`, raíz línea 1035 y Mac línea 856. El detalle exacto queda en [src-extension.ts.diff](src-extension.ts.diff) y los nombres de funciones cambiados en [comparacion.json](comparacion.json).

## Elementos excluidos o que no son una adaptación Mac pendiente

- La captura nativa de `dragover`/`drop` del documento padre solo está en Mac. Se excluye por el alcance solicitado. No se elimina el transporte sintético usado por los comandos.
- Los dos wrappers carecen de validación explícita de `event.source`/`event.origin`. La referencia no aporta aquí una solución que pueda trasladarse. No se afirma que la autenticación del servidor de la raíz resuelva esa validación del puente.
- La ausencia de cola/ACK de aplicación para los comandos y la posibilidad de arranques concurrentes son cuestiones compartidas. No se han convertido en defectos reproducidos ni se les ha atribuido un arreglo en esta fase. La regresión de primera acción tras arranque será útil en la fase 4.
- `.vscodeignore`, build, tsconfig, lock y utilidades de paths son iguales. La configuración de exclusiones no declara expresamente `mac-version/**` ni `docs/**`. Antes del VSIX se debe revisar la lista real de archivos y excluir copias/artefactos de trabajo; esta fase no generó un paquete y no afirma cuál sería su contenido exacto.
- Ambos manifiestos declaran MIT y ambos archivos LICENSE contienen GPL-3.0. Es una inconsistencia de metadatos existente en las dos variantes, que debe resolverse antes de publicar; no es una diferencia de soporte Mac ni se cambió aquí.

## Continuación recomendada

**Fase 3 mínima:** cubrir los casos de destino asíncrono y fallback `contenteditable` de M1/M2, y aplicar solamente los ajustes que esos casos justifiquen. Mantener los comandos de archivos y las mejoras v2 de la raíz. Dejar M3 condicionado a evidencia; no trasladar M4/M5 automáticamente. No hay un cambio funcional obligatorio identificado para los cuatro comandos que pasaron la fase 1.

**Fase 4:** tipos, lint, pruebas y build de cualquier cambio; regresión gráfica de comandos/edición, primera acción tras arranque, ocultar/mostrar y restauración de sesiones. Distinguir pruebas reales en macOS de controles de código o simulaciones para Windows/Linux.

**Fase 5:** inspeccionar el contenido real del VSIX, revisar exclusiones y metadatos y probar instalación local. La publicación no forma parte de esta fase 2.

## Reproducción y verificaciones realizadas

Desde la raíz:

```sh
node docs/analisis/20261103-fase2/comparar.cjs
```

El [comparador](comparar.cjs) analiza los AST de ambos archivos, compara handlers y manifiestos, construye los strings del bootstrap/wrapper y comprueba su sintaxis con `node:vm`. Al construir el bootstrap común sustituye únicamente la siembra/persistencia de workspace de la raíz por un comentario; ese módulo se revisa por separado. El código de DOM de los scripts generados no se ejecuta, no se simulan resultados gráficos y no se inicia ningún servidor.

Salidas: [comparacion.json](comparacion.json), [diff de extensión](src-extension.ts.diff), [diff del manifiesto](package.json.diff), [diff de README](README.md.diff) y [verificación del análisis](verificacion.json). Los números de línea corresponden a los hashes registrados. Se verificó que los archivos fuente revisados conservaran sus hashes durante el análisis y que los enlaces locales de este informe existieran.

## Continuación: fase 3

Los ajustes selectivos de pegado y su verificación automática se documentaron en el [informe de fase 3](../../qa/20261103-fase3-pegado/reporte.md). Los JSON/diffs de esta carpeta conservan el estado anterior a esos cambios. El comparador admite el módulo extraído en fase 3; volver a ejecutarlo ahora produce una comparación del código actual y reemplaza sus salidas históricas.

## Resultado posterior de fase 4

La [regresión](../../qa/20261103-fase4-regresion/reporte.md) reprodujo y corrigió la pérdida del primer comando, el arranque concurrente y la ruta de restauración v2. Queda abierta la limitación de undo nativo del fallback Range. Estos hallazgos posteriores no cambian el snapshot comparativo de esta fase.

La [fase 4 quedó cerrada posteriormente](../../qa/20261103-restauracion-activa/reporte.md): inserciones directas de pegado retiradas, sesión activa corregida y retest nativo aprobado. La fase 5 permanece pendiente.
