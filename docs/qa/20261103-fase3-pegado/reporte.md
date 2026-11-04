# Fase 3: destino y fallback de pegado

Fecha: 3 de noviembre de 2026, America/Santiago.

**Estado: implementación de fase 3 completada y verificada automáticamente.** Se aplicaron los ajustes M1/M2 de la [comparación de fase 2](../../analisis/20261103-fase2/reporte.md). La regresión gráfica posterior se documenta en la [fase 4](../20261103-fase4-regresion/reporte.md): tres fallos corregidos y el historial de undo del fallback Range pendiente.

## Cambios y comportamiento esperado

El [puente de pegado](../../../src/opencodeClipboard.ts) conserva el elemento editable y su selección al solicitar el portapapeles. Cuando llega la respuesta, restaura ese destino; no utiliza el campo que haya recibido el foco después. En inputs/textarea conserva los offsets; en contenteditable clona el rango de selección.

Si el frontend no consume el evento paste y la inserción con execCommand no se realiza, el puente dispone de una vía Selection/Range para insertar texto plano en contenteditable. Conserva el contenido anterior y posterior a la selección, coloca el cursor tras el texto insertado y emite input con insertFromPaste. Los caracteres con apariencia de HTML se insertan como texto, sin interpretarlos como marcado.

Cada lectura asíncrona se correlaciona mediante su ID. Una respuesta consumida, desconocida o recibida después de vencer la solicitud no vuelve a insertar contenido. Las solicitudes vencen a los diez segundos; errores de envío/lectura liberan el estado pendiente. El pegado se descarta si el destino se desconectó, fue deshabilitado o dejó de ser editable. Un portapapeles vacío no elimina la selección.

Se extrajeron únicamente las tres funciones de pegado del bootstrap de [extension.ts](../../../src/extension.ts), inicialmente sin modificar sus cuerpos, para probar la lógica real del generador sin cargar VS Code. El módulo se inyecta en el mismo bootstrap. Se añadieron [21 pruebas de pegado](../../../src/opencodeClipboard.test.ts), su ejecución a test:unit en [package.json](../../../package.json) y una descripción del comportamiento en [README](../../../README.md).

## Evidencia antes y después

Las primeras 14 pruebas se ejecutaron contra las tres funciones extraídas con su lógica original: seis pasaron y ocho fallaron. Los fallos incluyeron el destino tras cambiar foco/cursor, la falta del fallback contenteditable, respuestas duplicadas/desconocidas, respuestas desordenadas dirigidas a distintos campos y el cambio a destinos inválidos. Es reproducción en un modelo de DOM, no la reproducción de un fallo gráfico del OpenCode instalado.

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| Primer conjunto, lógica original | 14 pruebas: 6 PASS, 8 FAIL esperados | [Log anterior al ajuste](logs/regresion-antes.txt) |
| Mismo conjunto, primer ajuste | 14/14 PASS | [Log posterior inicial](logs/regresion-despues.txt) |
| Suite final completa | 45/45 PASS: 24 existentes y 21 nuevas | [Log final de pruebas](logs/unitarias.txt) |
| TypeScript | PASS | [Log de tipos](logs/tipos.txt) |
| ESLint | 0 errores; 754 advertencias del código existente; archivos nuevos sin advertencias | [Diagnósticos](logs/lint.json) |
| Build productivo con esbuild | PASS | [Log de compilación](logs/build.txt) |
| Integración de bootstrap | Sintaxis válida para seis combinaciones: darwin/linux/win32 y legacy/v2 | [Resultado de integración](integracion.json), [log](logs/integracion.txt) |

Los [resultados estructurados](resultados.json) conservan conteos, hashes y límites. Los [hashes anteriores](antes.json) identifican los archivos antes de comenzar.

Las nuevas pruebas cubren: cambio de foco y cursor durante una lectura, reemplazo de selección en contenteditable con Unicode/saltos de línea y texto parecido a HTML, conservación de las vías paste/execCommand, respuestas repetidas/desconocidas, correlación de respuestas fuera de orden a diferentes campos, solicitudes vencidas o fallidas, destinos desconectados/read-only/disabled, portapapeles vacío, selección ausente, pegados rápidos independientes y teclado nativo fuera de macOS.

## Límites del cambio

- Los cuatro handlers de menciones/adjuntos, sus menús, atajos y eventos de activación mantienen el código/configuración anteriores. También se comprobaron sin cambios el puente sintético de archivos, el arranque, el wrapper del iframe y el comando de terminal.
- El control de teclado del portapapeles sigue condicionado a macOS. El helper de inserción ya era compartido con la inserción de texto programática; esta no añade captura de teclado en Linux o Windows.
- No se incorporaron captura de teclado del documento padre, ventanas de supresión de 500 ms, fallback al endpoint legacy append-prompt ni nuevos mecanismos de arrastre.
- La referencia Mac y los módulos/pruebas de raíz existentes, salvo la integración en extension.ts, conservan sus hashes. No se añadieron dependencias ni se cambió la versión de la extensión.
- El comparador de fase 2 se adaptó para poder construir el bootstrap con el módulo extraído. Su ejecución de comprobación se dirigió a una carpeta temporal; se preservaron los JSON/diffs históricos de fase 2.

## Qué queda para fase 4

Las pruebas usan el JavaScript del generador en node:vm con un DOM mínimo. No ejecutan Chromium, VS Code ni OpenCode; no validan renderizado, historial nativo de undo/redo, foco del editor real ni compatibilidad real de otros sistemas. La comprobación de seis combinaciones valida código generado y sintaxis, no seis ensayos gráficos.

En el build nuevo deben comprobarse el pegado inmediato y demorado, la posición intermedia y el reemplazo de selección, menú/comando/atajo, cortes y undo/redo, además de la regresión de los cuatro comandos de archivos. El fallback de Range requiere especial comprobación del historial de edición. También siguen en fase 4 la primera acción tras arranque, ocultar/mostrar la vista y restaurar sesiones.

La matriz gráfica de fase 1 sigue siendo evidencia del build anterior; no se reutiliza como PASS del código nuevo. No se inició ningún servidor de OpenCode para estas pruebas, no se generó un VSIX y no se publicó nada durante esta fase.

## Reproducción

Con las dependencias locales ya instaladas, desde la raíz:

```sh
npm run test:unit
npm run check-types
npm run lint
node esbuild.js --production
node docs/qa/20261103-fase3-pegado/verificar-integracion.cjs
```

El [verificador de integración](verificar-integracion.cjs) utiliza los módulos compilados en out/ por test:unit y compara las funciones preservadas contra la revisión Git registrada en integracion.json. No activa la extensión ni realiza operaciones de interfaz.

## Continuación: fase 4

La [regresión gráfica](../20261103-fase4-regresion/reporte.md) conserva sus builds y evidencias por separado. El verificador de esta fase describe el snapshot anterior: para el código actual debe usarse `docs/qa/20261103-fase4-regresion/verificar-integracion.cjs`, que contempla los cambios intencionales en puentes de comandos y carga.

## Cierre posterior de fase 4

El [informe final de restauración activa](../20261103-restauracion-activa/reporte.md) documenta el retiro de las inserciones directas de pegado, las confirmaciones manuales y el retest nativo aprobado de B activa, pestañas y cierre. Fase 4 cerrada para OpenCode 2.2.5 en macOS/VSCodium y comandos de la extensión. Fase 5 pendiente. Los resultados anteriores de este documento mantienen su hash y carácter histórico.
