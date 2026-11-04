# Fase 4: regresión de comandos, edición y ciclo de vida

Fecha: 3 de noviembre de 2026, America/Santiago.

**Estado: comprobación ejecutada, con tres fallos corregidos y una limitación abierta (RANGE-UNDO).** Los registros detallados incluyen un fallo de sesión activa en el caso 60; el resumen original lo había atribuido incorrectamente como PASS. La inserción directa mediante Range no se incorpora al historial nativo de deshacer en el fixture de navegador. Esta fase no constituye una aprobación sin reservas para distribuir; la fase 5 (VSIX y revisión del artefacto) no se inició.

## Actualización posterior: retiro de la inserción directa

Se aplicó el [retiro de los fallbacks de Range y `.value`](../20261103-sin-fallback-directo/reporte.md). El código actual conserva `paste` y `execCommand`; si ambos fallan, registra el fallo y deja el contenido sin modificación directa. La causa de RANGE-UNDO se retiró del pegado. Las capturas, hashes, resultados y limitaciones de este informe describen los builds históricos de fase 4: todavía falta repetir la regresión gráfica sobre el build nuevo antes de aprobar la fase 5.

## Entorno y alcance

Pruebas reales en VSCodium para macOS, Extension Development Host, perfil `QA-raiz-manual`, extensión raíz 1.14.43 y OpenCode 2.2.5. Workspace aislado `/private/tmp/opencode-manual-qa-Rfgyvg/workspace`. Se reutilizaron los fixtures `contexto.txt`, `archivo con espacios ñ.txt` e `imagen.png`; se añadieron archivos locales con Unicode, salto de línea y marcadores de posición para comprobar el pegado.

Se aplicó el flujo de evidencia del skill local [webview-bug-qa](../../../mac-version/opencode-web-vs-extension-feature-clipboard-mac/.agents/skills/webview-bug-qa/SKILL.md), adaptado al alcance de esta fase: interfaz nativa mediante CUA y capturas JPEG; sin empaquetado. Los comandos específicos de la extensión no tienen equivalente fuera del IDE. El fallback de DOM se comprobó por separado en Brave con un fixture local y el JavaScript de producción; esa prueba no se atribuye al frontend de OpenCode.

**Menciones y adjuntos se incorporaron exclusivamente mediante los cuatro comandos de la extensión, usando el Explorador y los selectores nativos. El arrastre físico queda fuera del alcance acordado.** El uso interno de eventos sintéticos por esos comandos no es una prueba de arrastre.

Se crearon dos sesiones vacías por la API local para comprobar persistencia, cuyos identificadores se conservan en [sesiones-vacias.json](sesiones-vacias.json). No se enviaron prompts ni se solicitaron respuestas a modelos durante esta fase. La referencia Mac no se modificó ni se repitió su matriz histórica.

## Fallos reproducidos y correcciones

1. **Primer comando durante la carga:** la referencia se entregaba antes de que existiera el prompt. Los casos 01/02 muestran el prompt vacío; repetir con la aplicación lista sí funcionaba (03). Se añadió [una cola temporal](../../../src/opencodePromptQueue.ts) para los dos puentes de comandos de archivos: espera un elemento editable conectado, difiere la entrega al siguiente turno y vence a los diez segundos. Tiene cinco pruebas unitarias. En la repetición 49/50 no se repitió el comando: se observó primero la carga y después exactamente `@contexto.txt `. El [log](logs/extension-primer-comando-final.txt) registra recepción a las 04:41:55.365 UTC y entrega al prompt a las 04:41:56.242 UTC. El caso 52 lo vuelve a confirmar en el build definitivo.
2. **Restauración de una sesión v2:** se usaba una ruta basada en el directorio y el frontend mostraba un TypeError (28). [El bootstrap](../../../src/opencodeBootstrap.ts) ahora restaura `/server/<origen codificado>/session/<id>`, que coincide con la navegación observada en OpenCode v2 y conserva la query de autenticación. Dos pruebas existentes se corrigieron primero para reproducir el fallo ([log rojo](logs/restauracion-antes.txt)). Los casos 29/30 confirmaron una restauración inicial de B y las pestañas. En la repetición definitiva, el caso 60 quedó FAIL (`activeSessionB: false`) y el caso 61 conservó las pestañas; el resumen original lo indicó incorrectamente como PASS. En 30 se conservaron exactamente los 14 IDs de borrador originales; al final se restauraron 32 pestañas: 30 borradores creados durante las pruebas y las dos sesiones.
3. **Arranque concurrente:** la primera acción podía competir con la apertura automática y lanzar dos servidores. El [log anterior](logs/extension-adjunto-arranque-final.txt) registra dos procesos; [la comprobación de cierre](logs/cierre.json) detectó uno todavía escuchando. Se cerraron específicamente los dos procesos huérfanos de QA de builds anteriores, en los puertos 50476 y 33994. `loadSidebar` ahora comparte la promesa de carga en curso y `ensureSidebarServer` la espera. El cuerpo de carga se conserva en `loadSidebarContent`. [Tres comprobaciones del código real](logs/arranque.txt) verifican concurrencia, recarga posterior y recuperación tras rechazo. Los [arranques definitivos](logs/cierre-definitivo.json) registraron un servidor por carga y ningún puerto restante al cerrar.

Los cambios de fase 4 se concentran en [extension.ts](../../../src/extension.ts), [opencodePromptQueue.ts](../../../src/opencodePromptQueue.ts), sus pruebas y el bootstrap de restauración. Se conservaron los cuatro handlers, menús, atajos, autenticación, resolución de ejecutable, puentes de edición y normalizador de arrastre existentes; el [verificador de integración](verificar-integracion.cjs) compara el código preservado. Los dos puentes sintéticos de comandos sí cambian intencionalmente para usar la cola.

## Resultados de la regresión

| Recorrido | Resultado y evidencia |
| --- | --- |
| Add to OpenCode, primera acción al arrancar | PASS, referencia exacta, sin repetición: [52](52-arranque-serializado-referencia.jpg), [log](logs/extension-definitivo-2.txt) |
| Add Files to OpenCode… | PASS, dos referencias exactas, espacios y ñ: [53](53-menciones-build-definitivo.jpg) |
| Attach to OpenCode | PASS, una imagen terminada: [54](54-adjunto-build-definitivo.jpg); primera acción al arrancar también pasó en [51](51-adjunto-arranque-completo.jpg) antes del ajuste de concurrencia |
| Attach Files to OpenCode… | PASS, imagen y TXT terminados, un adjunto por archivo: [55](55-adjuntos-multiples-definitivo.jpg) |
| Pegado, cortar, reponer, undo/redo | PASS: [35–39](35-pegado-final.jpg), [56](56-pegado-definitivo.jpg), [57](57-deshacer-definitivo.jpg), [58](58-rehacer-definitivo.jpg) |
| Selección intermedia, Unicode y salto de línea | PASS, `ANTESQA_FASE4\nlínea_ñDESPUES`: [40](40-seleccion-pegado-demorado-final.jpg); demora registrada en resultados.json |
| Dos pegados consecutivos | PASS, ambos completos: [41](41-pegados-consecutivos-final.jpg) |
| Editar → Pegar y comando Paste into OpenCode | PASS: [47](47-menu-nativo-final.jpg), [48](48-comando-pegar-final.jpg) |
| Ocultar y volver a mostrar la vista | PASS, contenido conservado: [42](42-ocultar-final.jpg), [43](43-mostrar-final.jpg) |
| Reiniciar y restaurar sesión activa/pestañas | FAIL para sesión activa en caso 60; PASS de pestañas en caso 61: [60](60-restauracion-build-definitivo.jpg), [61](61-pestanas-build-definitivo.jpg), [log](logs/extension-restauracion-definitiva.txt) |
| Range: selección y foco asíncrono | PASS en fixture Brave, texto literal y campo original: [44](44-range-cambio-foco.jpg) |
| Range: historial nativo | FAIL para deshacer; pendiente: [45](45-range-deshacer.jpg). El intento de rehacer [46](46-range-rehacer-sin-historial.jpg) es observación, no acredita un historial válido. |

Las pruebas se ejecutaron sobre tres builds, identificados por SHA-256 en cada caso de [resultados.json](resultados.json): fase 3, correcciones de cola/ruta y ajuste final de concurrencia. El último cambio solo serializa la carga: se repitieron arranque, los cuatro comandos, pegado/undo/redo y restauración en ese build. Los recorridos de menú, demora, foco y ocultación se verificaron antes de esa serialización; no se presentan como repeticiones del último hash.

## Limitación abierta: RANGE-UNDO

El [fixture reproducible](fallback-range.html) incrusta el módulo generado de producción, fuerza `execCommand("insertText")` a devolver false y carece de un consumidor de paste. Seleccionar QUITAR, pulsar Solicitar respuesta demorada y enfocar Otro campo antes de la respuesta inserta `<b>ñ</b>\nlínea` como texto en el campo original; conserva ANTES/DESPUES y emite input con insertFromPaste. La captura y el log input verifican el contenido exacto; AX añade separadores entre nodos de texto que no pertenecen a textContent.

Cmd+Z no revierte la inserción de Range y Cmd+Shift+Z tampoco reconstruye una operación de historial. Queda pendiente resolver o aceptar expresamente ese límite antes de dar por aprobada la distribución. No se añadió un historial paralelo improvisado ni se declara corregido este punto. En OpenCode real los logs registraron consumo del evento paste por el frontend, y allí undo/redo sí pasó; no se logró activar naturalmente la última vía de Range dentro de OpenCode.

## Verificación automática y cierre

- 50/50 pruebas unitarias: [log](logs/unitarios.txt), incluidas las cinco nuevas de la cola.
- Tres comprobaciones de la carga real extraída: [log](logs/arranque.txt), [script](verificar-arranque.cjs).
- TypeScript y build productivo: PASS, [tipos](logs/tipos.txt), [build](logs/build.txt).
- ESLint: cero errores y las 754 advertencias previas; [log](logs/lint.txt).
- Sintaxis del bootstrap para darwin/linux/win32 × legacy/v2 y preservación de código/configuración: [integracion.json](integracion.json). Son controles estáticos; no ejecución gráfica en Windows/Linux ni OpenCode legacy.
- Comparador de fase 2 compatible con ambos helpers nuevos, con su salida dirigida a tmp para conservar los snapshots históricos: [log](logs/comparador.txt).
- Host de QA y pestaña del fixture cerrados. [Cierre final](logs/cierre-restauracion-definitiva.json): sin listeners en los puertos comprobados, incluido el proceso huérfano anterior. La [auditoría de los 22 puertos registrados](logs/cierre-todos-puertos.json) tampoco encontró listeners. Fixtures y perfiles conservados para reproducción. No se generó VSIX, no hubo publicación ni commit.

Build definitivo SHA-256: `cceffb877d198a55ab48b6f099dd1194429366c2884d81d88d1921fa6bd8349d`.

La fase 5 sigue pendiente. Antes de empaquetar corresponde decidir o corregir RANGE-UNDO; las pruebas aquí documentadas no cubren Linux/Windows reales, tamaños extremos de archivos ni arrastre físico.

## Reproducción automática

```sh
npm run test:unit
npm run check-types
npm run lint
node esbuild.js --production
node docs/qa/20261103-fase4-regresion/verificar-arranque.cjs
node docs/qa/20261103-fase4-regresion/verificar-integracion.cjs
```

El verificador de fase 3 era un control de su snapshot. Desde los cambios intencionales de puentes y carga de fase 4 debe utilizarse el verificador de esta carpeta.

## Registro de capturas

Cada fila enlaza su captura y snapshot AX. Los FAIL iniciales se preservan aunque después se hayan corregido. EN CARGA no es un fallo de entrega; INTENTO NO VÁLIDO no acredita la acción pretendida.

| Caso | Veredicto | Evidencia |
| --- | --- | --- |
| 01-primer-comando | FAIL | [Captura](01-primer-comando.jpg), [AX](logs/01-primer-comando-ax.txt) |
| 02-primer-comando-observacion-final | FAIL | [Captura](02-primer-comando-observacion-final.jpg), [AX](logs/02-primer-comando-observacion-final-ax.txt) |
| 03-mismo-comando-app-lista | PASS | [Captura](03-mismo-comando-app-lista.jpg), [AX](logs/03-mismo-comando-app-lista-ax.txt) |
| 04-pegado-inmediato | PASS | [Captura](04-pegado-inmediato.jpg), [AX](logs/04-pegado-inmediato-ax.txt) |
| 05-seleccionar-y-cortar | PASS | [Captura](05-seleccionar-y-cortar.jpg), [AX](logs/05-seleccionar-y-cortar-ax.txt) |
| 06-restaurar-corte | PASS | [Captura](06-restaurar-corte.jpg), [AX](logs/06-restaurar-corte-ax.txt) |
| 07-deshacer-pegado | PASS | [Captura](07-deshacer-pegado.jpg), [AX](logs/07-deshacer-pegado-ax.txt) |
| 08-rehacer-pegado | PASS | [Captura](08-rehacer-pegado.jpg), [AX](logs/08-rehacer-pegado-ax.txt) |
| 09-pegado-demorado | PASS | [Captura](09-pegado-demorado.jpg), [AX](logs/09-pegado-demorado-ax.txt) |
| 10-texto-base-posicion | PASS | [Captura](10-texto-base-posicion.jpg), [AX](logs/10-texto-base-posicion-ax.txt) |
| 11-reemplazo-seleccion-multilinea | PASS | [Captura](11-reemplazo-seleccion-multilinea.jpg), [AX](logs/11-reemplazo-seleccion-multilinea-ax.txt) |
| 12-menu-nativo-pegar | PASS | [Captura](12-menu-nativo-pegar.jpg), [AX](logs/12-menu-nativo-pegar-ax.txt) |
| 13-comando-paleta-pegar | PASS | [Captura](13-comando-paleta-pegar.jpg), [AX](logs/13-comando-paleta-pegar-ax.txt) |
| 14-insercion-en-cursor | PASS | [Captura](14-insercion-en-cursor.jpg), [AX](logs/14-insercion-en-cursor-ax.txt) |
| 15-pegados-consecutivos | PASS | [Captura](15-pegados-consecutivos.jpg), [AX](logs/15-pegados-consecutivos-ax.txt) |
| 16-ocultar-vista | INTENTO NO VÁLIDO | [Captura](16-ocultar-vista.jpg), [AX](logs/16-ocultar-vista-ax.txt) |
| 17-mostrar-contenido-conservado | INTENTO NO VÁLIDO | [Captura](17-mostrar-contenido-conservado.jpg), [AX](logs/17-mostrar-contenido-conservado-ax.txt) |
| 18-ocultar-vista-boton | PASS | [Captura](18-ocultar-vista-boton.jpg), [AX](logs/18-ocultar-vista-boton-ax.txt) |
| 19-mostrar-vista-boton | PASS | [Captura](19-mostrar-vista-boton.jpg), [AX](logs/19-mostrar-vista-boton-ax.txt) |
| 20-menciones-multiples | PASS | [Captura](20-menciones-multiples.jpg), [AX](logs/20-menciones-multiples-ax.txt) |
| 21-adjunto-individual | EN CARGA | [Captura](21-adjunto-individual.jpg), [AX](logs/21-adjunto-individual-ax.txt) |
| 22-adjuntos-multiples | PASS | [Captura](22-adjuntos-multiples.jpg), [AX](logs/22-adjuntos-multiples-ax.txt) |
| 23-adjunto-individual-carga-completa | PASS | [Captura](23-adjunto-individual-carga-completa.jpg), [AX](logs/23-adjunto-individual-carga-completa-ax.txt) |
| 24-sesion-A-abierta | PASS | [Captura](24-sesion-A-abierta.jpg), [AX](logs/24-sesion-A-abierta-ax.txt) |
| 25-sesion-B-activa | PASS | [Captura](25-sesion-B-activa.jpg), [AX](logs/25-sesion-B-activa-ax.txt) |
| 26-pestanas-antes-reinicio | PASS | [Captura](26-pestanas-antes-reinicio.jpg), [AX](logs/26-pestanas-antes-reinicio-ax.txt) |
| 27-restauracion-observacion-inicial | OBSERVADO | [Captura](27-restauracion-observacion-inicial.jpg), [AX](logs/27-restauracion-observacion-inicial-ax.txt) |
| 28-restauracion-sesion-activa | FAIL | [Captura](28-restauracion-sesion-activa.jpg), [AX](logs/28-restauracion-sesion-activa-ax.txt) |
| 29-restauracion-corregida | PASS | [Captura](29-restauracion-corregida.jpg), [AX](logs/29-restauracion-corregida-ax.txt) |
| 30-pestanas-restauradas | PASS | [Captura](30-pestanas-restauradas.jpg), [AX](logs/30-pestanas-restauradas-ax.txt) |
| 31-primer-comando-corregido | PASS | [Captura](31-primer-comando-corregido.jpg), [AX](logs/31-primer-comando-corregido-ax.txt) |
| 32-menciones-multiples-final | PASS | [Captura](32-menciones-multiples-final.jpg), [AX](logs/32-menciones-multiples-final-ax.txt) |
| 33-adjunto-individual-final | PASS | [Captura](33-adjunto-individual-final.jpg), [AX](logs/33-adjunto-individual-final-ax.txt) |
| 34-adjuntos-multiples-final | PASS | [Captura](34-adjuntos-multiples-final.jpg), [AX](logs/34-adjuntos-multiples-final-ax.txt) |
| 35-pegado-final | PASS | [Captura](35-pegado-final.jpg), [AX](logs/35-pegado-final-ax.txt) |
| 36-corte-final | PASS | [Captura](36-corte-final.jpg), [AX](logs/36-corte-final-ax.txt) |
| 37-reponer-corte-final | PASS | [Captura](37-reponer-corte-final.jpg), [AX](logs/37-reponer-corte-final-ax.txt) |
| 38-deshacer-final | PASS | [Captura](38-deshacer-final.jpg), [AX](logs/38-deshacer-final-ax.txt) |
| 39-rehacer-final | PASS | [Captura](39-rehacer-final.jpg), [AX](logs/39-rehacer-final-ax.txt) |
| 40-seleccion-pegado-demorado-final | PASS | [Captura](40-seleccion-pegado-demorado-final.jpg), [AX](logs/40-seleccion-pegado-demorado-final-ax.txt) |
| 41-pegados-consecutivos-final | PASS | [Captura](41-pegados-consecutivos-final.jpg), [AX](logs/41-pegados-consecutivos-final-ax.txt) |
| 42-ocultar-final | PASS | [Captura](42-ocultar-final.jpg), [AX](logs/42-ocultar-final-ax.txt) |
| 43-mostrar-final | PASS | [Captura](43-mostrar-final.jpg), [AX](logs/43-mostrar-final-ax.txt) |
| 44-range-cambio-foco | PASS | [Captura](44-range-cambio-foco.jpg), [AX](logs/44-range-cambio-foco-ax.txt) |
| 45-range-deshacer | FAIL | [Captura](45-range-deshacer.jpg), [AX](logs/45-range-deshacer-ax.txt) |
| 46-range-rehacer-sin-historial | OBSERVADO | [Captura](46-range-rehacer-sin-historial.jpg), [AX](logs/46-range-rehacer-sin-historial-ax.txt) |
| 47-menu-nativo-final | PASS | [Captura](47-menu-nativo-final.jpg), [AX](logs/47-menu-nativo-final-ax.txt) |
| 48-comando-pegar-final | PASS | [Captura](48-comando-pegar-final.jpg), [AX](logs/48-comando-pegar-final-ax.txt) |
| 49-primer-comando-arranque-inmediato | EN CARGA | [Captura](49-primer-comando-arranque-inmediato.jpg), [AX](logs/49-primer-comando-arranque-inmediato-ax.txt) |
| 50-primer-comando-arranque-completo | PASS | [Captura](50-primer-comando-arranque-completo.jpg), [AX](logs/50-primer-comando-arranque-completo-ax.txt) |
| 51-adjunto-arranque-completo | PASS | [Captura](51-adjunto-arranque-completo.jpg), [AX](logs/51-adjunto-arranque-completo-ax.txt) |
| 52-arranque-serializado-referencia | PASS | [Captura](52-arranque-serializado-referencia.jpg), [AX](logs/52-arranque-serializado-referencia-ax.txt) |
| 53-menciones-build-definitivo | PASS | [Captura](53-menciones-build-definitivo.jpg), [AX](logs/53-menciones-build-definitivo-ax.txt) |
| 54-adjunto-build-definitivo | PASS | [Captura](54-adjunto-build-definitivo.jpg), [AX](logs/54-adjunto-build-definitivo-ax.txt) |
| 55-adjuntos-multiples-definitivo | PASS | [Captura](55-adjuntos-multiples-definitivo.jpg), [AX](logs/55-adjuntos-multiples-definitivo-ax.txt) |
| 56-pegado-definitivo | PASS | [Captura](56-pegado-definitivo.jpg), [AX](logs/56-pegado-definitivo-ax.txt) |
| 57-deshacer-definitivo | PASS | [Captura](57-deshacer-definitivo.jpg), [AX](logs/57-deshacer-definitivo-ax.txt) |
| 58-rehacer-definitivo | PASS | [Captura](58-rehacer-definitivo.jpg), [AX](logs/58-rehacer-definitivo-ax.txt) |
| 59-sesion-activa-antes-cierre-definitivo | PASS | [Captura](59-sesion-activa-antes-cierre-definitivo.jpg), [AX](logs/59-sesion-activa-antes-cierre-definitivo-ax.txt) |
| 60-restauracion-build-definitivo | FAIL | [Captura](60-restauracion-build-definitivo.jpg), [AX](logs/60-restauracion-build-definitivo-ax.txt) |
| 61-pestanas-build-definitivo | PASS | [Captura](61-pestanas-build-definitivo.jpg), [AX](logs/61-pestanas-build-definitivo-ax.txt) |

## Errata: sesión activa del caso 60

Durante la investigación posterior del fallo reportado por el usuario se contrastó la tabla de resumen con resultados.json: el caso 60 ya contenía FAIL y activeSessionB: false. Se corrigió el texto de resumen que lo presentaba como PASS, conservando los registros y capturas originales. La [corrección de formato de clave](../20261103-restauracion-activa/reporte.md) está pendiente de repetición gráfica.

## Cierre posterior de fase 4

El [informe final de restauración activa](../20261103-restauracion-activa/reporte.md) documenta el retiro de las inserciones directas de pegado, las confirmaciones manuales y el retest nativo aprobado de B activa, pestañas y cierre. Fase 4 cerrada para OpenCode 2.2.5 en macOS/VSCodium y comandos de la extensión. Fase 5 pendiente. Los resultados anteriores de este documento mantienen su hash y carácter histórico.
