# Definicion de producto

## Producto

**OpenCode Web IDE (Unofficial)** es una extension para VS Code/VSCodium que aloja el frontend web de un OpenCode instalado externamente dentro de una barra lateral y agrega adaptadores para el entorno IDE.

## Problema

El frontend web de OpenCode no tiene acceso nativo a todas las interacciones de VS Code. En particular, iframes/webviews presentan friccion con:

- Seleccion y referencia de archivos del workspace.
- Transferencia visual de imagenes, PDFs y binarios.
- Drag/drop desde Explorer.
- Clipboard y shortcuts de edicion, especialmente en macOS.
- Seleccion automatica del proyecto actual.

## Propuesta de valor

Permitir que un desarrollador que ya tiene `opencode` use su experiencia web sin abandonar VS Code, intentando preseleccionar el workspace cuando existe una raiz comun y ofreciendo atajos para llevar contexto al composer.

## Limite de producto

### Propio de esta extension

- Contenedor Activity Bar y webview.
- Lanzamiento/reutilizacion/cierre best-effort del servidor local.
- Proxy HTTP/WebSocket e inyeccion del bootstrap.
- Contexto de workspace, referencias, attachments y drag/drop.
- Puentes de clipboard y comandos macOS.
- Logs de integracion.

### Propio de OpenCode externo

- Chat/composer, sesiones y respuestas.
- Modelos, proveedores, autenticacion y costos.
- Ejecucion del agente y herramientas.
- Interpretacion final de referencias/attachments.
- Persistencia y UX interna del frontend.

La extension no fija una version del CLI, por lo que las capacidades de agente no pueden prometerse desde este repositorio.

## Usuarios

| Persona | Necesidad | Evidencia |
| --- | --- | --- |
| Desarrollador VS Code/VSCodium que ya usa OpenCode | Acceder a OpenCode dentro del IDE. | README y vista Activity Bar. |
| Usuario orientado a teclado | Enviar contexto con shortcuts. | Once comandos y keybindings. |
| Usuario de Explorer | Enviar selecciones simples o multiples. | Menus contextuales y handlers. |
| Usuario con imagenes/PDF/binarios | Adjuntar archivos visualmente. | Flujo Attachment y MIME map. |
| Usuario macOS | Mitigar fallos de edicion dentro del iframe. | Bridge y keybindings especificos; eficacia end-to-end dependiente del frontend/Chromium. |
| Maintainer | Construir y publicar VSIX. | Scripts build/release/publish. |

Windows y POSIX tienen consideraciones de paths; no hay evidencia suficiente para prometer soporte de remote/virtual/web.

## Alcance actual confirmado

1. Auto-activar y abrir una vista OpenCode.
2. Lanzar `opencode serve` con el root comun como `cwd` cuando puede resolverse.
3. Anexar contexto cuando hay carpetas; sembrar proyecto local solo si existe root comun y la inyeccion funciona.
4. Referenciar archivo activo con lineas seleccionadas.
5. Implementar el envio de referencias de Explorer/picker; la aceptacion final no tiene ACK.
6. Implementar el bridge de archivos como browser `File`; la aceptacion final no tiene ACK.
7. Implementar normalizacion de drops y resolucion de URIs mediante VS Code.
8. Implementar clipboard desde el iframe cuando el bootstrap esta instalado.
9. Intentar mitigar copy/cut/paste/select-all/undo/redo en macOS.
10. Reaccionar a altas/bajas de carpetas de workspace.

## Fuera del alcance implementado

Esto describe ausencia actual, no non-goals permanentes:

- Instalar o actualizar OpenCode.
- UI nativa de chat, modelos o sesiones.
- Selector/configuracion de servidor.
- Start/stop/restart/reconnect para usuarios.
- Settings de extension.
- Compatibilidad negociada con versiones OpenCode.
- Onboarding, telemetry, analytics o localizacion.
- Integracion SCM, Problems, terminal o diff review.
- Gestion explicita de workspace trust.
- Limites/progreso/cancelacion de attachments.
- Soporte formal de remote, virtual workspace o VS Code web.

## Restricciones

- VS Code 1.94 o posterior segun `engines`; README y metadata del manifest declaran VSCodium, sin constraint o matriz propia.
- Desktop Extension Host con Node APIs.
- `opencode` en el PATH del Extension Host.
- Contratos privados OpenCode compatibles.
- Acceso loopback y capacidad de crear proceso local.
- Chromium con APIs de eventos/clipboard usadas.

### Escenario sin raiz comun

Con una ventana sin carpetas o carpetas Windows en drives diferentes, `workspaceRoot` puede quedar `undefined`. Si existen carpetas, sus rutas aun se anexan como contexto. El child arranca con el `cwd` por defecto del host y no se inyecta el bootstrap; project seeding y los bridges de clipboard, attachments y drops provistos por la extension quedan indisponibles aunque el iframe pueda cargar. El comportamiento nativo del frontend es desconocido.

Los archivos dirty se adjuntan desde la version guardada en filesystem. Un documento untitled no tiene un archivo persistido para transferir por este flujo.

## Exito y metricas

El repositorio no define telemetria, objetivos ni metricas. Antes de medir, producto debe acordar como minimo:

- Porcentaje de startups exitosos y tiempo a UI lista.
- Tasa de entrega exitosa de referencias/attachments.
- Fallos por version OpenCode, VS Code y SO.
- Procesos huerfanos por sesion.
- Incidentes de workspace root demasiado amplio.
- Fallos de clipboard/shortcuts en macOS.

Toda medicion debe tener politica de privacidad; no se debe capturar prompt, clipboard, contenido de archivos ni rutas completas por defecto.
