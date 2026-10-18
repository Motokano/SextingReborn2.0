import fs from 'node:fs';
const p='js/ui-windows.js';let s=fs.readFileSync(p,'utf8');
s=s.replace("var STORAGE_KEY = 'ui_windows_v1';", "var STORAGE_KEY = document.body && document.body.classList.contains('moss-game') ? 'ui_windows_moss_c_v1' : 'ui_windows_v1';");
s=s.replace("var raw = global.localStorage.getItem(STORAGE_KEY);",`var raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw && STORAGE_KEY === 'ui_windows_moss_c_v1') {
                // First switch to C: keep visibility/lock, give the approved layout fresh geometry.
                var legacy = global.localStorage.getItem('ui_windows_v1');
                if (legacy) {
                    var previous = JSON.parse(legacy);
                    if (previous && previous.version === STORAGE_VERSION) {
                        var preferences = {};
                        Object.keys(previous.windows || {}).forEach(function (id) {
                            var old = previous.windows[id];
                            if (old && old.visible === false) preferences[id] = { visible: false };
                        });
                        raw = JSON.stringify({version: STORAGE_VERSION, lock: !!previous.lock, windows: preferences});
                        global.localStorage.setItem(STORAGE_KEY, raw);
                    }
                }
            }`);
s=s.replace("var hasMin = e.minimized === true;", "var hasMin = e.minimized === true;\n        var hasFold = e.folded === true;");
s=s.replace("!hasPos && !hasVisible && !hasMin && !hasBar", "!hasPos && !hasVisible && !hasMin && !hasFold && !hasBar");
s=s.replace("if (hasMin) entry.minimized = true;", "if (hasMin) entry.minimized = true;\n        if (hasFold) entry.folded = true;");
s=s.replace("if (raw.minimized === true) entry.minimized = true;", "if (raw.minimized === true) entry.minimized = true;\n        if (raw.folded === true) entry.folded = true;");
s=s.replace("syncTaskBar(id); //",`if (spec.foldInPlace && el.classList) {
            el.classList.toggle('folded', !!(stored[id] && stored[id].folded));
            var foldButton = el.querySelector('.ui-window-min');
            if (foldButton) { foldButton.textContent = stored[id] && stored[id].folded ? '+' : '−'; foldButton.setAttribute('aria-expanded', String(!(stored[id] && stored[id].folded))); }
        }
        syncTaskBar(id); //`);
s=s.replace("minimizeWindow(id);", "if (registry[id] && registry[id].foldInPlace) setFolded(id, !(stored[id] && stored[id].folded));\n                        else minimizeWindow(id);");
s=s.replace("if (!spec) continue;\n            if (typeof spec.gameVisible", "if (!spec || spec.menuHidden) continue;\n            if (typeof spec.gameVisible");
s=s.replace("global.UIWindows = {",`function setFolded(id, value) {
        if (!registry[id] || !registry[id].foldInPlace) return;
        var entry = stored[id] || {visible:true};
        if (value) entry.folded = true; else delete entry.folded;
        stored[id] = entry;
        applyVisibility(id);
        writeStorageNow();
    }

    global.UIWindows = {
        setFolded: setFolded,`);
fs.writeFileSync(p,s);
let h=fs.readFileSync('index.html','utf8');h=h.replace('class="ui-refined ui-layout ui-matte"','class="ui-refined ui-layout ui-matte moss-game ui-polished ui-material-study ui-reference-study" data-variant="C"');h=h.replace('    <script src="js/bootstrap.js"></script>','    <script src="js/ui-moss-game.js"></script>\n    <script src="js/bootstrap.js"></script>');h=h.replace('</body>','    <link rel="stylesheet" href="css/ui-moss-runtime.css">\n    <link rel="stylesheet" href="css/ui-moss-game.css">\n</body>');fs.writeFileSync('index.html',h);
