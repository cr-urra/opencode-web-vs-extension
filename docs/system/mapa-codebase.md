# Mapa del codebase

## Resumen

El proyecto es una extension de VS Code pequena y altamente concentrada. Casi todo el runtime vive dentro del cierre de `activate()` en [`src/extension.ts`](../../src/extension.ts#L15-L960). No hay backend de OpenCode ni frontend React en este repositorio; ambos son provistos por el ejecutable externo `opencode`.

## Inventario

| Ruta | Responsabilidad | Observaciones |
| --- | --- | --- |
| `src/extension.ts` | Activacion, comandos, proceso hijo, proxy HTTP/WebSocket, webview, scripts inyectados, clipboard, archivos y logs. | 960 lineas; la mayoria de funciones son cierres no exportados y no tienen pruebas aisladas. |
| `src/pathUtils.ts` | Calcula el ancestro comun de carpetas de workspace en POSIX, Windows y UNC. | Unica unidad de dominio exportada aparte de `activate`/`deactivate`. |
| `src/pathUtils.test.ts` | Ocho pruebas de `getCommonParentPath`. | Usa `node:test`; no cubre el runtime de la extension. |
| `package.json` | Identidad, compatibilidad VS Code, comandos, vistas, menus, shortcuts, scripts y dependencias de desarrollo. | Es tambien el contrato publico de la extension. |
| `README.md` | Descripcion publica, features, atajos y requisitos del usuario. | Hay diferencias de nombres respecto del manifest. |
| `esbuild.js` | Bundling CommonJS de `src/extension.ts` a `dist/extension.js`. | Desarrollo genera sourcemap; produccion minifica. |
| `tsconfig.json` | Type-check estricto ES2022/Node16 para `src/**/*.ts`. | Tambien se reutiliza para emitir pruebas a `out/`. |
| `eslint.config.mjs` | Lint TypeScript. | Solo reglas en nivel warning; no es un gate estricto. |
| `bun.lock` | Resolucion de dependencias de desarrollo. | El nombre raiz registrado, `opencode-agent`, no coincide con `package.json`. |
| `.vscode/launch.json` | Lanza Extension Development Host. | No tiene `preLaunchTask`; requiere build o watcher previo. |
| `.vscodeignore` | Excluye fuentes, tooling y docs del VSIX. | El artefacto publicado contiene el bundle, no `src/` ni `docs/`. |
| `.gitignore` | Excluye dependencias, builds, VSIX, logs, entorno y temporales. | Permite un futuro `.env.example`, hoy inexistente. |
| `script/release` | Calcula y publica un tag `vscode-vX.Y.Z`. | Requiere tags previos y no valida build ni working tree. |
| `script/publish` | Empaqueta y publica en VS Marketplace y Open VSX. | Depende de `vsce` global, `npx ovsx` y credenciales externas. |
| `images/icon.svg` | Icono monocromo de Activity Bar. | Referenciado por `package.json`. |
| `images/icon.png` | Icono de Marketplace. | Referenciado por `package.json`. |
| `images/button-light.svg`, `images/button-dark.svg` | Assets heredados. | No tienen referencias en codigo, manifest o README. |
| `sst-env.d.ts` | Declaracion autogenerada de SST. | Huerfana: no hay SST en el proyecto y queda fuera del `tsconfig`. |
| `LICENSE` | Texto completo de GPL-3.0. | Contradice el valor `MIT` de `package.json`. |

## Deriva entre README, manifest y runtime

| Tema | README | Evidencia del runtime/manifest |
| --- | --- | --- |
| Conexion a servidor | Dice “starts or connects”. | El build fija `EXPERIMENTAL_OPENCODE_SERVER = ""`; no hay setting para conectarse. |
| Nombre de acciones | Usa principalmente “Send to OpenCode”. | Los comandos publican “Add to OpenCode”; los keybindings vuelven a usar “Send”. |
| VSCodium | Declara soporte. | Manifest description/keywords tambien lo reclaman, pero no existe matriz o test especifico; `engines.vscode` solo limita la API VS Code. |
| Ownership | Atribuye OpenCode a sst-dev y la publicacion a UWEsmith. | No aclara autoria de la extension ni por que `repository` apunta a upstream mientras el remoto real es otro. |

## Salidas generadas

| Ruta | Productor | Uso |
| --- | --- | --- |
| `node_modules/` | `bun install` | Dependencias de desarrollo; ignorada por Git y VSIX. |
| `dist/extension.js` | `bun run compile` o `bun run package` | Entry point real de la extension. |
| `dist/extension.js.map` | Build no productivo | Debug local; excluido del VSIX. |
| `out/*.js` y `out/*.js.map` | `bun run compile-tests` o `test:unit` | JavaScript temporal para pruebas. |
| `dist/opencode.vsix` | `script/publish` | Paquete publicado; sobrescrito en cada release. |

No existe un comando `clean`; archivos obsoletos pueden permanecer en `dist/` u `out/`.

## Lo que no vive aqui

- Codigo del CLI, servidor, agente, modelos o proveedores OpenCode.
- Codigo fuente del frontend que se muestra en el iframe.
- Persistencia de sesiones o conversaciones de OpenCode.
- Configuracion del usuario de OpenCode.
- CI/CD, changelog, guia de contribucion o matriz de compatibilidad.
- Telemetria o analytics propios de la extension.

## Puntos de cambio frecuentes

| Cambio | Archivos principales | Documentacion asociada |
| --- | --- | --- |
| Agregar comando o shortcut | `package.json`, `src/extension.ts`, `README.md` | `contratos-integracion.md`, PRD y SOP de validacion. |
| Cambiar arranque o proceso | `src/extension.ts` | `ciclo-runtime.md`, `riesgos-y-calidad.md`. |
| Cambiar archivos/attachments | `src/extension.ts` | `contratos-integracion.md`, recorridos de PRD. |
| Cambiar build/test | `package.json`, `esbuild.js`, `tsconfig.json`, ESLint | SOP de desarrollo y validacion. |
| Cambiar release | `script/release`, `script/publish`, `package.json` | SOP de release. |
| Cambiar soporte multi-root | `src/pathUtils.ts`, `src/extension.ts`, pruebas | Arquitectura, ciclo runtime y decisiones de producto. |
