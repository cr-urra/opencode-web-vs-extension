# Comparación inicial de macOS: raíz y referencia Mac

Fecha: 1 de noviembre de 2026, America/Santiago.

Estado: controles automáticos y 26 comprobaciones gráficas con resultado PASS. Cinco intentos de arrastre quedaron como observaciones sin entrega verificable del gesto; requieren control manual. Este informe no declara resuelta la compatibilidad de la raíz.

## Objetivo y alcance

Establecer una base reproducible antes de incorporar las adaptaciones de `mac-version/opencode-web-vs-extension-feature-clipboard-mac` al proyecto raíz. La referencia funcional aportada por el usuario se conserva; las observaciones siguientes corresponden exclusivamente al equipo y las versiones de esta ejecución.

No se modificaron fuentes, manifiestos ni configuraciones de desarrollo de ninguno de los dos proyectos. Se instalaron dependencias de desarrollo compartidas, se generaron builds y se añadieron estos artefactos de QA. Los perfiles, configuraciones de depuración y archivos de prueba se prepararon fuera del repositorio, en un directorio temporal.

## Entorno verificado

| Componente | Valor |
| --- | --- |
| Sistema | macOS 26.4, build 25E246 |
| Arquitectura | arm64, Apple Silicon |
| VSCodium | 1.143.17232, commit `c072cf642cbbadabefa22f39c58cc902a8b7427f` |
| Electron Framework | 43.7.7, según el `Info.plist` de la aplicación |
| OpenCode | `opencode v2.2.5`, ejecutable `/opt/homebrew/bin/opencode` |
| Navegador de control | Brave 156.1.98.62 |
| Node / npm | v26.13.0 / 11.20.0 |
| TypeScript / esbuild / ESLint | 5.9.3 / 0.25.12 / 9.39.5 |
| Bun | No instalado; controles ejecutados directamente con Node y las herramientas locales |
| Proyecto raíz | 1.14.43, revisión `060062d743b40300568bcbd65b8b7b501a668f69` |
| Referencia Mac | 1.14.41, copia local indicada por el usuario |

El inventario del perfil original de VSCodium no contiene otra extensión OpenCode. Las variantes se ejecutaron secuencialmente como Extension Development Host con perfiles nombrados `QA-raiz-20261101` y `QA-macos-20261101`. Se comprobaron sus nombres en las ventanas y en el registro de perfiles del editor. Los directorios XDG de OpenCode son distintos para cada variante. Ambas utilizan el mismo ejecutable y la misma carpeta de fixtures.

La instalación de dependencias se realizó con npm, sin scripts de instalación ni modificaciones del manifiesto o de `bun.lock`. Las dos variantes usan esa instalación compartida. Esto iguala la herramienta entre variantes, pero no equivale a una instalación congelada de `bun.lock`. El árbol exacto quedó en [dependencias.json](dependencias.json).

Los hashes de las fuentes y del lock, rutas, versiones e inventario están en [entorno.json](entorno.json).

## Controles automáticos

| Control | Raíz | Referencia Mac |
| --- | --- | --- |
| TypeScript y compilación de pruebas | PASS | PASS |
| Pruebas unitarias existentes | PASS: 24/24 | PASS: 8/8 |
| ESLint | 0 errores, 754 advertencias | 0 errores, 430 advertencias |
| Build productivo con esbuild | PASS | PASS |

Las advertencias de ESLint ya corresponden al código original, principalmente a su estilo de punto y coma. No se corrigieron durante esta comparación.

Los comandos y códigos de salida están en [resultados-automaticos.json](resultados-automaticos.json), con sus logs individuales.

Se ejecutaron también ambos bundles reales con una API VS Code simulada y procesos OpenCode/proxies reales. En ambos casos se obtuvo HTML HTTP 200, se inyectó el bootstrap y el JavaScript generado pasó la comprobación de sintaxis. Es una comprobación de arranque, no una prueba del renderizado ni del teclado. Evidencia: [arranque-simulado.json](arranque-simulado.json), [raíz](logs/raiz-arranque-simulado.txt) y [Mac](logs/macos-arranque-simulado.txt).

## Escenarios reales de edición

Primero se abrió OpenCode sin extensión en Brave y se verificó el comportamiento del editor. Después se repitieron las acciones en las dos variantes de VSCodium. Se usaron teclas nativas mediante Computer Use, sin reemplazar los handlers de producción.

El texto de prueba contenía `QA_MAC_PASTE`, un salto de línea y `línea_2`. Los resultados se verificaron contra el contenido del prompt expuesto por accesibilidad y se guardaron capturas. El borrador no se envió durante los escenarios válidos.

| Escenario | Web independiente | Raíz | Referencia Mac |
| --- | --- | --- | --- |
| Pegado inmediato con Cmd+V | PASS [captura](01-webapp-pegado-inmediato.png) | PASS [captura](10-raiz-pegado-inmediato.png) | PASS [captura](20-macos-pegado-inmediato.png) |
| Pegado después de mantener el foco más de 10 s | PASS: 15,671 s [captura](02-webapp-pegado-demorado.png) | PASS: 14,999 s [captura](11-raiz-pegado-demorado.png) | PASS: 19,462 s [captura](21-macos-pegado-demorado.png) |
| Seleccionar todo y cortar con Cmd+A / Cmd+X | PASS [captura](03-webapp-cortar.png) | PASS [captura](12-raiz-cortar.png) | PASS [captura](22-macos-cortar.png) |
| Restaurar el texto cortado con Cmd+V | PASS [captura](04-webapp-restaurar-corte.png) | PASS [captura](13-raiz-restaurar-corte.png) | PASS [captura](23-macos-restaurar-corte.png) |
| Deshacer el pegado con Cmd+Z | PASS [captura](05-webapp-deshacer.png) | PASS [captura](14-raiz-deshacer.png) | PASS [captura](24-macos-deshacer.png) |
| Rehacer con Cmd+Shift+Z | PASS [captura](06-webapp-rehacer.png) | PASS [captura](15-raiz-rehacer.png) | PASS [captura](25-macos-rehacer.png) |
| Pegado en medio del texto, conservando prefijo y sufijo | Incluido en el primer caso | PASS [captura](18-raiz-pegado-en-cursor.png) | PASS [captura](28-macos-pegado-en-cursor.png) |
| Menú nativo Editar > Pegar | Sin probar | PASS [captura](19-raiz-menu-pegar.png) | PASS [captura](29-macos-menu-pegar.png) |
| Comando Paste into OpenCode de la paleta de VSCodium | No aplica | PASS [captura](32-raiz-paleta-pegar.png) | PASS [captura](30-macos-paleta-pegar.png) |
| Adjuntar imagen mediante selector de archivos de la extensión | Sin probar | PASS [captura](33-raiz-adjunto-selector.png) | PASS [captura](31-macos-adjunto-selector.png) |

El caso de la web independiente incluyó inserción en medio de `ANTESDESPUES`, conservando ambos lados del cursor. En las extensiones se comprobó tanto el pegado multilínea en el prompt vacío como la inserción de `QA_MAC_CONTROL` entre `ANTES` y `DESPUES`. Se verificó este último resultado con Cmd+V, el menú nativo y el comando de la extensión. La paleta de VSCodium se abrió mediante Ver > Paleta de comandos para distinguirla de la paleta propia de OpenCode.

En el control de adjuntos se utilizó `Attach Files to OpenCode...` y el selector nativo para elegir el mismo `imagen.png`. Se esperó al final de la carga: ambas variantes mostraron la imagen y el botón `Eliminar adjunto`. No se contó el estado transitorio de carga al 0 % como éxito.

Los resultados estructurados y las observaciones exactas están en [resultados-gui.json](resultados-gui.json). Los casos a partir del corte en Brave y todos los casos de las extensiones incluyen también un snapshot de accesibilidad en `logs/`.

Logs reales del canal OpenCode: [raíz, primera sesión](logs/raiz-extension-host.txt), [raíz, controles adicionales](logs/raiz-extension-host-controles.txt) y [referencia Mac](logs/macos-extension-host.txt). Contienen la instalación del bridge, las solicitudes/respuestas reales del portapapeles y el despacho de adjuntos. No son los logs del host simulado.

## Arrastres: observaciones y control pendiente

Se movió OpenCode a la barra lateral secundaria de cada perfil, dejando Explorer visible a la izquierda. Se utilizó la misma disposición de ventanas y los mismos puntos de origen/destino en ambas variantes. Finder se dispuso a la izquierda con los archivos de prueba y OpenCode a la derecha.

| Gesto automatizado | Raíz | Referencia Mac |
| --- | --- | --- |
| `contexto.txt` desde Explorer al prompt | Sin inserción observada [captura](16-raiz-arrastre-explorer.png) | Sin inserción observada [captura](26-macos-arrastre-explorer.png) |
| `imagen.png` desde Finder al prompt | Sin adjunto observado [captura](17-raiz-arrastre-finder.png) | Sin adjunto observado [captura](27-macos-arrastre-finder.png) |

Se hizo además un [reintento en la raíz](34-raiz-arrastre-icono.png), preseleccionando `imagen.png` e iniciando el gesto sobre su icono en Explorer, con el mismo resultado: ninguna inserción observada.

Durante los intentos de arrastre no aparecen `drop types`, `parent drop resolved` ni `parent drop requesting fallback` en el canal OpenCode. Estos mensajes sí aparecen posteriormente al adjuntar mediante selector: `prepared synthetic attachment`, `drop types: Files` y `redispatched synthetic attachment drop`, acompañados de la imagen visible en el prompt. Por tanto, el puente y la recepción del drop sintético funcionan; la entrega del gesto nativo automatizado sigue sin demostrarse.

La captura de cada arrastre identifica el estado final, pero no demuestra que el gesto automatizado entregara un drop válido al destino. Como tampoco produjo el resultado esperado en la referencia que el usuario confirma funcional, estos intentos no se clasifican como una regresión demostrada de la raíz.

Se pidió al usuario arrastrar manualmente `imagen.png` desde la ventana Finder preparada al prompt de `QA-macos-20261101`. El resultado y una captura posterior deben incorporarse antes de cerrar la comparación de arrastres. El arrastre de control en la web independiente también queda pendiente; no se lo declara probado.

## Diferencias de configuración encontradas

Con OpenCode 2.2.5, la raíz abrió el prompt con su autenticación automática por `auth_token`. La referencia Mac abrió una pantalla de conexión y requirió autenticación manual y abrir una nueva sesión.

Para completar los escenarios de edición en Mac se reinició únicamente ese perfil con `OPENCODE_SERVER_PASSWORD` fijado a una credencial local de prueba, en la configuración temporal de depuración. La raíz mantiene su contraseña generada por el propio código. La credencial no se incluyó en este informe ni en los artefactos del repositorio.

Esta diferencia de arranque se registra aparte del comportamiento del portapapeles; no se supone que desaparezca al copiar los listeners de la referencia.

Además, el OpenCode instalado devuelve HTML en `/global/health` y HTTP 405 ante el POST legacy a `/tui/append-prompt` de la referencia. La raíz continúa detectando la UI mediante `/app`, y la referencia continúa cargando pese al fallo del append inicial. Cualquier futuro fallback de pegado debe validarse contra la generación de OpenCode y no dar por operativo el endpoint legacy.

## Incidencias del procedimiento

- El control gráfico estuvo inicialmente bloqueado por permisos; el usuario habilitó el acceso y se continuó con escenarios reales. La aplicación Terminal no está permitida por Computer Use; las variantes se iniciaron mediante las configuraciones de Extension Development Host de VSCodium.
- El primer lanzamiento con flags separados interpretó directorios de perfil como carpetas de workspace. Se descartó y se repitió con flags explícitos `--opción=valor`, perfiles nombrados y `--folder-uri`. Los resultados válidos corresponden al fixture `workspace`, comprobado en los logs.
- Al preparar el texto inicial en Brave, `typeText` interpretó un salto de línea como envío. Se produjo una solicitud con el marcador de QA en la sesión aislada, y el agente leyó los fixtures. El caso se excluyó de la matriz; los escenarios válidos se ejecutaron después con pegado de bloque y sin envíos.
- Hubo un conflicto del portapapeles al preparar el bloque con Computer Use. Se inspeccionó el contenido antes de continuar y se repitió la preparación; ese intento tampoco se contabilizó como escenario válido.
- No se generó ni instaló un VSIX y no se publicó ninguna extensión. La ejecución real fue con los builds productivos cargados como extensión de desarrollo.

## Reproducción

Desde la raíz, con las dependencias instaladas:

```bash
node docs/qa/20261101-macos-baseline/preparar-baseline.mjs
```

El script crea perfiles/fixtures nuevos y guarda el entorno, tipos, pruebas, lint y builds. Repetirlo reemplaza los resultados automáticos y el entorno de este directorio; conservar una copia del informe si se desea mantener esta ejecución como referencia histórica.

Para repetir el arranque sin interfaz:

```bash
node docs/qa/20261101-macos-baseline/comprobar-arranque.mjs
```

Para la web independiente, usar el mismo comando con `--webapp`; imprime una URL local y se detiene con Ctrl+C. Usa la credencial temporal de `macos-password.txt`, que no se exporta a los logs de evidencia.

Para abrir una variante desde una terminal del usuario:

```bash
node docs/qa/20261101-macos-baseline/iniciar-variante.mjs raiz
node docs/qa/20261101-macos-baseline/iniciar-variante.mjs macos
```

Ejecutar secuencialmente, cerrando primero el host de la variante anterior. Como alternativa completamente gráfica, abrir en VSCodium la carpeta temporal `workspace` indicada en `entorno.json`; su `.vscode/launch.json` contiene las dos configuraciones de depuración. Seleccionar la variante en Ejecución y depuración y usar F5.

La variante Mac puede solicitar la contraseña local del servidor. El archivo `macos-password.txt`, dentro del runtime temporal, contiene la credencial de prueba y tiene permisos 0600. No copiarlo a los artefactos ni guardar esa contraseña en un gestor personal.

## Interpretación y trabajo restante del paso 1

En las versiones concretas de este equipo no se reprodujo el fallo de pegado o de edición en la raíz durante los escenarios ejecutados. Esto no invalida la experiencia del usuario ni demuestra compatibilidad general de macOS: faltan otros recorridos y otras combinaciones de editor, sistema y OpenCode.

La comparación pendiente es el drop manual de control y su contraste con la raíz. Tampoco se probaron pulsaciones repetidas rápidas, arrastre múltiple/Unicode ni otro hardware Intel/Apple Silicon. Deben conservarse como pendientes, sin extrapolar un PASS de las pruebas unitarias.

La web independiente y el host raíz se cerraron después de guardar la evidencia. El perfil Mac y Finder se dejaron abiertos para el control manual solicitado; su servidor de OpenCode permanece activo mientras esa ventana siga abierta.

Se verificó por conexión local que los puertos de las sesiones cerradas rechazan conexiones. El único proxy esperado activo en la comprobación final es el del perfil Mac preparado para el control: [estado de puertos](estado-puertos.json). La [captura de la disposición final](35-macos-control-manual-preparado.png), su [snapshot](logs/35-macos-control-manual-preparado.txt) y el [log de esa sesión Mac](logs/macos-control-manual-host.txt) identifican el estado desde el que continuar.

No corresponde implementar todavía las adaptaciones de los pasos siguientes para intentar conseguir un resultado esperado en esta matriz. Primero se debe cerrar el control de arrastre o dejar explícito el impedimento de observación.

## Actualización de alcance del 2 de noviembre

El usuario indicó que las menciones y los adjuntos deben validarse mediante los comandos de la extensión y dejó el arrastre de archivos fuera del alcance actual. Por tanto, el control de arrastre pendiente descrito en este informe histórico deja de ser condición para cerrar el paso 1. La matriz vigente y la evidencia posterior están en el [informe de comandos](../20261102-arrastre-manual/reporte.md).

El 3 de noviembre quedó completada la matriz de los cuatro comandos en la referencia Mac y la raíz, con los límites de evidencia detallados en ese informe. El paso 1 se considera cerrado para ese alcance; no se modificó la implementación.
