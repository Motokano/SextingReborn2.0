import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parse = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const unwrap = node => node && ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
const fail = message => { throw new Error('[scene architecture] ' + message); };

/** Entry grammar is deliberately a whitelist: only ordered lifecycle calls. */
export function checkEntrySource(source, modules) {
  const sf = parse('scene-app.js', source);
  if (sf.parseDiagnostics.length) fail('入口存在语法错误');
  if (sf.statements.length !== 1 || !ts.isExpressionStatement(sf.statements[0])) fail('入口只能包含一个接线闭包');
  const call = sf.statements[0].expression;
  if (!ts.isCallExpression(call) || call.arguments.length !== 1 || call.arguments[0].getText(sf) !== 'window') fail('入口必须显式使用 window');
  const fn = unwrap(call.expression);
  if (!ts.isFunctionExpression(fn) || fn.asteriskToken || fn.modifiers?.length || fn.parameters.length !== 1 || fn.parameters[0].getText(sf) !== 'window') fail('入口必须使用普通同步函数，不能使用动态执行或自启动业务函数');
  const expected = ['initialize', 'bind'].flatMap(phase => modules.map(m => `window.${m.global}.${phase}`));
  if (fn.body.statements.length !== expected.length) fail('入口只允许模块初始化和接线，禁止新增规则、状态、回调、条件或循环');
  fn.body.statements.forEach((statement, i) => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) fail('入口禁止实际实现；请放入职责所属模块');
    const expression = statement.expression;
    if (expression.arguments.length || expression.expression.getText(sf) !== expected[i]) fail(`接线次序或调用不合法：${statement.getText(sf)}`);
  });
  return true;
}

export function checkScriptOrder(html, modules, label) {
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)];
  const scripts = tags.map(m => m[1].replace(/^\.\.\//, '').split('?')[0]);
  const protectedFiles = new Set(['js/scene-app.js', 'js/bootstrap.js', ...modules.map(m=>m.file)]);
  for (let i=0;i<tags.length;i++) if (protectedFiles.has(scripts[i])) {
    const tag = tags[i][0];
    if (/\s(?:async|defer|nomodule)(?:\s|=|>)/i.test(tag) || /\stype\s*=/i.test(tag)) fail(label + ': 入口链必须按顺序同步加载普通脚本：' + scripts[i]);
  }
  const entry = scripts.indexOf('js/scene-app.js');
  if (entry < 0 || scripts.lastIndexOf('js/scene-app.js') !== entry) fail(label + ': 入口必须加载一次');
  for (const module of modules) {
    const i = scripts.indexOf(module.file);
    if (i < 0 || i >= entry || scripts.lastIndexOf(module.file) !== i) fail(label + ': 模块须在入口前且只加载一次：' + module.file);
  }
  const bootstrap = scripts.indexOf('js/bootstrap.js');
  if (bootstrap <= entry) fail(label + ': bootstrap 必须在接线后启动');
}

export function checkCompositionModule(source, module) {
  if (!['SceneStartup', 'ScenePublicApi'].includes(module.global)) return;
  const sf = parse(module.file, source);
  const forbidden = new Set(['eval', 'Function', 'setState', 'saveNow', 'runAtomic', 'runAtomicFor', 'takeItemFromContainer', 'putItemIntoDefaultContainer', 'consumeQiLi', 'consumeDiqi', 'applyCombatDestroy', 'runPipeline']);
  function visit(node) {
    if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && (node.asteriskToken || node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))) fail(module.file + ': 接线生命周期必须同步声明');
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const left=node.left.getText(sf), right=node.right.getText(sf);
      const interfaceExport=left==='window.'+module.global && ts.isObjectLiteralExpression(node.right);
      const compatibilityRoot=(left==='window.SceneApp' && right==='window.SceneApp || {}') || (left==='window.SceneCtx.actions' && right==='window.SceneCtx.actions || {}');
      const forwarding=/^window\.(SceneApp|SceneCtx\.actions)\.[A-Za-z_]+$/.test(left) && (ts.isPropertyAccessExpression(node.right) || (ts.isCallExpression(node.right) && /\.legacy[A-Za-z]+\(\)$/.test(right)));
      if (node.operatorToken.kind!==ts.SyntaxKind.EqualsToken || !(interfaceExport || compatibilityRoot || forwarding)) fail(module.file + ': 接线模块禁止写入玩法状态：'+left);
    }
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) if ([ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator)) fail(module.file+': 接线模块禁止递增状态');
    if (ts.isDeleteExpression(node)) fail(module.file+': 接线模块禁止删除状态');
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node) || ts.isNewExpression(node)) fail(module.file + ': 接线模块不允许承载业务控制流程');
    if (ts.isCallExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(sf);
      if (forbidden.has(name)) fail(module.file + ': 接线模块禁止直接执行业务操作 ' + name);
      const callee=unwrap(node.expression);
      const key=ts.isPropertyAccessExpression(callee) && ts.isCallExpression(callee.expression) ? '@promise.'+callee.name.text : callee.getText(sf);
      if (!ts.isFunctionExpression(callee) && !(module.compositionCalls||[]).includes(key)) fail(module.file+': 新接线调用须登记并检查归属 '+key);
    }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken].includes(node.operatorToken.kind)) fail(module.file + ': 接线模块禁止业务公式');
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

export function checkRepository() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/architecture/scene-modules.json'), 'utf8'));
  const modules = manifest.modules;
  checkEntrySource(fs.readFileSync(path.join(root, 'js/scene-app.js'), 'utf8'), modules);
  for (const entry of manifest.entryPages) checkScriptOrder(fs.readFileSync(path.join(root, entry), 'utf8'), modules, entry);
  const globals = new Set(modules.map(m => m.global));
  const files = fs.readdirSync(path.join(root, 'js/scene')).filter(f => f.endsWith('.js')).map(f => 'js/scene/' + f);
  if (files.some(f => !modules.some(m => m.file === f))) fail('新增场景模块必须登记职责、接口、依赖及验证方式');
  for (const module of modules) {
    if (!module.responsibility || !module.verification.length) fail(module.file + ': 必须登记职责与验证');
    for (const test of module.verification) if (!fs.existsSync(path.join(root,test))) fail(module.file+': 验证文件不存在 '+test);
    const source = fs.readFileSync(path.join(root, module.file), 'utf8'), sf = parse(module.file, source);
    if (sf.parseDiagnostics.length) fail(module.file + ': 语法错误');
    checkCompositionModule(source, module);
    const dependencies = new Set(); let api;
    function visit(node) {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'window' && globals.has(node.name.text) && node.name.text !== module.global) dependencies.add(node.name.text);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(sf) === 'window.' + module.global) api = node.right;
      ts.forEachChild(node, visit);
    }
    visit(sf);
    if (!api || !ts.isObjectLiteralExpression(api)) fail(module.file + ': 缺少显式接口');
    const exported = [...new Set(api.properties.map(p => p.name?.getText(sf)))].sort();
    if (JSON.stringify(exported) !== JSON.stringify([...module.exports].sort())) fail(module.file + ': 接口变更须更新职责登记并评审调用者');
    const setters = api.properties.filter(ts.isSetAccessorDeclaration).map(p => p.name.getText(sf)).sort();
    if (JSON.stringify(setters) !== JSON.stringify([...module.mutableExports].sort())) fail(module.file + ': 不允许未登记的跨模块写状态');
    for (const dep of dependencies) if (!module.dependencies.includes(dep)) fail(module.file + ': 未登记的依赖 ' + dep);
    // Catch accidental duplicate declarations during later extraction/merges.
    const outer = unwrap(sf.statements.find(ts.isExpressionStatement)?.expression?.expression);
    if (outer && ts.isFunctionExpression(outer)) {
      const functions = outer.body.statements.filter(ts.isFunctionDeclaration).map(n => n.name.text);
      if (new Set(functions).size !== functions.length) fail(module.file + ': 重复函数声明会覆盖原行为');
    }
  }
  return modules.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`PASS scene architecture: pure entry, ${checkRepository()} owned modules, explicit interfaces, dependencies and script order`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
