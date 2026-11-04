// Ejecutar después de npm run test:unit, que genera los módulos de out/.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const bootstrap = require(path.join(root, 'out/opencodeBootstrap'));
const clipboard = require(path.join(root, 'out/opencodeClipboard'));
const promptQueue = require(path.join(root, 'out/opencodePromptQueue'));
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
function original(file) {
  const result = spawnSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function declarations(text, kind = ts.ScriptKind.TS) {
  const source = ts.createSourceFile('source', text, ts.ScriptTarget.Latest, true, kind);
  assert.equal(source.parseDiagnostics.length, 0);
  const found = {};
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      found[node.name.text] = node.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}
function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const result = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) result.push(scanner.getTokenText());
  return result;
}
const before = declarations(original('src/extension.ts'));
const after = declarations(fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8'));
const unchanged = [
  'addToOpenCodeDisposable', 'addFilesToOpenCodeDisposable', 'attachToOpenCodeDisposable', 'attachFilesToOpenCodeDisposable',
  'addRefsToOpenCode', 'attachUrisToOpenCode', 'attachFilesToOpenCode', 'getWorkspaceUriRefs', 'readAttachmentFiles',
  'getWebviewHtml', 'sendTerminalToOpenCode',
];
for (const name of unchanged) assert.deepEqual(tokens(before[name]), tokens(after[name]), name);
assert.deepEqual(tokens(before.loadSidebar.replace('function loadSidebar(', 'function loadSidebarContent(')), tokens(after.loadSidebarContent), 'loadSidebarContent preserva la carga existente');
const oldManifest = JSON.parse(original('package.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
assert.deepEqual(manifest.contributes, oldManifest.contributes);
assert.deepEqual(manifest.activationEvents, oldManifest.activationEvents);
const cases = [];
for (const platform of ['darwin', 'linux', 'win32']) {
  for (const generation of ['legacy', 'v2']) {
    const scripts = [];
    for (const source of [before, after]) {
      const code = ts.transpileModule(`module.exports = ${source.getWorkspaceBootstrapScript};`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText;
      const sandbox = {
        module: { exports: {} }, process: { platform },
        context: { workspaceState: { get: () => undefined } },
        OPENCODE_WORKSPACE_STATE_KEY: 'phase3', ...bootstrap, ...clipboard, ...promptQueue,
      };
      vm.runInNewContext(code, sandbox, { timeout: 1000 });
      const script = sandbox.module.exports('/workspace/ñ', generation);
      new vm.Script(script);
      scripts.push(declarations(script, ts.ScriptKind.JS));
    }
    for (const name of ['installVsCodeDropNormalizer', 'installTextInsertBridge', 'runEditCommand', 'installEditCommandBridge', 'installClipboardBridge']) {
      assert.deepEqual(tokens(scripts[0][name]), tokens(scripts[1][name]), `${platform}/${generation}/${name}`);
    }
    assert.ok(scripts[1].queueOpenCodePromptAction);
    assert.match(scripts[1].installAttachmentBridge, /queueOpenCodePromptAction/);
    assert.match(scripts[1].installDropPathsBridge, /queueOpenCodePromptAction/);
    assert.ok(scripts[1].captureClipboardTarget);
    assert.ok(scripts[1].restoreClipboardTarget);
    cases.push({ platform, generation, syntax: 'PASS', unchangedPhysicalDropAndEditBridges: 'PASS' });
  }
}
const result = {
  baselineRevision: revision, unchangedFunctions: unchanged,
  manifestContributesUnchanged: true, activationEventsUnchanged: true,
  generatedBootstrapCases: cases,
  scope: 'Comprobaciones de código y sintaxis, no equivalen a ejecución en esos sistemas ni a pruebas gráficas',
};
fs.writeFileSync(path.join(__dirname, 'integracion.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
