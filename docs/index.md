# Documentacion del proyecto

Documento indice para la documentación oficial del proyecto.

Revisado el 19 de julio de 2026 sobre el commit `fa782b7`, fechado el 29 de junio de 2026. Describe este repositorio, no necesariamente versiones futuras del CLI externo `opencode`.

## Lectura rapida

| Necesidad | Empezar por |
| --- | --- |
| Entender que producto es y que no es | [PRD/definicion-producto.md](PRD/definicion-producto.md) |
| Entender la arquitectura completa | [system/arquitectura.md](system/arquitectura.md) |
| Encontrar donde vive una responsabilidad | [system/mapa-codebase.md](system/mapa-codebase.md) |
| Seguir el arranque, recarga o cierre | [system/ciclo-runtime.md](system/ciclo-runtime.md) |
| Cambiar mensajes, proxy o integracion webview | [system/contratos-integracion.md](system/contratos-integracion.md) |
| Evaluar seguridad, confiabilidad o deuda | [system/riesgos-y-calidad.md](system/riesgos-y-calidad.md) |
| Preparar el entorno local | [sop/desarrollo-local.md](sop/desarrollo-local.md) |
| Validar un cambio | [sop/validacion.md](sop/validacion.md) |
| Diagnosticar un fallo | [sop/troubleshooting.md](sop/troubleshooting.md) |
| Preparar una publicacion | [sop/release-y-publicacion.md](sop/release-y-publicacion.md) |
| Revisar comportamiento y recorridos | [PRD/recorridos-y-requisitos.md](PRD/recorridos-y-requisitos.md) |
| Consultar decisiones vigentes o pendientes | [PRD/decisiones-producto.md](PRD/decisiones-producto.md) |

## Carpetas

### [`system/`](system/index.md)

Documentacion tecnica del sistema: limites, topologia, responsabilidades, runtime, protocolos, datos, seguridad, pruebas y riesgos.

### [`sop/`](sop/index.md)

Procedimientos operativos repetibles para instalar, desarrollar, validar, depurar y publicar el proyecto. Los comandos reflejan los scripts actuales, incluyendo sus limitaciones conocidas.

### [`PRD/`](PRD/index.md)

Definicion de producto, usuarios, alcance, requisitos, recorridos y decisiones. Se diferencia entre comportamiento confirmado por codigo, inferencias y decisiones que aun requieren confirmacion humana.

## Principios de mantenimiento

1. Actualizar esta documentacion en el mismo cambio que altere arquitectura, comandos, contratos, scripts o comportamiento de producto.
2. Tratar `src/extension.ts`, `package.json` y los scripts de `script/` como evidencia primaria; el README puede quedar desactualizado.
3. No presentar comportamiento del frontend o agente OpenCode como propio de este repositorio: ambos llegan desde el CLI instalado externamente.
4. Marcar como pendiente cualquier decision de producto que el codigo no pueda demostrar.
5. Mantener los SOP ejecutables y registrar de forma explicita cuando un procedimiento actual tiene prerrequisitos o fallos conocidos.

## Fuentes analizadas

- Runtime: `src/extension.ts`, `src/pathUtils.ts`.
- Pruebas: `src/pathUtils.test.ts`.
- Producto y contribuciones VS Code: `package.json`, `README.md`.
- Build y calidad: `esbuild.js`, `eslint.config.mjs`, `tsconfig.json`, `bun.lock`.
- Desarrollo y empaquetado: `.vscode/launch.json`, `.vscodeignore`, `.gitignore`.
- Release: `script/release`, `script/publish`.
- Identidad y licencia: `package.json`, `LICENSE`.
- Archivos auxiliares y assets: `sst-env.d.ts`, `images/`.
