# Recorridos y requisitos

## Recorrido 1: abrir OpenCode

**Actor:** desarrollador con CLI instalado.

1. Abre VS Code y un workspace.
2. La extension se activa y abre Activity Bar despues de 500 ms.
3. Ve `Starting opencode...`.
4. La extension inicia CLI, espera `/app`, crea proxy, anexa contexto si hay carpetas e instala bootstrap solo si hay root comun.
5. Ve el frontend OpenCode embebido; el proyecto solo queda sembrado si raiz e inyeccion estuvieron disponibles.

**Fallo actual:** mensaje generico sin retry; diagnosticos del CLI se descartan.

## Recorrido 2: mencionar archivo activo

1. Abre un archivo y opcionalmente selecciona lineas.
2. Ejecuta `Add Filepath to Terminal` o su shortcut.
3. Se anexa `@path#Lx-Ly` al prompt de OpenCode.

**Nota:** el nombre “Terminal” es historico/inconsistente; no usa una terminal.

## Recorrido 3: enviar referencias

1. Selecciona uno o varios recursos del Explorer, usa archivo activo o picker.
2. Ejecuta `Add to OpenCode`/`Add Files to OpenCode`.
3. La extension valida membership, deduplica y genera paths relativos.
4. Si hay webview, sintetiza drops; de lo contrario usa append-prompt.

**Fallo actual:** no hay confirmacion ni ACK; multi-root puede generar paths ambiguos.

## Recorrido 4: adjuntar archivos

1. Selecciona archivo activo, Explorer o picker multiple.
2. Ejecuta un comando Attach.
3. La extension lee la version persistida de los archivos completos y envia base64; cambios dirty no guardados no viajan.
4. El iframe reconstruye `File[]` y dispara un drop.

**Fallo actual:** no hay limites, progreso, cancelacion ni confirmacion de aceptacion.

## Recorrido 5: drag/drop

1. Arrastra recursos hacia el frontend.
2. El bootstrap inspecciona varios MIME payloads.
3. Paths bajo el root comun se convierten directamente.
4. URIs no-file se consultan al Extension Host.
5. Se redistribuyen drops `file:` al frontend.

**Fallo actual:** containment lexical, diferencia entre root comun y membership real, maps pendientes sin timeout.

## Recorrido 6: editar en macOS

1. El foco esta en `opencode.sidebar`.
2. Usuario ejecuta Cmd+C/X/V/A/Z o Shift+Cmd+Z.
3. Keybinding/keydown bridge pide clipboard o ejecuta fallbacks DOM.
4. El contenido se copia, corta, pega, selecciona o deshace.

**Fallo actual:** eventos sinteticos y `execCommand` pueden variar por editor/Chromium.

## Requisitos funcionales confirmados

| ID | Requisito | Estado/evidencia |
| --- | --- | --- |
| FR-01 | Proveer una vista web OpenCode en Activity Bar. | Implementado. |
| FR-02 | Iniciar automaticamente un servidor OpenCode local. | Implementado. |
| FR-03 | Usar el workspace como contexto/proyecto inicial. | Contexto con cualquier lista de carpetas; bootstrap/seeding solo con ancestro comun. |
| FR-04 | Referenciar archivo activo y lineas seleccionadas. | Implementado. |
| FR-05 | Referenciar seleccion multiple de Explorer/picker. | Bridge implementado; aceptacion frontend sin ACK. |
| FR-06 | Adjuntar uno o varios archivos binarios. | Bridge implementado sin limites ni ACK. |
| FR-07 | Normalizar drag/drop disponible desde VS Code. | Bridge implementado con fallbacks; depende del bootstrap/frontend. |
| FR-08 | Puente de clipboard para frontend embebido. | Bridge de extension disponible si hay bootstrap; sin root, comportamiento nativo desconocido. |
| FR-09 | Workaround de edicion macOS. | Intento de compatibilidad; depende del target DOM/Chromium. |
| FR-10 | Adaptarse a cambios de carpetas del workspace. | Implementado. |
| FR-11 | Registrar diagnosticos de integracion. | Implementado via Output channel. |

## Requisitos no funcionales observados

| ID | Requisito implicito | Estado actual |
| --- | --- | --- |
| NFR-01 | Compatibilidad VS Code 1.94+ y VSCodium. | Engine VS Code declarado; README y manifest reclaman VSCodium, sin matriz automatizada especifica. |
| NFR-02 | Startup sin configuracion adicional salvo CLI. | Implementado; dependiente de PATH y contratos privados. |
| NFR-03 | Aislar red en loopback. | Proxy si; bind del CLI no se fuerza desde extension. |
| NFR-04 | Mantener extension responsive con archivos. | No garantizado; buffering/base64 sin limites. |
| NFR-05 | Cerrar procesos al desactivar. | Best-effort, no garantizado. |
| NFR-06 | Proteger clipboard/filesystem. | Insuficiente: endpoints y mensajes sin autenticacion/origen. |
| NFR-07 | Diagnosticos accionables. | Parcial: buenos logs propios, sin stderr/stdout ni UI accionable. |
| NFR-08 | Soportar multi-root correctamente. | Parcial y riesgoso por ancestro comun/paths relativos. |
| NFR-09 | Compatibilidad con upgrades OpenCode. | No hay pin, deteccion ni contract tests. |
| NFR-10 | Testabilidad y mantenibilidad. | TypeScript estricto; cobertura y modularidad insuficientes. |

## Criterios faltantes para una experiencia robusta

1. El usuario puede controlar auto-open/auto-start.
2. Fallos muestran causa y accion de retry/restart.
3. El servidor no arranca en una raiz mas amplia sin consentimiento.
4. Operaciones de archivos tienen limites, progreso, cancelacion y resultado.
5. Mensajes y endpoints estan autenticados/validados.
6. Lifecycle es serial y no deja procesos huerfanos.
7. Compatibilidad OpenCode se detecta y documenta.
8. Remote/virtual se soporta explicitamente o se rechaza con mensaje claro.
