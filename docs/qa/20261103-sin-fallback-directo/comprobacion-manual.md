# Comprobación del build sin inserciones directas

Objetivo: OpenCode 2.2.5, macOS y VSCodium. Build inicial de la ejecución: `b626e211e708e4a9f7e05ef7849235fcca0cdf7d5534ff79d52f1c821aaabbaa` de dist/extension.js. La ejecución está completada según ejecucion-manual.json: los casos iniciales se confirmaron sobre ese build y la restauración/fixtures se repitieron sobre el build corregido 7ac05abf. Para reproducir el código actual se debe usar el hash completo 7ac05abfc7ae4a638bd18fe6822ad34e133f253b24aec178e1e4ec613cc11f25.

## Preparación

1. Ejecutar `npm run test:unit`, `npm run check-types`, `npm run lint` y `node esbuild.js --production` desde la raíz.
2. Verificar el hash con `shasum -a 256 dist/extension.js`.
3. En la ventana principal del repositorio abrir **Ejecución y depuración**, seleccionar **QA sin fallback directo** y pulsar **F5**. La configuración está en [.vscode/launch.json](../../../.vscode/launch.json); conserva Run Extension y añade el perfil separado QA-sin-fallback-directo.
4. En el host de desarrollo, si aparece sin carpeta, usar Archivo → Abrir área de trabajo desde archivo… y abrir [qa-sin-fallback.code-workspace](fixtures/qa-sin-fallback.code-workspace). Los fixtures se conservan ahora dentro de este informe: el workspace temporal anterior ya no existe.
5. Confirmar que el host usa QA-sin-fallback-directo, la extensión raíz y OpenCode 2.2.5. Abrir el canal Output → OpenCode y un borrador vacío. No enviar los borradores al modelo.

Los directorios de ejecución están preparados bajo `/private/tmp/opencode-qa-sin-fallback-20261103`; el estado de preparación está en [preparacion-manual.json](preparacion-manual.json). Los casos se registrarán en [ejecucion-manual.json](ejecucion-manual.json); ahora están actualizados con las confirmaciones y la repetición gráfica aprobada.

**Primer bloque:** abrir copiar-fase4.txt, copiar todo, enfocar un borrador vacío de OpenCode y pegar con Cmd+V. Deben aparecer las dos líneas una sola vez. Después Cmd+Z debe vaciar el prompt y Cmd+Shift+Z debe reponer el texto. Capturar el resultado y conservar el canal Output de esa sesión.

## Pegado y edición

Copiar desde el editor de VSCodium el texto de copiar-fase4.txt (`QA_FASE4`, salto de línea, `línea_ñ`). Para cada variante abrir un borrador limpio y conservar una captura y el log del canal OpenCode.

| Acción | Resultado esperado |
| --- | --- |
| Cmd+V inmediatamente | Texto completo una vez |
| Mantener foco al menos diez segundos y luego Cmd+V | Mismo resultado; la espera es anterior a solicitar el portapapeles |
| Escribir ANTESQUITARDESPUES, seleccionar QUITAR y pegar | ANTES + texto multilínea + DESPUES |
| Colocar el cursor entre ANTES y QUITAR y pegar | Se inserta en esa posición sin borrar el resto |
| Dos Cmd+V consecutivos | Dos inserciones completas, sin supresión ni duplicados adicionales |
| Editar → Pegar | Texto completo una vez |
| Paleta nativa → Paste into OpenCode | Texto completo una vez |
| Cmd+A, Cmd+X, Cmd+V | Selección completa, corte y reposición correctos |
| Cmd+Z tras pegar y Cmd+Shift+Z | Revierte y repone la inserción completa |
| Ocultar y mostrar OpenCode | Conserva el contenido del borrador |

El log debe identificar `clipboard paste event handled` o `clipboard inserted with execCommand`. `clipboard text could not be inserted` señala un fallo que debe conservarse como evidencia. La prueba de cambio de foco mientras la respuesta de portapapeles está pendiente requiere poder provocar/observar ese intervalo: cambiar el foco después de que el texto ya apareció no acredita ese escenario. El protocolo asíncrono sí tiene cobertura automatizada.

## Regresión de comandos de archivos y ciclo de vida

Usar los fixtures contexto.txt, archivo con espacios ñ.txt e imagen.png del workspace aislado. Para cada comando abrir un borrador limpio.

| Acción | Resultado esperado |
| --- | --- |
| Explorador → Add to OpenCode sobre contexto.txt | Una sola referencia a contexto.txt |
| Add Files to OpenCode… seleccionando ambos TXT | Dos referencias, una por archivo, con espacios y ñ conservados |
| Explorador → Attach to OpenCode sobre imagen.png | Una imagen terminada de cargar |
| Attach Files to OpenCode… seleccionando imagen y TXT con ñ | Dos adjuntos terminados, sin duplicados |
| Primer comando inmediatamente tras recargar el host | Se entrega al terminar de montar el prompt, sin repetirlo |
| Cerrar/reabrir con las dos sesiones vacías de QA | Conserva pestañas y sesión activa, sin pantalla de error |
| Cerrar el host | Un solo servidor por arranque; sin listeners de QA restantes en sus puertos |

Los comandos se invocan desde el Explorador o sus selectores nativos. El arrastre físico queda fuera del alcance.

Guardar resultados por caso como PASS/FAIL/PENDIENTE, con captura, log y hash del build. No usar las capturas anteriores como evidencia de esta ejecución. Solo después de esta repetición puede cerrarse la aceptación gráfica de fase 4 y continuar con fase 5.
