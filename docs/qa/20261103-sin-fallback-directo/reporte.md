# Retiro de inserciones directas de pegado

Fecha: 3 de noviembre de 2026, America/Santiago.

**Implementación aplicada y regresión funcional aprobada. La corrección posterior de sesión activa también pasó su retest gráfico; fase 4 cerrada para el alcance probado.** Se retiraron las dos inserciones directas del [puente de pegado](../../../src/opencodeClipboard.ts): la asignación de `.value` en inputs/textarea y la modificación del DOM con `Range.deleteContents()`/`insertNode()` en contenteditable.

## Comportamiento actual

El puente conserva el campo y la selección originales mientras solicita el portapapeles. Al recibir la respuesta restaura ese destino, despacha un evento `paste` con texto plano y, si el frontend no lo consume, intenta `execCommand("insertText")`. Si ninguna vía funciona, registra `clipboard text could not be inserted`: no elimina la selección, no reescribe el valor ni inserta nodos directamente. Tampoco emite el evento input que pertenecía a esas inserciones manuales.

Selection/Range sigue siendo necesario para capturar y restaurar la selección; ese uso se conserva. También se mantienen los IDs de solicitud, caducidad, descarte de respuestas duplicadas y protección de destinos desconectados, deshabilitados o read-only.

Se retira así la vía que produjo RANGE-UNDO en la [fase 4](../20261103-fase4-regresion/reporte.md). Esto no demuestra por sí solo el historial nativo del nuevo build: hay que repetir el pegado y undo/redo en VSCodium. El código que maneja los comandos de archivos, los arranques y la restauración de sesiones no cambió en esta revisión.

## Compatibilidad y alcance

El objetivo de validación acordado es **OpenCode 2.2.5, macOS y VSCodium**. La versión instalada se confirmó antes de este cambio. La versión de la extensión sigue siendo 1.14.43; no se añadieron dependencias ni bloqueos por versión. El código continúa detectando legacy/v2, pero esa detección no certifica la compatibilidad gráfica de otras versiones.

La fase 4 mostró consumo real de `paste` y uso de `execCommand` sin activar las inserciones directas en OpenCode 2.2.5. Esa evidencia pertenece a los hashes anteriores. No se reutiliza como PASS del código nuevo. Linux/Windows, OpenCode legacy y otras versiones no están validados gráficamente para esta revisión.

El coste del retiro es explícito: si una interfaz rechaza las dos vías conservadas, el texto no se pegará y habrá un registro del fallo. No se añade una mutación manual como recuperación.

## Comprobaciones ejecutadas — solo logs, sin GUI disponible

Se adaptó el modelo de DOM de las [pruebas de portapapeles](../../../src/opencodeClipboard.test.ts) para representar un frontend que consume paste y se añadieron escenarios donde no lo hace. El código probado es el JavaScript generado por el módulo de producción.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Nuevas expectativas sobre código anterior | 56 pruebas: 52 PASS y 4 FAIL esperados por las mutaciones directas | [Log antes del retiro](logs/antes.txt) |
| Suite completa tras retirar ambas vías | 56/56 PASS | [Log unitario](logs/unitarios.txt) |
| Input y contenteditable: ambas vías rechazan o lanzan error | Contenido y selección preservados; sin input sintético; diagnóstico de fallo | [Pruebas y log](logs/unitarios.txt) |
| Paste manejado por frontend, Unicode, saltos, foco/cursor y selección | PASS en modelo de DOM | [Log unitario](logs/unitarios.txt) |
| execCommand tras paste no consumido o fallido | PASS, una sola inserción sobre la selección original | [Log unitario](logs/unitarios.txt) |
| IDs, duplicados, respuestas fuera de orden, expiración y destinos inválidos | PASS | [Log unitario](logs/unitarios.txt) |
| TypeScript | PASS | [Log de tipos](logs/tipos.txt) |
| ESLint | 0 errores; mismas 754 advertencias previas | [Log de lint](logs/lint.txt) |
| Build productivo | PASS | [Log de build](logs/build.txt) |
| Bootstrap darwin/linux/win32 × legacy/v2 | Seis scripts válidos; sin inserción directa de pegado; configuración y puentes preservados | [Integración](integracion.json), [log](logs/integracion.txt) |
| Compuerta de arranque compartida | Tres comprobaciones PASS | [Log](logs/arranque.txt) |

Las seis pruebas nuevas cubren los fallos de ambas vías en input/contenteditable, errores de dispatch/execCommand y la inserción con execCommand sobre la selección contenteditable restaurada. Las pruebas existentes de pegado exitoso ahora pasan mediante un consumidor paste explícito en el modelo, en lugar de depender del fallback retirado. El modelo representa el protocolo y el texto resultante; no representa el historial de Chromium.

El [verificador de integración](verificar-integracion.cjs) utiliza los módulos de `out/` y compara funciones/configuración preservadas contra Git. Los [hashes anteriores](antes.json) y [resultados actuales](resultados.json) identifican los cambios. Los módulos de extensión, arranque, cola de comandos y package.json conservan sus hashes previos a este retiro.

Build SHA-256: `b626e211e708e4a9f7e05ef7849235fcca0cdf7d5534ff79d52f1c821aaabbaa`.

## Comprobación gráfica pendiente

El control nativo de VSCodium utilizado en la fase anterior ya no está disponible en esta sesión. No se iniciaron servidores de QA ni se hicieron nuevas capturas. La herramienta de navegador opcional tampoco tiene disponible su SKILL.md en la ruta publicada; se comprobó la ubicación y no se utilizó para sustituir la prueba del host.

La causa del problema de Range se retiró del código, pero el cierre gráfico de fase 4 y la aprobación de fase 5 siguen pendientes. El [procedimiento preparado](comprobacion-manual.md) enumera los pasos y resultados esperados, incluyendo los cuatro comandos de archivos. El arrastre físico sigue excluido. No se generó VSIX ni se publicó nada.

## Reproducción automática

```sh
npm run test:unit
npm run check-types
npm run lint
node esbuild.js --production
node docs/qa/20261103-sin-fallback-directo/verificar-integracion.cjs
node docs/qa/20261103-fase4-regresion/verificar-arranque.cjs
```

La salida del verificador de integración se conserva en esta carpeta para no sobrescribir los resultados históricos de fase 4. El fixture fallback-range.html de esa fase también se conserva como evidencia del código anterior; no incorpora el retiro actual.

## Preparación de la repetición manual

Se recreó el workspace de fixtures y se añadió la configuración **QA sin fallback directo** en [.vscode/launch.json](../../../.vscode/launch.json), con perfil y directorios de ejecución separados. El workspace temporal usado anteriormente ya no existe. El [registro de ejecución manual](ejecucion-manual.json) contiene los 18 casos previstos y las confirmaciones recibidas; la preparación inicial no acreditaba su ejecución. El [procedimiento](comprobacion-manual.md) comienza por pegar, deshacer y rehacer.

## Confirmación manual del usuario: comandos desde el Explorador

El usuario confirmó que **Add to OpenCode** y **Attach to OpenCode** funcionaron en el host QA recién abierto, seleccionando uno o varios archivos desde el Explorador de VSCodium. Los cuatro recorridos (cada comando con selección individual y múltiple) quedan como **PASS reportado por el usuario**, registrados en ejecucion-manual.json.

La evidencia de esta ejecución es la confirmación textual del usuario; no se dispone de captura ni log nuevo. No se atribuyen nombres, tipos, ausencia de duplicados por fixture o hash cargado inspeccionados directamente. Los casos específicos de contexto.txt/imagen.png tienen el flujo confirmado y mantienen pendiente su comprobación exacta si se necesita esa evidencia.

La selección múltiple en el Explorador no acredita **Add Files to OpenCode…** ni **Attach Files to OpenCode…**, que usan selectores nativos y siguen pendientes de esta repetición. Tampoco acredita pegado, deshacer o rehacer: ese es el siguiente bloque. El arrastre físico sigue excluido.

## Confirmación manual del usuario: pegar, deshacer y rehacer

Ante el procedimiento de copiar copiar-fase4.txt, pegarlo una vez en un borrador vacío con Cmd+V, vaciar con Cmd+Z y reponer ambas líneas con Cmd+Shift+Z, el usuario respondió «funciona». Los casos 01, 02 y 03 quedan como **PASS reportado por el usuario** en [ejecucion-manual.json](ejecucion-manual.json).

Esta confirmación corresponde al host QA actual según el contexto de la prueba. No se dispone de captura ni log nuevo ni se inspeccionó directamente el hash cargado. No acredita todavía pegado demorado, reemplazo de selección, inserción intermedia, menú/comando, pegados consecutivos ni el resto del ciclo de vida. La regresión manual sigue en curso.

## Confirmación manual del usuario: pegado demorado

Ante el procedimiento de copiar copiar-fase4.txt, enfocar un borrador vacío, esperar diez segundos y pegar con Cmd+V, comprobando ambas líneas completas una sola vez, el usuario respondió «funciona». El caso 04 queda como **PASS reportado por el usuario**. La espera es anterior a solicitar el portapapeles, no un retardo de su respuesta asíncrona. No se dispone de captura ni log nuevo. Sigue pendiente el reemplazo de selección y el resto de la regresión.

## Confirmación manual del usuario: reemplazo de selección

El usuario confirmó que funcionó la prueba pendiente de seleccionar QUITAR en ANTESQUITARDESPUES y reemplazarlo con el texto multilínea de copiar-fase4.txt. El caso 05 queda como **PASS reportado por el usuario**, sin captura ni log nuevo.

## Confirmación manual del usuario: inserción en cursor

El usuario confirmó que funcionó pegar copiar-fase4.txt entre ANTES y DESPUES sin seleccionar texto, conservando ambos extremos y el salto de línea. El caso 06 queda como **PASS reportado por el usuario**, sin captura ni log nuevo. Quedan diez casos funcionales pendientes.

## Confirmación manual del usuario: pegados consecutivos

El usuario confirmó que dos Cmd+V seguidos pegaron las dos copias completas de copiar-fase4.txt en un borrador vacío, sin omisiones ni copias adicionales. El caso 07 queda como **PASS reportado por el usuario**, sin captura ni log nuevo ni medición del intervalo. Quedan nueve casos funcionales pendientes.

## Confirmación manual del usuario: menú Pegar

El usuario confirmó que Editar → Pegar de VSCodium incorporó ambas líneas de copiar-fase4.txt completas una sola vez en el campo enfocado de un borrador vacío. El caso 08 queda como **PASS reportado por el usuario**, sin captura ni log nuevo. Quedan ocho casos funcionales pendientes.

## Confirmación manual del usuario: comando Pegar

El usuario confirmó que Paste into OpenCode, ejecutado desde la paleta nativa de VSCodium con un borrador vacío enfocado, incorporó ambas líneas de copiar-fase4.txt completas una sola vez. El caso 09 queda como **PASS reportado por el usuario**, sin captura ni log nuevo. Quedan siete casos funcionales pendientes.

## Confirmación manual del usuario: cortar y reponer

El usuario confirmó que Cmd+A → Cmd+X vació el campo de OpenCode y que Cmd+V repuso ambas líneas completas una sola vez. El caso 10 queda como **PASS reportado por el usuario**, sin captura ni log nuevo. Quedan seis casos funcionales pendientes.

## Confirmación manual del usuario: ocultar y mostrar

El usuario confirmó que ocultar y mostrar nuevamente la barra lateral secundaria mediante Ver → Apariencia conservó ambas líneas del borrador intactas y sin duplicados. El caso 11 queda como **PASS reportado por el usuario**, sin captura ni log nuevo. Quedan cinco casos funcionales pendientes: los dos selectores de archivos y tres de ciclo de vida.

## Confirmación manual del usuario: selector de menciones

El usuario confirmó que Add Files to OpenCode…, invocado con Cmd+Option+Shift+S, incorporó contexto.txt y archivo con espacios ñ.txt como dos menciones, una por archivo, conservando espacios y ñ. El caso 13 queda como **PASS reportado por el usuario**, sin captura ni log nuevo. Quedan cuatro casos funcionales pendientes.

## Confirmación manual del usuario: selector de adjuntos

El usuario confirmó que Attach Files to OpenCode…, invocado con Cmd+Shift+A, cargó imagen.png y archivo con espacios ñ.txt como dos adjuntos, uno por archivo, con nombres correctos y sin cargas pendientes. El caso 15 queda como **PASS reportado por el usuario**, sin captura ni log nuevo. Quedan tres casos funcionales de ciclo de vida: primera acción tras arranque, restauración y cierre.

## Confirmación manual del usuario: primer comando tras recargar

El usuario confirmó que Add to OpenCode, invocado una sola vez con Cmd+Option+S tras recargar la ventana con contexto.txt abierto, produjo una sola mención sin repetir el atajo. El caso 16 queda como **PASS reportado por el usuario**. No se midió directamente si la entrega ocurrió antes del montaje del prompt. Quedan restauración y cierre.

## Preparación de restauración y cierre

Se identificó el host actual por su log y el workspace de fixtures. Se preservó el [log actual](logs/ejecucion-manual-host-actual.txt) y su [ruta de origen](logs/fuente-host-actual.json). Mediante la API local del proxy de ese host se crearon dos sesiones vacías, **QA sin fallback restauracion A** y **QA sin fallback restauracion B**, sin prompts ni llamadas a modelos. Los IDs se conservan en [sesiones-restauracion.json](sesiones-restauracion.json). Esto solo prepara la prueba: abrir sus pestañas, mantener B activa, cerrar y restaurar sigue pendiente de acciones del usuario.

## Cierre del host verificado

La captura aportada por el usuario mostró A y B abiertas y A activa. Después confirmó haber seleccionado B, comprobado su encabezado y cerrado la ventana del host. Se conservaron los [logs al cierre](logs/ejecucion-manual-host-cierre.txt). La [comprobación local](logs/cierre-manual.json) encontró cuatro arranques registrados para el workspace de QA, un servidor por arranque, y ninguno de sus ocho puertos escuchando tras cerrar. El caso 18 queda como **PASS verificado por logs y lsof**. Falta reabrir el host y confirmar que restaura B automáticamente y conserva A/B.

## Fallo en la sesión activa y corrección posterior

Al reabrir, el usuario informó «aparece A y a y b siguen en el menu»: el caso 17 falla para la sesión activa y conserva las pestañas. Se encontró una comparación incompatible con la clave nativa de OpenCode 2.2.5. La [corrección posterior](../20261103-restauracion-activa/reporte.md) pasa 59 pruebas y requiere repetir la restauración gráfica sobre su propio hash. Los demás resultados manuales de esta carpeta corresponden al build anterior.

## Cierre de fase 4

La [corrección de sesión activa y su retest nativo](../20261103-restauracion-activa/reporte.md) restauraron B automáticamente y conservaron A/B. Se completaron directamente las comprobaciones específicas de contexto.txt e imagen.png y se verificó el cierre de todos los puertos QA registrados. El [registro manual](ejecucion-manual.json) contiene los 18 casos aprobados con su fuente y hash, preservando el intento fallido de restauración. Las confirmaciones del usuario no se presentan como capturas directas. Fase 5 pendiente; no se generó VSIX ni se publicó.
