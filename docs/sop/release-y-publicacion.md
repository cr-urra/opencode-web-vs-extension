# SOP: release y publicacion

## Estado del proceso actual

Los scripts existentes publican tags `vscode-vX.Y.Z`, empaquetan con VSCE y publican primero en VS Marketplace y despues en Open VSX. En el estado revisado no existe ningun tag con ese formato: ambos fallan antes de taggear, empaquetar o publicar, aunque `script/release` primero ejecuta `git fetch --force --tags`. El flujo tampoco es reproducible ni seguro para ejecutar sin una auditoria previa.

## Bloqueadores que deben resolverse

1. `package.json` declara MIT, pero `LICENSE` contiene GPL-3.0.
2. El repository URL del manifest apunta a `anomalyco/opencode`, no a este repositorio.
3. README explica que sst-dev es autor de OpenCode y UWEsmith publica la extension, pero no aclara la autoria/ownership de esta extension ni la discrepancia con repository URL/remoto real.
4. `vsce` no esta declarado como dependencia; `npx ovsx` no fija version.
5. El script requiere un tag previo y no puede bootstrappear una primera release.
6. `script/release` no usa `set -euo pipefail`, no verifica rama/working tree/build y hace `git push --tags`.
7. El tag no sincroniza automaticamente `package.json.version`.
8. No hay CI, artifact checks, checksum, provenance ni rollback entre marketplaces.

No publicar hasta que licencia y ownership sean confirmados por una persona responsable.

## Preflight manual

```bash
git status --short
git log --oneline -10
git tag --sort=-version:refname
bun install --frozen-lockfile
bun run check-types
bun run lint
bun run test:unit
bun run package
```

Luego:

1. Confirmar version objetivo y que coincida con manifest/tag.
2. Revisar cambios desde la ultima release, no solo el ultimo commit.
3. Ejecutar smoke test en los SO soportados.
4. Revisar `docs/PRD/decisiones-producto.md` por decisiones abiertas que bloqueen distribucion.
5. Confirmar credenciales de Marketplace y `OPENVSX_TOKEN` sin escribirlas en archivos.

## Comportamiento de `script/release`

```bash
./script/release
./script/release --minor
```

El script:

1. Hace fetch forzado de tags.
2. Elige el ultimo por fecha de commit, no por semver.
3. Incrementa patch o minor.
4. Crea un tag lightweight.
5. Empuja todos los tags locales.

En el estado revisado termina con `No tags found`. Para una primera release, un maintainer debe resolver antes licencia, ownership y version; luego aprobar y crear un primer tag `vscode-vX.Y.Z` coherente con el manifest mediante un procedimiento revisado. El script actual no lo hace. No ejecutarlo como automatismo ciego.

## Comportamiento de `script/publish`

```bash
./script/publish
```

Internamente:

```text
vsce package ... -o dist/opencode.vsix <version>
vsce publish --packagePath dist/opencode.vsix
npx ovsx publish dist/opencode.vsix -p "$OPENVSX_TOKEN"
```

En el estado revisado tambien termina con `No tags found`. El hook `vscode:prepublish` ejecuta build productivo durante el package. `--skip-license` evita validacion de licencia, pero no resuelve la contradiccion legal.

## Inspeccion de VSIX

Antes de publicar:

1. Listar contenido del VSIX con VSCE o herramienta ZIP.
2. Confirmar bundle, manifest, README, LICENSE e iconos.
3. Confirmar ausencia de `.env`, tokens, `node_modules`, `src`, docs, scripts y sourcemaps.
4. Instalar el VSIX en un perfil limpio de VS Code. No alcanza con `--force` sobre un perfil que ya tiene la extension de Marketplace instalada bajo otro publisher (`sst-dev` vs `UWEsmith`): ambas coexisten y compiten por el mismo panel en vez de que una reemplace a la otra. Ver "Dos versiones instaladas al mismo tiempo" en `docs/sop/troubleshooting.md` para el sintoma exacto y el fix.
5. Ejecutar smoke test con la version soportada del CLI.
6. Guardar hash/checksum y version de herramientas usadas.

## Publicacion y post-check

1. Publicar el mismo VSIX inspeccionado, no reconstruir entre marketplaces.
2. Verificar pagina/version/metadata en VS Marketplace.
3. Verificar pagina/version/metadata en Open VSX.
4. Instalar desde cada marketplace en un perfil limpio.
5. Comprobar startup, referencias, attachment y cierre.
6. Registrar si un marketplace publico y el otro fallo; hoy el script deja release parcial.

## Rollback

No hay rollback automatizado. Ante un defecto:

1. Detener cualquier publicacion restante.
2. Documentar marketplaces y versiones afectadas.
3. Despublicar solo si la politica del marketplace y el impacto lo justifican.
4. Preparar una version patch nueva; no sobrescribir un artefacto ya distribuido.
5. Mantener el tag y trazabilidad del artefacto defectuoso.
