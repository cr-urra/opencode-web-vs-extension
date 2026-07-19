# SOP: cambios en la integracion

## Objetivo

Reducir regresiones al modificar comandos, proxy, mensajes, paths, clipboard o bootstrap inyectado.

## Antes de editar

1. Identificar el limite afectado en `docs/system/arquitectura.md`.
2. Registrar el contrato actual desde `docs/system/contratos-integracion.md`.
3. Determinar si el comportamiento pertenece a la extension o al frontend OpenCode externo.
4. Definir compatibilidad minima de VS Code, SO y version OpenCode.
5. Revisar riesgos de `docs/system/riesgos-y-calidad.md`.

## Agregar o modificar un comando

Actualizar de forma atomica:

1. `contributes.commands` en `package.json`.
2. `activationEvents`, si aplica.
3. Menus y keybindings, con `when` especifico.
4. Registro/disposal del handler en `activate()`.
5. README, PRD y tabla de contratos.
6. Pruebas del handler y smoke test por plataforma.

Evitar comandos visibles que no hacen nada en una plataforma. Mantener nombres coherentes entre manifest, shortcut y README.

## Cambiar mensajes webview

1. Definir schema de request y response, incluyendo errores.
2. Actualizar emisor, wrapper relay y consumidor; hoy pueden ser tres lugares distintos.
3. Validar `event.source` y origen esperado.
4. Usar correlation ID y timeout para requests.
5. Agregar handshake de app lista si el mensaje no puede perderse.
6. Agregar acknowledgement de aplicacion, no solo resultado de `postMessage()`.
7. Eliminar rutas viejas si no hay consumidor externo real.

## Cambiar endpoints de proxy

1. Exigir token por sesion o mecanismo de capacidad.
2. Restringir metodo y path exactos.
3. Limitar body y tiempo de lectura.
4. Manejar abort/error de request y response.
5. No registrar contenido sensible.
6. Probar accesos no autorizados desde otro proceso local.
7. Documentar request, response, errores y consumidor.

## Cambiar recursos o attachments

1. Separar membership del workspace de seleccion explicita externa.
2. Canonicalizar paths antes de containment.
3. Definir comportamiento multi-root y remote.
4. Aplicar limites por archivo, cantidad y total.
5. Evitar copias completas si puede usarse streaming o URI controlada.
6. Preservar identidad mas alla del basename.
7. Probar archivos unreadable, directorios, duplicados y dirty editors.

## Cambiar el bootstrap browser

El script vive como `String.raw` dentro de TypeScript, pero su JavaScript no recibe type-check o lint independiente.

1. Mantener compatibilidad con Chromium de la version minima de VS Code.
2. Evitar APIs deprecadas nuevas.
3. No asumir estructura DOM privada si puede usarse una API estable.
4. Limpiar listeners, maps pendientes y timeouts.
5. Probar CSP, falta de `<head>`, no-workspace y navegacion del iframe.
6. Actualizar fixtures/tests de inyeccion antes de cambiar contratos de OpenCode.

## Criterio de salida

1. Contrato documentado y version/compatibilidad explicitada.
2. Validaciones negativas, limites y timeouts implementados.
3. Tests automaticos del protocolo y smoke test real.
4. Logs utiles sin payload sensible.
5. Documentacion system, SOP y PRD sincronizada.
