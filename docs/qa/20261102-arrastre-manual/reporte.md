# Validación de menciones y adjuntos mediante comandos en macOS

Fechas: 2 y 3 de noviembre de 2026, America/Santiago.

**Estado: paso 1 cerrado para el alcance acordado.** Los cuatro comandos de menciones y adjuntos funcionaron en la referencia Mac y en la raíz con los archivos probados. Se conservan abajo los límites de la evidencia de menciones múltiples de Mac. No se hicieron cambios de implementación ni se publicó o instaló un VSIX.

## Alcance

El usuario indicó que las menciones y los adjuntos deben funcionar mediante los comandos añadidos por la extensión. El arrastre de archivos queda fuera de esta etapa y no bloquea su cierre. La web independiente no dispone de estos comandos y no requiere un control adicional para esta matriz.

Este informe continúa el [baseline del 1 de noviembre](../20261101-macos-baseline/reporte.md). Se reutilizaron sus bundles y se crearon fixtures nuevos porque el runtime anterior ya no existía. Los hashes de `src/extension.ts` de ambas variantes siguen coincidiendo con ese baseline: [comprobación de fuentes](fuentes.json). Las pruebas automáticas del baseline no se repitieron, dado que no se modificó la implementación.

## Resultado de la matriz

| Flujo | Comando | Referencia Mac | Raíz |
| --- | --- | --- | --- |
| Mención individual | Add to OpenCode | PASS | PASS |
| Menciones múltiples mediante selector | Add Files to OpenCode... | PASS confirmado por el usuario y logs; límite de evidencia indicado abajo | PASS con dos archivos, espacios y ñ, sin duplicados |
| Adjunto individual | Attach to OpenCode | PASS | PASS |
| Adjuntos múltiples mediante selector | Attach Files to OpenCode... | PASS con imagen y TXT | PASS con imagen y TXT |

Los resultados, nombres de perfiles, borradores y preparaciones están en [resultados.json](resultados.json). Los perfiles utilizados fueron `QA-macos-manual` y `QA-raiz-manual`, con el mismo directorio de fixtures.

## Referencia Mac

### Attach to OpenCode

El usuario seleccionó `imagen.png` en el Explorador y utilizó **Attach to OpenCode**. Precisó que no había realizado un arrastre, por lo que se corrigió la atribución inicial de la acción. La [captura aportada](01-macos-adjunto-usuario.png) y la inspección posterior del perfil Mac confirmaron una sola imagen cargada y su botón Eliminar adjunto. **PASS.**

### Add to OpenCode

El usuario ejecutó el comando preparado sobre `contexto.txt`. Su [captura](02-macos-mencion-contexto-usuario.png) muestra una sola mención `@contexto.txt`; la accesibilidad posterior confirmó ese contenido. **PASS.** La inspección encontró después una sesión ya creada; el asistente no envió mensajes durante esa inspección.

### Add Files to OpenCode...

Se abrió un borrador vacío y se invocó el comando con `Cmd+Option+Shift+S`. En el selector se eligieron `contexto.txt` y `archivo con espacios ñ.txt`. El usuario confirmó que aparecían ambos y posteriormente indicó «entiendo, funciona». Los [logs Mac](logs/macos-extension-host.txt) registran ambos nombres en una misma operación. **PASS reportado por el usuario para la incorporación de ambas referencias.**

Límite: no se conservó una captura del resultado inmediatamente después de esa única invocación. Una inspección tardía, posterior a otras acciones del usuario, encontró el nombre completo con ñ y dos menciones de `contexto.txt`. Ese estado no permite atribuir la repetición al comando múltiple ni certificar ausencia de duplicados en su ejecución inicial. No se declara una regresión por esa observación. En la raíz sí se documentó una ejecución aislada sin duplicados.

### Attach Files to OpenCode...

En un borrador vacío se invocó el comando con `Cmd+Shift+A` y se seleccionaron `imagen.png` y `archivo con espacios ñ.txt`. La [captura del usuario](03-macos-adjuntos-multiples-usuario.png) y la inspección posterior identificaron ambos archivos por nombre, cada uno con Eliminar adjunto, sin indicadores de carga pendientes. Se conservó el nombre con espacios y ñ. **PASS.**

## Raíz

### Add to OpenCode

El usuario confirmó que solo se referenció `contexto.txt`. La inspección encontró exactamente `@contexto.txt ` en el prompt, sin otros archivos ni duplicados. **PASS.** Evidencia: [captura](04-raiz-mencion-contexto.jpg) y [accesibilidad](logs/04-raiz-mencion-contexto-ax.txt).

### Add Files to OpenCode...

El usuario confirmó ambas referencias correctas. La inspección encontró exactamente `@archivo con espacios ñ.txt @contexto.txt `: dos referencias, una por archivo, conservando espacios y ñ. **PASS.** Evidencia: [selector preparado](05-raiz-menciones-multiples-preparadas.jpg), [resultado](06-raiz-menciones-multiples.jpg) y [accesibilidad](logs/06-raiz-menciones-multiples-ax.txt).

### Attach to OpenCode

El usuario confirmó que la imagen cargó. La inspección encontró una sola `imagen.png` con Eliminar adjunto, sin carga pendiente y con el prompt vacío. **PASS.** Evidencia: [captura](07-raiz-adjunto-individual.jpg) y [accesibilidad](logs/07-raiz-adjunto-individual-ax.txt).

### Attach Files to OpenCode...

Se seleccionaron `imagen.png` y `archivo con espacios ñ.txt` mediante el comando en un borrador vacío. El usuario confirmó ambos adjuntos correctos. La inspección identificó cada archivo por nombre y su botón Eliminar adjunto: dos adjuntos, sin duplicados ni carga pendiente, conservando espacios y ñ. **PASS.** Evidencia: [selector preparado](08-raiz-adjuntos-multiples-preparados.jpg), [resultado](09-raiz-adjuntos-multiples.jpg) y [accesibilidad](logs/09-raiz-adjuntos-multiples-ax.txt).

## Entorno, logs y límites

Los [logs Mac](logs/macos-extension-host.txt) y los [logs raíz](logs/raiz-extension-host.txt) corresponden a los hosts reales. Los [logs de preparación de la raíz](logs/raiz-extension-host-preparacion.txt) registran el workspace y el arranque del servidor/proxy. Al abrir el workspace guardado, VSCodium recuperó inicialmente su asociación al perfil Mac; se seleccionó explícitamente `QA-raiz-manual` antes de preparar las pruebas de la raíz.

Durante la inspección y preparación el asistente no envió los borradores a OpenCode. Los resultados acreditan estos recorridos con los fixtures y el equipo probado; no se extrapolan a otros sistemas, versiones, archivos grandes, pulsaciones rápidas ni al arrastre. El control aislado de duplicados del selector Mac conserva el límite descrito arriba.

La validación no reprodujo un fallo en los comandos del alcance acordado. Este cierre proporciona la comparación inicial para evaluar los siguientes cambios del plan; no acredita una corrección de código, porque no se implementó ninguna.

Se cerraron los hosts de QA tras conservar la evidencia. La comprobación local con lsof no encontró listeners en los puertos de las sesiones probadas. Se conservaron los fixtures y perfiles temporales para reproducir las pruebas.

## Continuación: fase 2

La comparación de código quedó documentada en el [informe de fase 2](../../analisis/20261103-fase2/reporte.md). Los cuatro handlers y su configuración de comandos son idénticos entre variantes; las diferencias Mac pendientes se concentran en el pegado y la captura adicional de teclado. Esa fase no modificó la implementación ni añadió pruebas gráficas a esta matriz.

La implementación posterior de pegado se documentó en el [informe de fase 3](../20261103-fase3-pegado/reporte.md). Esta matriz gráfica corresponde al build anterior; la regresión del build nuevo queda para la fase 4.

La regresión posterior está en el [informe de fase 4](../20261103-fase4-regresion/reporte.md), con tres correcciones y una limitación abierta de undo del fallback Range. Esta matriz de fase 1 mantiene su carácter histórico.

El [retiro posterior del fallback de pegado](../20261103-sin-fallback-directo/reporte.md) pasa la comprobación automática; tiene pendiente la repetición gráfica del nuevo build.

## Cierre posterior de fase 4

El [informe final de restauración activa](../20261103-restauracion-activa/reporte.md) documenta el retiro de las inserciones directas de pegado, las confirmaciones manuales y el retest nativo aprobado de B activa, pestañas y cierre. Fase 4 cerrada para OpenCode 2.2.5 en macOS/VSCodium y comandos de la extensión. Fase 5 pendiente. Los resultados anteriores de este documento mantienen su hash y carácter histórico.

El [VSIX de fase 5](../20261103-fase5-vsix/reporte.md) quedó generado y revisado localmente, con el bundle validado de fase 4 y una observación preexistente de licencia. No se instaló ni publicó en esa fase.
