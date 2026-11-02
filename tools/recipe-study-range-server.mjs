// Local authoring tool. Writes one dungeon's recipe scope, never player saves or maps.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePaths = {
  config: 'data/dungeon-config.json',
  ranges: 'data/dungeon-recipe-ranges.json',
  rangeModule: 'js/dungeon/recipe-ranges.js',
  recipes: 'docs/design/examples/manufacturing-system-v1.json',
  classification: 'docs/design/manufacturing-classification-v1.json',
  items: 'data/items.json',
  forgingItems: 'data/forging/item-catalog-v2.json',
  catalog: 'js/manufacturing-knowledge-catalog.js',
  knowledge: 'js/manufacturing-knowledge.js',
  study: 'js/dungeon/recipe-study.js',
};
const categoryNames = {
  fishing: '钓具与鱼饵', gathering: '采集与维修', hunting: '狩猎用品', daily: '日用与布作',
  cooking: '烹饪器具', pharmacy: '制药器具', agriculture: '客土材料', processing: '中间料加工',
};
const skillNames = { life_fishing: '钓鱼', life_mining: '采矿', life_logging: '伐木', life_manufacturing: '制造', life_weaving: '纺织', life_pharmacy: '制药', life_cooking: '烹饪', life_hunting: '狩猎', life_planting: '种植' };
const hash = text => createHash('sha256').update(text).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function readSource(root) {
  const raw = Object.fromEntries(Object.entries(sourcePaths).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), 'utf8')]));
  const config = JSON.parse(raw.config), design = JSON.parse(raw.recipes), ranges = JSON.parse(raw.ranges);
  const context = vm.createContext({});
  for (const key of ['catalog', 'knowledge', 'study', 'rangeModule']) vm.runInContext(raw[key], context, { filename: sourcePaths[key], timeout: 1000 });
  const runtime = context.ManufacturingKnowledgeCatalog.recipes;
  if (runtime.length !== design.recipes.length || design.recipes.some(r => !runtime.some(k => k.id === r.recipe_id && k.unlock === r.unlock.kind && k.name === r.name))) {
    throw fail('制作目录与正式知识目录不同步，请先运行 npm run build:manufacturing-knowledge。', 409);
  }
  if (config.content?.version !== 16 || config.recipeStudyRangesSource !== sourcePaths.ranges || config.content.recipeStudy !== undefined) throw fail('当前地牢尚未正确绑定配方范围目录。', 409);
  const validate = value => { try { context.DungeonRecipeRanges.validate(value); } catch (error) { throw fail(error.message); } };
  validate(ranges);
  if (!ranges.dungeons.some(d => d.id === config.id)) throw fail('已接入的地牢缺少配方范围配置。', 409);
  return { config, design, ranges, raw, validate, revision: hash(JSON.stringify(raw)) };
}

export function readSnapshot(root = projectRoot) {
  const { config, design, ranges, raw, revision } = readSource(root);
  const classes = new Map(JSON.parse(raw.classification).items.map(item => [item.item_id, item]));
  const items = { ...JSON.parse(raw.items), ...JSON.parse(raw.forgingItems).items };
  const productNames = new Map([...design.recipes, ...(design.processing_recipes || [])].map(r => [r.item_id, r.name]));
  const itemName = id => items[id]?.attribute_modules?.base?.identity?.sn || items[id]?.sn || items[id]?.name || productNames.get(id) || id;
  const ingredient = i => ({ id: i.item_id, name: itemName(i.item_id), count: i.count });
  const rows = (list, processing = false) => list.map(r => {
    const c = classes.get(r.item_id)?.category || 'daily';
    const category = processing ? 'processing' : c.startsWith('fishing_') ? 'fishing' : c;
    const selectable = !processing && r.unlock.kind === 'exploration';
    return {
      id: r.recipe_id, itemId: r.item_id, name: r.name, category, selectable,
      kind: processing ? 'processing' : selectable ? 'research' : 'basic',
      unlockText: selectable ? '资料台可解锁' : r.unlock.kind === 'skill_level' ? `${skillNames[r.unlock.skill_id] || r.unlock.skill_id} 1 级自动掌握${processing ? ' · 中间工序' : ''}` : '随关联成品配方掌握 · 中间工序',
      station: design.facilities[r.station]?.name || r.station,
      bench: r.workbench_level_min, output: r.output_count, ticks: r.ticks, stamina: r.stamina,
      inputs: (r.inputs || []).map(ingredient), tools: (r.required_tools || []).map(ingredient),
    };
  });
  return {
    revision, designRevision: design.review_revision, defaultDungeonId: config.id,
    dungeons: ranges.dungeons.map(d => ({ ...d, connected: d.id === config.id, ticketOverrides: d.id === config.id ? (config.tickets || []).filter(t => t.content?.recipeStudy).length : 0 })),
    categories: Object.entries(categoryNames).map(([id, name]) => ({ id, name })),
    recipes: [...rows(design.recipes), ...rows(design.processing_recipes || [], true)],
  };
}

function sourceForWrite(root, payload) {
  if (!payload || typeof payload.revision !== 'string') throw fail('缺少读取版本，请重新读取配置。');
  const source = readSource(root);
  if (payload.revision !== source.revision) throw fail('文件已被其他窗口或工具修改。当前勾选仍保留，请重新读取后再编辑。', 409);
  return source;
}

function writeRanges(root, source) {
  source.validate(source.ranges);
  const target = path.join(root, sourcePaths.ranges);
  const temporary = target + '.' + randomBytes(6).toString('hex') + '.tmp';
  const output = JSON.stringify(source.ranges, null, 2) + '\n';
  // Synchronous replacement serializes editor requests and preserves unrelated config fields.
  try {
    fs.writeFileSync(temporary, output, { encoding: 'utf8', flag: 'wx' });
    if (readSource(root).revision !== source.revision) throw fail('保存期间源文件发生变化，请重新读取。', 409);
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return readSnapshot(root);
}

export function saveRange(root, payload) {
  const source = sourceForWrite(root, payload);
  const dungeon = source.ranges.dungeons.find(d => d.id === payload.dungeonId);
  if (!dungeon) throw fail('请选择有效的地牢配置。');
  dungeon.recipeStudy = structuredClone(payload.config);
  return writeRanges(root, source);
}

export function createRange(root, payload) {
  const source = sourceForWrite(root, payload);
  if (typeof payload.name !== 'string') throw fail('请填写地牢名称。');
  const copyFrom = payload.copyFromId ? source.ranges.dungeons.find(d => d.id === payload.copyFromId) : null;
  if (payload.copyFromId && !copyFrom) throw fail('要复制的地牢配置不存在。');
  const createdId = 'dungeon_' + randomBytes(8).toString('hex');
  source.ranges.dungeons.push({ id: createdId, name: payload.name.trim(), recipeStudy: copyFrom ? structuredClone(copyFrom.recipeStudy) : { enabled: false, chance: .03, recipeIds: [] } });
  return { ...writeRanges(root, source), createdId };
}

export function createEditorServer({ root = projectRoot } = {}) {
  const token = randomBytes(24).toString('hex');
  const assets = new Map([
    ['/', ['tools/recipe-study-range-editor.html', 'text/html; charset=utf-8']],
    ['/tools/recipe-study-range-editor.html', ['tools/recipe-study-range-editor.html', 'text/html; charset=utf-8']],
    ['/tools/recipe-study-range-editor.css', ['tools/recipe-study-range-editor.css', 'text/css; charset=utf-8']],
    ['/tools/recipe-study-range-editor.mjs', ['tools/recipe-study-range-editor.mjs', 'text/javascript; charset=utf-8']],
    ['/assets/dungeon/recipe-study-point-v1/available.png', ['assets/dungeon/recipe-study-point-v1/available.png', 'image/png']],
  ]);
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      const port = server.address().port;
      const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!allowed.has(req.headers.host) || req.headers.origin && req.headers.origin !== `http://${req.headers.host}` || req.headers['sec-fetch-site'] === 'cross-site') throw fail('请通过本机编辑器地址访问。', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/recipe-study' && req.method === 'GET') return reply(200, { ...readSnapshot(root), token });
      if (url.pathname === '/api/recipe-study' && ['PUT', 'POST'].includes(req.method)) {
        if (req.headers['x-editor-token'] !== token || req.headers['content-type'] !== 'application/json') throw fail('保存凭据失效，请重新读取。', 403);
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32768) throw fail('配置内容过大。', 413);
          chunks.push(chunk);
        }
        let payload;
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('配置内容不是有效 JSON。'); }
        return reply(req.method === 'POST' ? 201 : 200, { ...(req.method === 'POST' ? createRange(root, payload) : saveRange(root, payload)), token });
      }
      const asset = assets.get(url.pathname);
      if (req.method === 'GET' && asset) {
        const bytes = fs.readFileSync(path.join(projectRoot, asset[0]));
        res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
        return res.end(bytes);
      }
      reply(404, { error: '没有这个编辑器页面。' });
    } catch (error) {
      reply(error.status || 500, { error: error.status ? error.message : '读取或保存文件失败：' + error.message });
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] || 8042);
  const server = createEditorServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。可指定另一端口：npm run editor:recipe-study -- 8043` : error); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`配方范围编辑器：http://127.0.0.1:${server.address().port}/`));
}
