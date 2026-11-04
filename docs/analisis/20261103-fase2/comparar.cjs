// Análisis estático local. No activa la extensión ni inicia OpenCode.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const mac = path.join(root, 'mac-version/opencode-web-vs-extension-feature-clipboard-mac');
const ts = require(path.join(root, 'node_modules/typescript'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

// Permite volver a comparar la raíz después de la extracción realizada en fase 3.
// Los JSON/diffs guardados de fase 2 siguen siendo su snapshot histórico.
function optionalScriptHelpers(name) {
  const file = path.join(root, 'src', name + '.ts');
  if (!fs.existsSync(file)) return {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const sandbox = { exports: {} };
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  return sandbox.exports;
}
const clipboardHelpers = { ...optionalScriptHelpers('opencodeClipboard'), ...optionalScriptHelpers('opencodePromptQueue') };

function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const result = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) result.push(scanner.getTokenText());
  return result;
}

function declarations(text, name, kind = ts.ScriptKind.TS) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
  if (source.parseDiagnostics.length) throw new Error(`Error de sintaxis en ${name}`);
  const functions = {};
  const variables = {};
  function visit(node) {
    const entry = () => ({
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      hash: sha(JSON.stringify(tokens(node.getText(source)))),
      text: node.getText(source),
    });
    if (ts.isFunctionDeclaration(node) && node.name) functions[node.name.text] = entry();
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables[node.name.text] = entry();
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { functions, variables };
}

function compareMaps(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().map(name => ({
    name,
    status: !a[name] ? 'solo-raiz' : !b[name] ? 'solo-mac' : a[name].hash === b[name].hash ? 'identico' : 'diferente',
    macLine: a[name]?.line,
    rootLine: b[name]?.line,
  }));
}

const sources = {};
const parsed = {};
const manifests = {};
const inventory = {};
for (const [variant, directory] of Object.entries({ mac, raiz: root })) {
  sources[variant] = fs.readFileSync(path.join(directory, 'src/extension.ts'), 'utf8');
  parsed[variant] = declarations(sources[variant], variant);
  manifests[variant] = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  inventory[variant] = {};
  for (const file of fs.readdirSync(path.join(directory, 'src')).sort()) {
    const bytes = fs.readFileSync(path.join(directory, 'src', file));
    inventory[variant][file] = { bytes: bytes.length, sha256: sha(bytes) };
  }
}

// Solo evalúa funciones que construyen strings. El JavaScript del iframe no se ejecuta.
function buildFunction(variant, name) {
  const code = ts.transpileModule(`module.exports = ${parsed[variant].functions[name].text};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const sandbox = {
    module: { exports: {} }, process: { platform: 'darwin' }, URL,
    context: { workspaceState: { get: () => undefined } },
    OPENCODE_WORKSPACE_STATE_KEY: 'phase2',
    sanitizeOpenCodeWorkspaceState: value => value,
    getOpenCodeWorkspaceStateScript: () => '/* Persistencia v2 comparada por separado. */',
    log() {}, getNonce: () => 'phase2', sidebarServerPassword: undefined,
    createOpenCodeAuthToken: () => 'placeholder',
    ...clipboardHelpers,
  };
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  return sandbox.module.exports;
}

const bridgeFunctions = {};
const wrappers = {};
for (const variant of ['mac', 'raiz']) {
  const script = buildFunction(variant, 'getWorkspaceBootstrapScript')('/phase2/workspace', 'v2');
  new vm.Script(script);
  bridgeFunctions[variant] = declarations(script, `${variant}-bootstrap.js`, ts.ScriptKind.JS).functions;
}

async function main() {
  for (const variant of ['mac', 'raiz']) {
    const html = await buildFunction(variant, 'getWebviewHtml')({ cspSource: 'vscode-webview:' }, 4096);
    const script = html.match(/<script nonce="phase2">([\s\S]*?)<\/script>/)[1];
    new vm.Script(script);
    wrappers[variant] = {
      parentKeyCapture: script.includes('parent keydown captured'),
      parentNativeDropCapture: script.includes('parent drop resolved'),
      bridgeReadyRelay: script.includes('opencode-bridge-ready'),
      workspaceStateRelay: script.includes('opencode-workspace-state'),
      validatesEventSource: script.includes('event.source'),
      validatesEventOrigin: script.includes('event.origin'),
    };
  }
  const commandIds = ['opencode.addToOpenCode', 'opencode.addFilesToOpenCode', 'opencode.attachToOpenCode', 'opencode.attachFilesToOpenCode'];
  const pick = manifest => ({
    commands: manifest.contributes.commands.filter(c => commandIds.includes(c.command)),
    activationEvents: manifest.activationEvents.filter(e => commandIds.some(id => e === `onCommand:${id}`)),
    menus: manifest.contributes.menus['explorer/context'].filter(c => commandIds.includes(c.command)),
    keybindings: manifest.contributes.keybindings.filter(c => commandIds.includes(c.command)),
  });
  const coreManifests = Object.fromEntries(['mac', 'raiz'].map(v => [v, pick(manifests[v])]));
  const clipboardBindings = manifest => manifest.contributes.keybindings.filter(c =>
    ['pasteIntoOpenCode', 'copyInOpenCode', 'cutInOpenCode', 'selectAllInOpenCode', 'undoInOpenCode', 'redoInOpenCode']
      .some(name => c.command === `opencode.${name}`));
  const sharedFiles = Object.fromEntries(
    ['.vscodeignore', '.gitignore', 'tsconfig.json', 'esbuild.js', 'bun.lock', 'LICENSE', 'src/pathUtils.ts', 'src/pathUtils.test.ts'].map(file => {
      const a = fs.readFileSync(path.join(mac, file));
      const b = fs.readFileSync(path.join(root, file));
      return [file, { identical: a.equals(b), macSha256: sha(a), rootSha256: sha(b) }];
    }),
  );
  const handlerNames = ['addToOpenCodeDisposable', 'addFilesToOpenCodeDisposable', 'attachToOpenCodeDisposable', 'attachFilesToOpenCodeDisposable'];
  const result = {
    date: '2026-11-03', method: 'AST TypeScript y tokens sin trivia; literales conservados; scripts generados sin ejecutar su DOM',
    versions: Object.fromEntries(['mac', 'raiz'].map(v => [v, manifests[v].version])),
    inventory,
    extensionFunctions: compareMaps(parsed.mac.functions, parsed.raiz.functions),
    commandHandlers: compareMaps(
      Object.fromEntries(handlerNames.map(n => [n, parsed.mac.variables[n]])),
      Object.fromEntries(handlerNames.map(n => [n, parsed.raiz.variables[n]])),
    ),
    coreManifestIdentical: JSON.stringify(coreManifests.mac) === JSON.stringify(coreManifests.raiz),
    coreManifests,
    clipboardBindingsIdentical: JSON.stringify(clipboardBindings(manifests.mac)) === JSON.stringify(clipboardBindings(manifests.raiz)),
    sharedFiles,
    embeddedBridgeFunctions: compareMaps(bridgeFunctions.mac, bridgeFunctions.raiz),
    wrappers,
    syntax: 'Ambos bootstrap y ambos wrappers válidos en node:vm; no equivale a prueba de navegador',
  };
  fs.writeFileSync(path.join(__dirname, 'comparacion.json'), JSON.stringify(result, null, 2) + '\n');
  for (const file of ['src/extension.ts', 'package.json', 'README.md']) {
    const diff = spawnSync('git', ['-c', 'color.ui=false', 'diff', '--no-index', '--no-ext-diff', '--', path.join(mac, file), path.join(root, file)], { encoding: 'utf8' });
    if (![0, 1].includes(diff.status)) throw new Error(diff.stderr || 'Falló git diff');
    fs.writeFileSync(path.join(__dirname, file.replaceAll('/', '-') + '.diff'), diff.stdout);
  }
  console.log(JSON.stringify({
    coreManifestIdentical: result.coreManifestIdentical,
    commandHandlers: result.commandHandlers,
    changedBridgeFunctions: result.embeddedBridgeFunctions.filter(f => f.status !== 'identico'),
    wrappers,
  }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
