const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const source = ts.createSourceFile('extension.ts', fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
let declaration;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadSidebar') declaration = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
const code = ts.transpileModule(`let sidebarLoading; ${declaration}; module.exports = loadSidebar;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
async function main() {
  let calls = 0;
  let release;
  const sandbox = { module: { exports: {} }, loadSidebarContent() { calls++; return new Promise(resolve => { release = resolve; }); } };
  vm.runInNewContext(code, sandbox);
  const load = sandbox.module.exports;
  const first = load({});
  const second = load({});
  assert.equal(calls, 1);
  let completed = false;
  second.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  release();
  await Promise.all([first, second]);
  const third = load({});
  assert.equal(calls, 2);
  release();
  await third;
  sandbox.loadSidebarContent = async () => { throw new Error('QA startup failure'); };
  await assert.rejects(load({}), /QA startup failure/);
  sandbox.loadSidebarContent = async () => { calls++; };
  await load({});
  assert.equal(calls, 3);
  console.log('PASS: concurrent loads share one pending startup and await completion.');
  console.log('PASS: a completed load allows a subsequent reload.');
  console.log('PASS: a rejected load releases the gate and allows retry.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
