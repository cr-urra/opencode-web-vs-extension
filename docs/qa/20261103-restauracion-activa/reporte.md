# Restauración de la sesión activa en OpenCode 2.2.5

Fecha: 3 de noviembre de 2026, America/Santiago.

**Fallo reproducido por el usuario, corregido y verificado en la interfaz real. Fase 4 cerrada para el alcance probado; fase 5 pendiente.** Tras cerrar con B activa y reabrir el host, el usuario informó «aparece A y a y b siguen en el menu». Las pestañas se conservaron; la selección activa falló.

## Causa y evidencia

OpenCode 2.2.5 identifica una pestaña de sesión mediante `origen + "\n" + ruta de sesión`, por ejemplo:

```text
http://127.0.0.1:4567
/server/aHR0cDovLzEyNy4wLjAuMTo0NTY3/session/ses-B
```

La extensión comparaba `origen + "\n" + ID`, sin la ruta. Cuando el frontend guardaba su clave nativa en tabs.recent, el filtro de la extensión no encontraba coincidencia y enviaba al host las pestañas sin recent. Al reiniciar se aplicaba la selección alternativa de la última pestaña de la lista. En el caso del usuario esa pestaña era A, aunque B se hubiera activado después.

La [instantánea del estado de la extensión](logs/workspace-state-failure.json), leída de su almacenamiento de workspace mediante SQLite en modo de solo lectura, contiene el borrador y las sesiones B/A, sin recent. El [log del reinicio](logs/restauracion-A.txt) confirma que el bootstrap seleccionó el ID de A. Los [fragmentos del frontend instalado](logs/frontend-tab-key.json) muestran el constructor de ruta y la función real que calcula la clave de pestaña. Son recursos del OpenCode local de QA; no una suposición basada en la interfaz.

Los IDs de las dos sesiones vacías se conservan en [la preparación anterior](../20261103-sin-fallback-directo/sesiones-restauracion.json). No se enviaron prompts ni se llamaron modelos durante la investigación.

## Corrección

El [bootstrap](../../../src/opencodeBootstrap.ts) ahora calcula la clave nativa completa para las sesiones. El guardado reconoce esa clave y conserva recent. La restauración traduce tanto el origen al principio de la clave como el origen codificado de su ruta al nuevo puerto del proxy.

Se admiten las claves abreviadas que guardaba antes la extensión para migrar estados existentes. Los borradores mantienen su clave draft sin cambios. La selección inicial también normaliza las claves antiguas cuando ya existen pestañas en localStorage.

El cambio no modifica los comandos de archivos, el portapapeles, la compuerta de arranque ni package.json; sus hashes se verifican en [antes.json](antes.json) y [resultados.json](resultados.json). La causa del fallo afecta a la persistencia compartida v2. El objetivo de comprobación gráfica sigue siendo OpenCode 2.2.5 en macOS/VSCodium.

## Comprobaciones automáticas previas a la repetición gráfica

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Nuevas expectativas contra el código anterior | 59 pruebas: 54 PASS, 5 FAIL esperados | [Antes](logs/antes.txt) |
| Suite tras la corrección | 59/59 PASS | [Pruebas](logs/unitarios.txt) |
| Selección de B con clave nativa y A al final de la lista | PASS en modelo de almacenamiento | [Pruebas](../../../src/opencodeBootstrap.test.ts) |
| Restauración de clave nativa con cambio de puerto | PASS | [Pruebas](logs/unitarios.txt) |
| Cambio A/B y captura en el intervalo y pagehide | PASS | [Pruebas](logs/unitarios.txt) |
| Migración de clave abreviada, borradores, tabs vivos y legacy | PASS de las pruebas existentes ajustadas | [Pruebas](logs/unitarios.txt) |
| TypeScript y build productivo | PASS | [Tipos](logs/tipos.txt), [build](logs/build.txt) |
| ESLint | 0 errores; mismas 754 advertencias previas | [Lint](logs/lint.txt) |
| Sintaxis e integración: darwin/linux/win32 × legacy/v2 | Seis combinaciones PASS | [Integración](integracion.json), [log](logs/integracion.txt) |
| Compuerta de arranque | Tres comprobaciones PASS | [Log](logs/arranque.txt) |

El modelo de almacenamiento usa el script generado de producción; representa los valores de tabs/recent y los mensajes enviados al host. No acredita la ejecución gráfica ni el resultado del frontend instalado tras reiniciar.

Build nuevo SHA-256: `7ac05abfc7ae4a638bd18fe6822ad34e133f253b24aec178e1e4ec613cc11f25`.

Las confirmaciones manuales anteriores de pegado y comandos siguen atribuidas al build `b626e211e708e4a9f7e05ef7849235fcca0cdf7d5534ff79d52f1c821aaabbaa`; no se reasignan al build nuevo. El código de esos recorridos conserva su hash.

## Procedimiento de repetición gráfica

El estado que perdió recent no permite reconstruir cuál era la selección anterior. Hay que seleccionar B después de cargar la corrección:

1. En la ventana del host QA, ejecutar Ver → Paleta de comandos… → Desarrollador: Recargar ventana para cargar el build nuevo.
2. Seleccionar **QA sin fallback restauracion B** y esperar al menos dos segundos.
3. Antes de cerrar, comprobar que el estado persistido de la extensión contiene recent con la clave nativa de B. Esta lectura local puede hacerla el asistente.
4. Cerrar únicamente el host QA. Revisar sus puertos y reabrirlo desde QA sin fallback directo (F5).
5. Sin seleccionar una pestaña, comprobar que aparece B activa y que A/B siguen en el menú. El resultado visual se verificó después directamente mediante CUA, al recuperarse el control nativo de VSCodium.

El caso 17 de [la matriz manual](../20261103-sin-fallback-directo/ejecucion-manual.json) conserva su intento fallido. La repetición del build nuevo se registrará por separado. La fase 5 sigue pendiente.

## Cierre y errata de evidencia anterior

La [auditoría ampliada de puertos](logs/auditoria-puertos.json) revisó diez arranques del workspace QA en todas las ventanas registradas. Cada arranque inició un servidor; solo los dos puertos del host reabierto actual seguían escuchando. Esta auditoría amplía la comprobación inicial que se había limitado a los logs de window4.

Al contrastar la evidencia histórica de fase 4 se detectó un error de su tabla de resumen: el caso 60 ya figuraba como FAIL y activeSessionB false en resultados.json, aunque la tabla lo presentaba como PASS. Se corrigió esa afirmación en el [informe histórico](../20261103-fase4-regresion/reporte.md), conservando registros y capturas. Los casos 29/30 habían pasado inicialmente y el 61 acreditaba las pestañas, no la sesión activa del 60.

No se generó VSIX ni se publicó nada.

## Reproducción automática

```sh
npm run test:unit
npm run check-types
npm run lint
node esbuild.js --production
node docs/qa/20261103-restauracion-activa/verificar-integracion.cjs
node docs/qa/20261103-fase4-regresion/verificar-arranque.cjs
```

## Repetición gráfica completada

El control nativo de VSCodium volvió a estar disponible. La captura del usuario mostraba B activa; se verificó directamente el host QA-sin-fallback-directo y se preservaron estas evidencias del build nuevo:

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| B activa antes del cierre | PASS, título y ruta de B | [Captura](01-B-antes-cierre.jpg), [AX](logs/01-B-antes-cierre-ax.txt) |
| Estado persistido antes y después de cerrar | PASS, recent contiene la clave nativa de B | [Antes](logs/workspace-state-B-before-close.json), [cerrado](logs/workspace-state-B-closed.json) |
| Cierre del host inicial | PASS, backend y proxy detenidos | [Puertos](logs/cierre-B.json), [log](logs/host-B-cierre.txt) |
| Reapertura sin seleccionar pestaña | PASS, B activa automáticamente; proxy cambió de 51536 a 51674 | [Captura](03-restaurada-B.jpg), [AX](logs/03-restaurada-B-ax.txt), [log](logs/host-restauracion-final.txt) |
| Pestañas conservadas | PASS, mismos tres IDs: borrador, B y A | [Antes](02-pestanas-antes.jpg), [después](04-pestanas-restauradas.jpg), [resultado](gui.json) |
| Add to OpenCode sobre contexto.txt en borrador nuevo | PASS, exactamente una mención | [Captura](05-mencion-individual.jpg), [AX](logs/05-mencion-individual-ax.txt) |
| Attach to OpenCode sobre imagen.png en otro borrador nuevo | PASS, exactamente un adjunto terminado | [Captura](06-adjunto-individual.jpg), [AX](logs/06-adjunto-individual-ax.txt) |
| B activa al finalizar y cierre final | PASS, estado guardado; 28 puertos de 14 arranques sin listeners; un servidor por arranque | [B final](07-B-al-final.jpg), [estado](logs/workspace-state-final.json), [cierre](logs/cierre-final.json) |

El host QA quedó cerrado y la ventana principal del repositorio se conservó. No se enviaron borradores a modelos. Los dos casos de archivos que tenían confirmado el flujo pero no su fixture exacto ahora cuentan con comprobación directa. El [registro manual actualizado](../20261103-sin-fallback-directo/ejecucion-manual.json) conserva el intento fallido de restauración y su repetición aprobada.

La aceptación funcional de fase 4 combina las confirmaciones manuales de edición/comandos del build b626e211 y este retest del build 7ac05abf. Los módulos de portapapeles y comandos conservan sus hashes entre ambos; el cambio posterior se limita a la clave de restauración, cuya regresión se verificó directamente. Las pruebas automáticas finales siguen en 59/59 PASS.

Se cierra fase 4 para OpenCode 2.2.5 en macOS/VSCodium y comandos de extensión. No se extrapola a otros sistemas/versiones ni a arrastre físico. La fase 5 (empaquetado y revisión del VSIX) sigue pendiente; no se inició empaquetado ni publicación.

## Continuación: fase 5

Se generó y revisó el [VSIX de fase 5](../20261103-fase5-vsix/reporte.md), cuyo bundle coincide con el hash validado aquí. La revisión conserva una observación preexistente de licencia MIT/GPLv3. No hubo instalación ni publicación.
