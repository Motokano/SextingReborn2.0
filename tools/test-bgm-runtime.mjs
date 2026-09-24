// Check the actual running server, not just files in this checkout.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const origin = process.argv[2] || 'http://127.0.0.1:8000/';
const page = await fetch(origin);
assert.equal(page.status, 200);
const html = await page.text();
assert.match(html, /id="btn-bgm"/, 'Running game must include the music toggle');
assert.match(html, /src="js\/background-music.js"/, 'Running game must load the music module');
for (const path of ['js/background-music.js', 'bga/A_beautiful_criminal_2.mp3']) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, `${path} must be available in the runtime directory`);
    if (path.endsWith('.mp3')) assert.match(response.headers.get('content-type'), /^audio\//);
    const served = Buffer.from(await response.arrayBuffer());
    const local = await readFile(new URL('../' + path, import.meta.url));
    assert.ok(served.equals(local), `${path} must match the current BGM resource`);
}
console.log('PASS: running game includes BGM; script and MP3 match local files and are served successfully.');
