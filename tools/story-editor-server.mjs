import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = { events: 'data/npc/npc_supervisor_manager_triggers.json', pools: 'data/npc/npc_supervisor_manager_dialogue_pools.json' };
export const openingId = 'supervisor.firstTalk_01';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, label, max = 12000) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw fail(label + '不能为空或过长。'); };

function validateCondition(c, depth = 0) {
  if (!object(c) || depth > 12) throw fail('触发条件无效。');
  if (c.type === 'true') return;
  if (c.type === 'flagEquals') { text(c.flag, '标记名称', 200); if (typeof c.value !== 'boolean') throw fail('标记值必须是是或否。'); return; }
  if (['skillLevelEquals', 'skillLevelGte'].includes(c.type)) { text(c.skillId, '技能编号', 200); if (!Number.isInteger(c.level) || c.level < 0) throw fail('技能等级须为非负整数。'); return; }
  if (c.type === 'postEffectObtainedGte') { if (!Number.isInteger(c.value) || c.value < 0) throw fail('后遗症数量须为非负整数。'); return; }
  if (['and', 'or'].includes(c.type) && Array.isArray(c.conds) && c.conds.length) { c.conds.forEach(v => validateCondition(v, depth + 1)); return; }
  if (c.type === 'not') { validateCondition(c.cond, depth + 1); return; }
  throw fail('此编辑器暂不支持该触发条件：' + c.type);
}

function validateLines(lines, label) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 300) throw fail(label + '需要 1～300 句台词。');
  lines.forEach(l => {
    if (!object(l) || !['npc', 'player', 'narration'].includes(l.speaker)) throw fail('请选择林经理、玩家或旁白。');
    text(l.text, '台词');
    if (l.avatar != null && typeof l.avatar !== 'string') throw fail('头像路径必须为文字。');
  });
}

export function normalizeDocument(kind, input, original) {
  const doc = structuredClone(input);
  if (!object(doc)) throw fail('文件内容无效。');
  if (kind === 'events') {
    if (!Array.isArray(doc.entries) || !doc.entries.length || doc.entries.length > 100) throw fail('事件数量须为 1～100。');
    const ids = new Set();
    for (const e of doc.entries) {
      text(e.id, '事件编号', 200);
      if (!/^[\w.-]+$/.test(e.id) || ids.has(e.id)) throw fail('事件编号格式不正确或重复。');
      ids.add(e.id);
      if (e.entryType !== 'dialogue' || e.entrySource !== 'chat' || typeof e.repeatable !== 'boolean') throw fail('事件必须是闲聊对话，且指定是否重复。');
      validateCondition(e.condition);
      if (!object(e.dialogue)) throw fail('缺少对话。');
      validateLines(e.dialogue.linesRich, e.id);
      // Keep both legacy and rich consumers consistent. Existing event metadata stays intact.
      e.dialogue.lines = e.dialogue.linesRich.map(l => l.text);
      if (e.dialogue.options?.length) throw fail('本版编排逐句对话，暂不支持新增选项分支。');
      e.dialogue.hasOptions = false; e.dialogue.options = [];
      for (const key of ['requires', 'blocks']) if (!Array.isArray(e[key]) || e[key].some(v => typeof v !== 'string')) throw fail('前置与排除事件必须为列表。');
      if (!Array.isArray(e.effects)) throw fail('结束效果必须为列表。');
      for (const ef of e.effects) {
        const p = ef.params;
        if (!object(p)) throw fail('结束效果参数无效。');
        if (ef.type === 'setFlag') { text(p.flag, '标记名称', 200); if (typeof p.value !== 'boolean') throw fail('标记值须为是或否。'); }
        else if (['modifySkillLevel', 'modifySkillMaxLevelBonus'].includes(ef.type)) {
          text(p.skillId, '技能编号', 200); if (!Number.isInteger(p.delta) || Math.abs(p.delta) > 10000 || p.min != null && (!Number.isInteger(p.min) || p.min < 0)) throw fail('技能变化须为有效整数。');
        } else if (['giveItem', 'removeItem'].includes(ef.type)) {
          text(p.itemId, '物品编号', 200); if (!Number.isInteger(p.count) || p.count < 1 || p.count > 10000) throw fail('物品数量须为正整数。');
        } else throw fail('暂不支持的结束效果：' + ef.type);
      }
    }
    const opening = doc.entries.find(e => e.id === openingId);
    if (!opening || opening.repeatable || opening.requires.length || opening.blocks.length || !opening.effects.some(ef => ef.type === 'setFlag' && ef.params.flag === 'supervisor_has_talked' && ef.params.value === true)) throw fail('首次见面须保留一次性完成标记，且不能设置前置或排除事件。');
    if (opening.effects.some(ef => ef.type !== 'setFlag')) throw fail('创角前的开场仅支持设置剧情标记；物品和技能奖励请放在创角后的事件。');
    for (const e of doc.entries) for (const k of ['requires', 'blocks']) for (const id of e[k]) if (!ids.has(id) || id === e.id) throw fail('事件引用不存在或引用了自身：' + id);
    const visit = (id, stack = new Set(), done = new Set()) => {
      if (stack.has(id)) throw fail('前置事件形成循环。');
      if (done.has(id)) return;
      stack.add(id); doc.entries.find(e => e.id === id).requires.forEach(next => visit(next, stack, done)); stack.delete(id); done.add(id);
    };
    doc.entries.forEach(e => visit(e.id));
    // Existing IDs are referenced by saved records and must remain stable.
    for (const e of original?.entries || []) if (!ids.has(e.id)) throw fail('已保存事件不能删除编号，可清空前置后改写其内容：' + e.id);
  } else if (kind === 'pools') {
    if (!object(doc.pools)) throw fail('缺少闲聊台词池。');
    for (const id of Object.keys(original?.pools || {})) if (!doc.pools[id]) throw fail('请保留现有台词池。');
    for (const [id, pool] of Object.entries(doc.pools)) {
      text(id, '台词池编号', 200);
      if (!object(pool) || !Array.isArray(pool.lines) || pool.lines.length > 300) throw fail('台词池格式无效。');
      for (const l of pool.lines) { if (typeof l === 'string') text(l, '台词'); else validateLines([l], id); }
      if (pool.includePools && (!Array.isArray(pool.includePools) || pool.includePools.some(v => !doc.pools[v] || v === id))) throw fail('台词池引用无效。');
      if (!pool.lines.length && !pool.includePools?.length) throw fail('台词池不能完全为空。');
    }
  } else throw fail('未知文件。');
  return doc;
}

export function snapshot(root = rootDir) {
  const raw = Object.fromEntries(Object.entries(files).map(([kind, f]) => [kind, fs.readFileSync(path.join(root, f), 'utf8')]));
  return { npc: JSON.parse(fs.readFileSync(path.join(root, 'data/npc/npc_supervisor_manager.json'), 'utf8')), files,
    docs: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, JSON.parse(v)])), revisions: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, hash(v)])) };
}

export function saveDocument(root, payload) {
  if (!payload || !Object.hasOwn(files, payload.kind)) throw fail('请选择有效文件。');
  const current = snapshot(root), kind = payload.kind;
  if (current.revisions[kind] !== payload.revision) throw fail('文件已被其他窗口修改。你的草稿仍保留，请先导出草稿，再重新读取对照。', 409);
  const doc = normalizeDocument(kind, payload.document, current.docs[kind]);
  const target = path.join(root, files[kind]), temp = target + '.' + randomBytes(6).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(doc, null, 2) + '\n', { flag: 'wx' });
    if (hash(fs.readFileSync(target, 'utf8')) !== payload.revision) throw fail('保存期间文件发生变化，草稿已保留。', 409);
    fs.renameSync(temp, target);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { document: doc, revision: hash(fs.readFileSync(target, 'utf8')), kind };
}

export function createStoryServer({ root = rootDir } = {}) {
  const token = randomBytes(24).toString('hex');
  const assets = { '/': 'tools/story-editor.html', '/story-editor.css': 'tools/story-editor.css', '/story-editor.mjs': 'tools/story-editor.mjs', '/js/dialogue-ui.js': 'js/dialogue-ui.js', '/js/ui-text.js': 'js/ui-text.js', '/data/ui_text_zhCN.json': 'data/ui_text_zhCN.json' };
  return http.createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const port = req.socket.localPort, host = req.headers.host;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host) || req.headers.origin && req.headers.origin !== 'http://' + host || req.headers['sec-fetch-site'] === 'cross-site') throw fail('请从本机编辑器访问。', 403);
      const url = new URL(req.url, 'http://' + host);
      if (url.pathname === '/api/story' && req.method === 'GET') return reply(200, { ...snapshot(root), token });
      if (url.pathname === '/api/story' && req.method === 'PUT') {
        if (req.headers['x-editor-token'] !== token || req.headers['content-type'] !== 'application/json') throw fail('保存凭据失效，请重新读取。', 403);
        let size = 0; const chunks = [];
        for await (const c of req) { size += c.length; if (size > 2000000) throw fail('文件过大。', 413); chunks.push(c); }
        let payload; try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('文件内容不是有效 JSON。'); }
        return reply(200, saveDocument(root, payload));
      }
      if (req.method === 'GET' && assets[url.pathname]) {
        const file = assets[url.pathname], mime = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
        return res.end(fs.readFileSync(path.join(rootDir, file)));
      }
      reply(404, { error: '没有这个页面。' });
    } catch (e) { reply(e.status || 500, { error: e.message }); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] || 8044), server = createStoryServer();
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `端口 ${port} 已占用，可指定另一端口。` : e); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`林经理 · 事件编排 http://127.0.0.1:${server.address().port}/`));
}
