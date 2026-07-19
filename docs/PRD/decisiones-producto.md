# Decisiones de producto

## Como leer este registro

- **Implementada:** comportamiento vigente demostrado por codigo.
- **Inferida:** intencion probable, no aprobacion formal.
- **Pendiente:** requiere decision de producto/seguridad/legal.

## Decisiones implementadas

| ID | Decision vigente | Consecuencia |
| --- | --- | --- |
| PD-01 | El producto es una integracion no oficial que reutiliza el frontend OpenCode. | La extension prioriza adaptadores y depende de upstream. |
| PD-02 | La experiencia vive en una vista dedicada de Activity Bar. | No hay editor tab ni panel propio. |
| PD-03 | La extension se activa y abre automaticamente al startup. | Menos setup; comportamiento intrusivo no configurable. |
| PD-04 | Se lanza `opencode serve` automaticamente desde PATH. | Zero-config; no hay selector de ejecutable/version. |
| PD-05 | Multi-root usa un ancestro comun como `cwd` cuando existe; drives Windows distintos quedan sin root explicito. | Simplifica un servidor; puede ampliar alcance o degradarse sin root. |
| PD-06 | Contexto se anexa si hay carpetas; project seeding exige ademas root comun. | Expone paths absolutos, puede mezclar contexto y se degrada sin root. |
| PD-07 | Referencias y attachments son conceptos separados. | Source context usa paths; binarios usan browser `File`. |
| PD-08 | Pickers nativos complementan drag/drop y Explorer. | Mayor confiabilidad cross-platform. |
| PD-09 | El bridge especial de edicion es macOS-only. | Windows/Linux conservan comportamiento nativo. |
| PD-10 | No hay estrategia explicita de feedback: muchas condiciones se registran, otros rechazos pueden propagarse/perderse y no hay toasts propios consistentes. | UI minima; baja discoverability y recuperacion. |
| PD-11 | El proceso queda vivo al ocultar la vista. | Reapertura rapida; consume recursos y recrea iframe al mostrarse. |
| PD-12 | Attachments seleccionados pueden estar fuera del workspace. | Flexibilidad; frontera de datos mas amplia. |

## Intenciones inferidas, no decisiones formales

| ID | Inferencia | Evidencia | Validacion necesaria |
| --- | --- | --- | --- |
| PI-01 | “Send/Add” llena el composer y no envia una conversacion. | Solo append-prompt/drop; no hay submit. | Confirmar wording esperado. |
| PI-02 | Se busca casi cero UI propia para preservar experiencia upstream. | Wrapper solo contiene iframe. | Confirmar si onboarding/status deben seguir externos. |
| PI-03 | El publico principal son power users de teclado. | Atajos globales y comandos. | Validar conflictos y uso real. |
| PI-04 | La extension apunta principalmente a desktop local. | spawn, loopback, fsPath, Node APIs. | Declarar soporte remote/web. |
| PI-05 | Rutas externas son aceptables solo para attachments, no referencias. | Handlers tienen fronteras distintas. | Confirmar politica de seguridad. |

## Decisiones pendientes criticas

| ID | Pregunta | Opciones principales | Owner sugerido |
| --- | --- | --- | --- |
| PO-01 | Cual es la licencia real: MIT o GPL-3.0? | Corregir manifest o reemplazar LICENSE con autorizacion. | Legal/maintainer. |
| PO-02 | Quien es autor/owner y cual repository URL corresponde? | Upstream, fork independiente o atribucion dual clara. | Maintainer. |
| PO-03 | Se mantiene auto-open/auto-start? | Siempre, opt-out, opt-in o primer uso. | Producto. |
| PO-04 | Cual es la politica segura de multi-root? | Primer folder, seleccion, proyecto por folder, ancestro con guardrails. | Producto/arquitectura/seguridad. |
| PO-05 | Que versiones OpenCode se soportan? | Pin exacto, rango probado o latest con deteccion. | Producto/ingenieria. |
| PO-06 | External server sera feature publica? | Remover branch, setting local o soporte completo TLS/auth. | Producto/arquitectura. |
| PO-07 | Que workspaces remotos/virtuales se soportan? | Soporte formal, experimental o rechazo explicito. | Producto. |
| PO-08 | Que limites de attachment aplican? | Por archivo, cantidad, total y tipos. | Producto/performance/security. |
| PO-09 | Puede adjuntarse fuera del workspace? | Siempre, confirmacion o prohibido. | Producto/security. |
| PO-10 | Que operaciones requieren feedback visible? | Solo errores, progreso, success o status persistente. | UX/producto. |
| PO-11 | Clipboard requiere accion/consentimiento? | Puente transparente, capability por sesion o solo comandos. | Security/producto. |
| PO-12 | Workspace no confiable puede lanzar CLI? | Bloquear, pedir confirmacion o limitar capacidades. | Security/producto. |

## Decisiones pendientes de UX

1. Renombrar `Add Filepath to Terminal` para reflejar append al prompt.
2. Unificar “Add”, “Send”, “Attach” e “Insert At-Mentioned”.
3. Definir si comandos macOS-only deben ocultarse en otros SO.
4. Definir retry/restart/show logs en la pantalla de error.
5. Definir si reabrir sidebar debe preservar iframe sin reload.
6. Definir manejo de seleccion que termina en columna cero.
7. Definir directorios como referencias y basenames duplicados.

## Decisiones pendientes de operacion

1. Versiones de Bun/Node y package manager declarados.
2. CI, matriz de SO y suite Extension Host.
3. Herramientas de publish fijadas y estrategia de release parcial.
4. Version de manifest sincronizada con tags.
5. Politica de logs y privacidad.
6. Eliminacion o formalizacion de `sst-env.d.ts` y assets sin uso.

## Regla de cierre

Al resolver una decision pendiente:

1. Registrar fecha, owner y razon en esta tabla o en un ADR tecnico enlazado.
2. Actualizar requisitos/recorridos afectados.
3. Implementar tests y migracion si hay comportamiento distribuido.
4. Actualizar README, manifest y documentacion system/SOP en el mismo cambio.
