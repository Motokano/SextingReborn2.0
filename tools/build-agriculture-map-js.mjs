/** The runtime is authoritative. Historical HTML-to-runtime extraction is retired. */
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../js/agriculture-map.js', import.meta.url));
new vm.Script(fs.readFileSync(source, 'utf8'), { filename: source });
console.log('Agriculture runtime validated. Edit js/agriculture-map.js; build:agriculture-standalone rebuilds the demo.');
