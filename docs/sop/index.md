# Procedimientos operativos

| Procedimiento | Cuando usarlo |
| --- | --- |
| [desarrollo-local.md](desarrollo-local.md) | Preparar un checkout, compilar en watch y ejecutar Extension Development Host. |
| [validacion.md](validacion.md) | Verificar cambios de codigo, manifest, runtime o documentacion. |
| [troubleshooting.md](troubleshooting.md) | Diagnosticar CLI faltante, startup, proxy, archivos, shortcuts o workspace. |
| [release-y-publicacion.md](release-y-publicacion.md) | Auditar, taggear, empaquetar y publicar una version. |
| [cambios-en-integracion.md](cambios-en-integracion.md) | Modificar comandos, mensajes, endpoints o bridges sin romper contratos. |

## Convenciones

- Ejecutar comandos desde la raiz del repositorio.
- Usar Bun porque `bun.lock` es el lockfile canonico actual.
- No asumir que `bun run test` funciona: consultar [validacion.md](validacion.md).
- No publicar hasta resolver las precondiciones documentadas en [release-y-publicacion.md](release-y-publicacion.md).
- Registrar cualquier cambio de contrato tambien en `docs/system/contratos-integracion.md`.
