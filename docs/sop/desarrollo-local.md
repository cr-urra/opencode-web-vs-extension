# SOP: desarrollo local

## Objetivo

Instalar dependencias, generar el bundle y ejecutar la extension en un Extension Development Host.

## Prerrequisitos

- VS Code 1.94 o posterior segun `engines`. README y manifest reclaman VSCodium, pero no hay constraint ni matriz VSCodium especifica.
- Bun y Node.js. El proyecto no fija actualmente sus versiones.
- `opencode` instalado y visible en el `PATH` heredado por VS Code.
- Git.

Verificar:

```bash
bun --version
node --version
opencode --version
code --version
```

En macOS, una app lanzada desde Finder/Dock puede heredar un `PATH` distinto al shell. Abrir VS Code desde una terminal es una prueba util cuando `opencode` no se encuentra.

## Preparacion inicial

```bash
bun install --frozen-lockfile
bun run check-types
bun run test:unit
bun run compile
```

Resultados esperados:

- Dependencias en `node_modules/`.
- Pruebas compiladas en `out/`.
- Bundle en `dist/extension.js`.
- Sourcemap de desarrollo en `dist/extension.js.map`.

## Modo watch

El proyecto no tiene un script combinado. Ejecutar en terminales separadas:

```bash
bun run watch:tsc
```

```bash
bun run watch:esbuild
```

Despues iniciar la configuracion `Run Extension` de `.vscode/launch.json` con F5. No hay `preLaunchTask`; si `dist/extension.js` no existe, el host no puede cargar el entry point.

## Smoke test manual

1. Abrir una carpeta de prueba, no un repositorio sensible.
2. Confirmar que aparece el contenedor OpenCode y que se abre automaticamente.
3. Abrir `View > Output` y seleccionar `OpenCode`.
4. Confirmar logs de raiz, proceso ready y proxy.
5. Probar `Add Filepath to Terminal` con y sin seleccion.
6. Probar `Add to OpenCode` desde editor y seleccion multiple de Explorer.
7. Probar `Attach to OpenCode` con imagen/PDF pequeno.
8. Probar ocultar/mostrar la barra lateral y observar si se recrea el iframe.
9. En macOS, probar copy/cut/paste/select all/undo/redo dentro del composer. Escenarios detallados (incluyendo el caso de paste que falla solo despues de unos segundos de espera) en `docs/sop/validacion.md`, seccion "Clipboard y drag-and-drop en macOS".
10. Cerrar el Extension Development Host y comprobar que no quede un `opencode serve` huerfano.

## Build productivo

```bash
bun run package
```

Ejecuta type-check, lint y esbuild productivo. El bundle queda minificado y sin sourcemap. El lint actual solo produce warnings, por lo que su inclusion no garantiza cero hallazgos.

## Limpieza

No existe script `clean`. Si se necesita una reconstruccion limpia, eliminar manualmente solo outputs generados `dist/` y `out/`, luego volver a ejecutar build. No eliminar archivos ajenos o cambios no revisados.

## Restricciones del entorno actual

- No hay version de Bun/Node declarada en `package.json`.
- El CLI OpenCode tampoco esta fijado; registrar la version usada al reportar bugs.
- Remote SSH, Dev Containers, WSL, Codespaces, VS Code web y workspaces virtuales no tienen soporte verificado.
