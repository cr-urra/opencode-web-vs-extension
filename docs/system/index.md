# Sistema

Documentacion de referencia para comprender y cambiar la implementacion.

| Documento | Contenido |
| --- | --- |
| [mapa-codebase.md](mapa-codebase.md) | Inventario de archivos, responsabilidades, codigo generado y limites del repositorio. |
| [arquitectura.md](arquitectura.md) | Contexto, contenedores, componentes, datos y decisiones arquitectonicas observadas. |
| [ciclo-runtime.md](ciclo-runtime.md) | Estados y secuencias de activacion, arranque, proxy, webview, cambios de workspace y cierre. |
| [contratos-integracion.md](contratos-integracion.md) | Comandos, endpoints, mensajes, formatos de archivos y dependencias privadas de OpenCode. |
| [riesgos-y-calidad.md](riesgos-y-calidad.md) | Trust boundaries, riesgos priorizados, observabilidad, pruebas y deuda tecnica. |

## Orden recomendado

1. [mapa-codebase.md](mapa-codebase.md) para ubicar responsabilidades.
2. [arquitectura.md](arquitectura.md) para entender los limites y el flujo principal.
3. [ciclo-runtime.md](ciclo-runtime.md) y [contratos-integracion.md](contratos-integracion.md) antes de tocar `src/extension.ts`.
4. [riesgos-y-calidad.md](riesgos-y-calidad.md) antes de aprobar un cambio de seguridad, procesos, archivos o webview.
