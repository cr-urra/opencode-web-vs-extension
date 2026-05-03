# Plan de evolucion: drag and drop en OpenCode Web for IDE

## Contexto

La extension muestra OpenCode web dentro de un `WebviewView` de VS Code/VSCodium. OpenCode ya soporta dos flujos distintos de archivos:

- Archivos externos del sistema operativo: llegan como `DataTransfer.files` y OpenCode los muestra como adjuntos visuales.
- Archivos del workspace: pueden representarse como menciones `@archivo`, que OpenCode usa como contexto del proyecto.

Desde el Explorer interno de VS Code, los archivos no llegan como `File` real. Normalmente llegan como URIs en `text/uri-list`, `text/plain` o tipos internos del workbench. Por eso la solucion actual normaliza esos datos al formato que OpenCode espera para mencionar archivos del workspace.

## Objetivo

Evolucionar el soporte de drag and drop desde el Explorer interno de VS Code hacia OpenCode web, manteniendo el flujo nativo de OpenCode y evitando interferir con drops desde el explorador del sistema operativo.

## Recomendaciones

1. Robustecer el normalizador actual.

- Soportar `text/uri-list`, `text/plain`, `application/vnd.code.uri-list`, `resourceurls` y `codefiles`.
- Parsear multiples archivos, no solo el primero.
- Normalizar siempre a rutas relativas del workspace.
- Mantener el formato que OpenCode espera: `file:src/archivo.ts`.

2. Soportar multiples drops correctamente.

- Si se arrastran varios archivos desde el Explorer, generar varias menciones `@archivo`.
- Verificar si OpenCode acepta multiples `file:path` en un solo drop sintetico.
- Si no lo acepta, disparar varios drops sinteticos o insertar las menciones usando el mecanismo interno mas compatible.

3. Agregar fallback hacia la extension.

- Si el webview recibe URIs que no son `file://`, enviar esos URIs a la extension con `postMessage`.
- La extension puede resolverlos con `vscode.workspace.fs.readFile()`.
- Esto ayudaria con workspaces remotos, virtuales o providers no locales.

4. Diferenciar dos modos de carga.

- Para archivos del workspace: usar `@archivo`.
- Para archivos externos del sistema operativo: dejar que OpenCode use su flujo nativo de adjuntos.
- No intentar convertir todos los recursos en `File`, porque el Explorer interno de VS Code no entrega blobs reales.

5. Mejorar diagnosticos.

- Loguear los tipos recibidos en `dataTransfer.types`.
- Loguear el URI original.
- Loguear la ruta relativa generada.
- Loguear cuando se re-dispara el drop sintetico.

6. Documentar el uso de `Shift`.

- En VS Code/VSCodium, arrastrar desde el Explorer puede requerir mantener `Shift`.
- Sin `Shift`, el IDE puede abrir el archivo en el editor en vez de soltarlo en la webview.

7. Explorar integracion con comandos.

- Agregar `Add to OpenCode` al menu contextual del Explorer.
- Soportar seleccion multiple.
- Usar este comando como respaldo estable cuando drag and drop no funcione o no sea intuitivo.

8. Mantener el enfoque actual.

- La mejor integracion para archivos del workspace es `@archivo`.
- Es mas natural para OpenCode que convertir artificialmente URIs de VS Code en archivos adjuntos tipo blob.

## Estado actual

La extension ya implementa un normalizador para drops internos de VS Code que:

- Lee datos del drop desde `text/uri-list`, `text/plain`, `application/vnd.code.uri-list`, `resourceurls` y `codefiles`.
- Intenta parsear payloads JSON y payloads por lineas.
- Detecta archivos dentro del workspace.
- Convierte rutas absolutas a rutas relativas.
- Deduplica rutas repetidas.
- Re-dispara drops compatibles con OpenCode usando el formato `file:ruta/relativa`.
- Para multiples archivos, dispara un drop sintetico por archivo porque el handler web de OpenCode consume un solo `file:path` por evento.
- Para URIs no `file://`, usa un fallback `postMessage` hacia la extension.
- La extension resuelve esos URIs con `vscode.workspace.fs.stat()` y `vscode.workspace.fs.readFile()` cuando son archivos.
- Si el recurso pertenece al workspace, devuelve una ruta relativa al iframe y el iframe re-dispara drops `file:ruta/relativa`.
- Registra diagnosticos de drops: tipos `DataTransfer`, payload original por MIME type, URI no local, ruta relativa generada y cada drop sintetico re-disparado.
- Expone el comando `Add to OpenCode` en el menu contextual del Explorer.
- El comando soporta seleccion multiple, resuelve recursos del workspace con `vscode.workspace.fs.stat()` y agrega menciones `@ruta/relativa` al prompt de OpenCode.
- Si OpenCode no esta listo, el comando abre la vista lateral e intenta iniciar/reusar el servidor antes de insertar las menciones.

## Riesgos

- La UI web de OpenCode puede cambiar el formato esperado para drops o menciones.
- Los tipos internos de VS Code (`codefiles`, `resourceurls`, etc.) pueden variar entre versiones o forks como VSCodium.
- Workspaces remotos o virtuales pueden no tener rutas `file://` locales.
- El flujo con `Shift` puede no ser obvio para usuarios finales.

## Proximo paso recomendado

Validar manualmente en VSCodium que un drop con `Shift` desde el Explorer interno genere una mencion por cada archivo seleccionado, incluyendo payloads `file://` locales y, si hay entorno disponible, URIs remotos o virtuales.
