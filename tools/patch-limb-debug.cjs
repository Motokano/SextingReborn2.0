const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] || path.resolve(__dirname, '..');
const file = path.join(root, 'js/scene-app.js');
let source = fs.readFileSync(file, 'utf8');
const marker = '            (function (pid, partLabel) {';
const addition = `            // Per-part debug control uses the same destruction limits as combat.
            (function (key, partLabel, host) {
                var debugButton = document.createElement('button');
                debugButton.type = 'button';
                debugButton.className = 'limb-debug-destroy';
                debugButton.textContent = '满损毁';
                debugButton.title = '调试：' + partLabel + '满损毁';
                debugButton.setAttribute('aria-label', debugButton.title);
                debugButton.style.cssText = 'margin-left:6px;padding:1px 5px;font-size:11px;flex-shrink:0';
                debugButton.addEventListener('click', function (event) {
                    event.stopPropagation();
                    var CA = window.CharacterAttributes;
                    if (!CA || typeof CA.applyCombatDestroy !== 'function') return;
                    var max = CA.getBodyPartDestroyMax(key);
                    var remaining = Math.max(0, max - CA.getPartDestroy(key));
                    if (remaining > 0) CA.applyCombatDestroy(key, remaining);
                    SceneUi.hideItemTooltip();
                    SceneHud.refresh('status');
                    if (window.PlayerPawnRig) window.PlayerPawnRig.update(document.querySelector('.player-pawn-visual'));
                    if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
                });
                host.querySelector('.row').appendChild(debugButton);
            })(destroyKey, label, row);
`;
if (!source.includes("debugButton.className = 'limb-debug-destroy'")) {
    if (source.split(marker).length !== 2) throw Error('Expected one limb row insertion point');
    source = source.replace(marker, addition + marker);
    fs.writeFileSync(file, source);
}
console.log('Updated limb debug buttons:', file);
