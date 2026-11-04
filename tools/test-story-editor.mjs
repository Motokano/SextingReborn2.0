import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshot, normalizeDocument, saveDocument, createStoryServer } from './story-editor-server.mjs';
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-editor-'));
  fs.mkdirSync(path.join(root, 'data/npc'), { recursive: true });
  for (const f of ['npc_supervisor_manager.json', 'npc_supervisor_manager_triggers.json', 'npc_supervisor_manager_dialogue_pools.json']) fs.copyFileSync('data/npc/' + f, path.join(root, 'data/npc', f));
  return root;
}
function cleanup(root) {
  const resolved = path.resolve(root), parent = path.resolve(os.tmpdir());
  assert.equal(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith('story-editor-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
test('real events and pools round-trip; reorder and metadata preserved; stale saves rejected', () => {
  const root = fixture(), s = snapshot(root);
  try {
    assert.equal(s.docs.events.entries.length, 6);
    for (const kind of ['events', 'pools']) assert.deepEqual(normalizeDocument(kind, s.docs[kind], s.docs[kind]), s.docs[kind]);
    const doc = structuredClone(s.docs.events), e = doc.entries[0], originalFirst = e.dialogue.linesRich[0];
    e.dialogue.linesRich.splice(0, 1); e.dialogue.linesRich.splice(3, 0, originalFirst); e.dialogue.linesRich[2].text = '测试改写';
    const result = saveDocument(root, { kind: 'events', revision: s.revisions.events, document: doc });
    assert.equal(result.document.entries[0].dialogue.lines[2], '测试改写');
    assert.equal(result.document.entries[0].dialogue.linesRich[3].text, originalFirst.text);
    assert.deepEqual(result.document.entries.slice(1), s.docs.events.entries.slice(1));
    assert.deepEqual(result.document.entries[0].effects, s.docs.events.entries[0].effects);
    assert.deepEqual(snapshot(root).docs.pools, s.docs.pools);
    assert.throws(() => saveDocument(root, { kind: 'events', revision: s.revisions.events, document: doc }), /其他窗口/);
    const bytes = fs.readFileSync(path.join(root, s.files.events), 'utf8');
    for (const corrupt of [d => d.entries[0].dialogue.linesRich[0].text = '', d => d.entries[0].effects = [], d => d.entries[1].requires = ['missing'], d => d.entries[1].requires = [d.entries[2].id], d => d.entries[0].repeatable = true]) {
      const broken = structuredClone(result.document); corrupt(broken);
      if (broken.entries[1].requires[0] === broken.entries[2].id) broken.entries[2].requires = [broken.entries[1].id];
      assert.throws(() => saveDocument(root, { kind: 'events', revision: result.revision, document: broken }));
      assert.equal(fs.readFileSync(path.join(root, s.files.events), 'utf8'), bytes);
    }
  } finally { cleanup(root); }
});
test('local server requires same-origin token; atomically writes only selected document', async () => {
  const root = fixture(), server = createStoryServer({ root }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url)).status, 200);
    const s = await (await fetch(url + '/api/story')).json();
    const document = structuredClone(s.docs.pools); document.pools['npc.supervisor.manager.fallback'].lines[0] = '临时目录验证';
    const body = JSON.stringify({ kind: 'pools', revision: s.revisions.pools, document });
    assert.equal((await fetch(url + '/api/story', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(url + '/api/story', { headers: { Origin: 'https://example.invalid' } })).status, 403);
    const response = await fetch(url + '/api/story', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Editor-Token': s.token }, body });
    assert.equal(response.status, 200); assert.equal(snapshot(root).docs.pools.pools['npc.supervisor.manager.fallback'].lines[0], '临时目录验证');
    assert.deepEqual(snapshot(root).docs.events, s.docs.events);
    assert.equal((await fetch(url + '/data/items.json')).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); cleanup(root); }
});
