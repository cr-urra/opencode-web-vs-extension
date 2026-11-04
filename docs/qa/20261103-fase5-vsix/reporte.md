# Fase 5: generación y revisión local del VSIX

Fecha: 3 de noviembre de 2026, America/Santiago.

**VSIX generado y contenido comprobado.** Se conserva una observación de licencia preexistente: package.json declara MIT y el archivo LICENSE contiene GPLv3. No se modificaron esos dos valores ni se decidió una nueva licencia. El paquete se entrega para uso y prueba local; no se publicó ni se instaló en esta fase.

## Artefacto

- [opencode-web-for-ide-1.14.43-fase5.vsix](../../../dist/opencode-web-for-ide-1.14.43-fase5.vsix): 33.879 bytes, 8 entradas ZIP.
- Identidad: `UWEsmith.opencode-web-for-ide`, versión `1.14.43`, paquete universal.
- SHA-256 del VSIX: `8d9e2b3022b2d07c25aec15acb854ffc7ae3557a38e5950d691d655e2d6cf557`.
- [Archivo de checksum](../../../dist/opencode-web-for-ide-1.14.43-fase5.vsix.sha256).
- SHA-256 del bundle incluido: `7ac05abfc7ae4a638bd18fe6822ad34e133f253b24aec178e1e4ec613cc11f25`, idéntico al [validado al cerrar fase 4](../20261103-restauracion-activa/reporte.md).

La versión no se incrementó: el sufijo fase5 identifica el archivo de prueba y no cambia la identidad instalada de la extensión.

## Ajustes de empaquetado

La configuración anterior no excluía completamente docs/ y mac-version/. Se sustituyó [.vscodeignore](../../../.vscodeignore) por una lista explícita que permite únicamente los seis archivos de producto. Así se excluyen informes, capturas, fixtures, configuraciones del editor, fuentes, mapas, pruebas, dependencias, copias de referencia y otros archivos locales.

Bun no estaba disponible en el entorno. Los scripts `vscode:prepublish` y `package` de [package.json](../../../package.json) ahora usan npm, que estaba instalado. No se añadieron dependencias ni se modificaron comandos, atajos, activaciones, engine, publisher o versión durante esta fase. El prepublish del empaquetador vuelve a ejecutar tipos, lint y build productivo.

El README conserva el alcance de compatibilidad comprobado y omite los enlaces a informes internos que no se distribuyen. En el primer empaquetado VSCE convertía esos enlaces usando el repositorio upstream declarado; se retiraron y se volvió a generar el archivo. El VSIX final contiene el README exactamente igual al archivo fuente. El [diff del primer intento](logs/readme-vsix.diff) se conserva como evidencia del ajuste; no describe el paquete final.

Se utilizó `@vscode/vsce` **4.1.0**, consultado y descargado desde el registro oficial de npm con caché temporal bajo /private/tmp. La versión quedó fijada al ejecutar el empaquetado y no se instaló como dependencia del proyecto ni de forma global.

## Contenido comprobado

La [lista previa de VSCE](logs/contenido-previsto.txt), el [árbol del empaquetado](logs/empaquetado.txt) y la [inspección del ZIP final](logs/inspeccion.json) concuerdan. VSCE normaliza los nombres del README y la licencia dentro del archivo:

```text
[Content_Types].xml
extension.vsixmanifest
extension/LICENSE.txt
extension/package.json
extension/readme.md
extension/dist/extension.js
extension/images/icon.png
extension/images/icon.svg
```

Se comprobó que no hay entradas adicionales y que la integridad CRC del ZIP es correcta. Los seis archivos de producto coinciden byte a byte con sus fuentes actuales. El manifiesto JSON coincide íntegramente con package.json; la identidad y versión del manifiesto VSIX coinciden también. El bundle coincide tanto con el archivo actual de dist/ como con el hash de fase 4. Los archivos adicionales son exclusivamente los dos metadatos estándar de VSIX.

## Verificación automática

Esta fase revisa el artefacto con logs y lectura del ZIP; no introduce nuevos escenarios gráficos.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Suite unitaria | 59/59 PASS | [Log](logs/unitarios.txt) |
| TypeScript, lint y build productivo | PASS; 0 errores de lint y las mismas 754 advertencias previas | [Build](logs/build.txt) |
| Prepublish mediante npm | PASS; repite tipos/lint/build y conserva el bundle validado | [Empaquetado](logs/empaquetado.txt) |
| VSCE fijado a 4.1.0 | PASS | [Versión](logs/packager.txt) |
| Lista exacta de archivos | PASS, seis archivos de producto y dos metadatos | [Listado](logs/contenido-vsix.txt) |
| Integridad ZIP, manifiestos y archivos fuente | PASS | [Inspección](logs/inspeccion.json) |
| Bundle igual al de fase 4 | PASS | [Resultados y hashes](resultados.json) |
| Licencia | Observación preexistente MIT/GPLv3, conservada | package.json y LICENSE del ZIP, con sus hashes en resultados.json |

La evidencia gráfica previa corresponde a OpenCode 2.2.5 en macOS/VSCodium, ejecutando el mismo bundle desde Extension Development Host. En esta fase no se realizó una instalación del VSIX ni se extrapoló compatibilidad gráfica a otros sistemas o versiones. El arrastre físico conserva su exclusión del alcance; las pruebas de archivos se realizaron mediante comandos de la extensión.

## Reproducción

```sh
npm run test:unit
npm run package
npm exec --yes --package=@vscode/vsce@4.1.0 --cache /private/tmp/opencode-vsix-npm-cache -- vsce package --no-dependencies --skip-license -o dist/opencode-web-for-ide-1.14.43-fase5.vsix
```

El empaquetado puede producir un checksum de archivo distinto en otra ejecución por los metadatos y tiempos del ZIP. El control de equivalencia funcional es el hash del bundle y la inspección de contenido. El checksum entregado identifica exactamente este VSIX.

La fase 5 de generación y revisión local queda completada con la observación de licencia indicada. Publicación e instalación no se realizaron. No se ejecutó script/publish ni vsce publish.
