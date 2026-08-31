/**
 * UIWindows 管线冒烟测试（headless，Node）
 * 运行：node tools/test-ui-windows.mjs
 * 覆盖：默认布局、持久化读取校验（非法丢弃/未知 id 丢弃/版本不符）、仅可见性覆盖、
 *       像素盒应用、clamp、resetWindow、setVisible。
 */
import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const MODULE_PATH = '../js/ui-windows.js';
const STORAGE_KEY = 'ui_windows_v1';

// ---------- 环境 stub ----------
const store = new Map();
const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
};

function makeEl(id, rect, children) {
    const style = {};
    const el = {
        id,
        style,
        _rect: Object.assign({ left: 0, top: 0, width: 1280, height: 100, right: 1280, bottom: 100 }, rect || {}),
        _children: children || [],
        listeners: {},
        classSet: new Set(),
        attrs: {},
        classList: {
            add: (c) => el.classSet.add(c),
            remove: (c) => el.classSet.delete(c),
            contains: (c) => el.classSet.has(c),
        },
        addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
        getBoundingClientRect() { return el._rect; },
        setAttribute(k, v) { el.attrs[k] = String(v); },
        getAttribute(k) { return el.attrs[k] != null ? el.attrs[k] : null; },
        querySelector(sel) {
            if (!sel) return null;
            for (const c of el._children) {
                if (c._selector === sel) return c;
                const nested = c.querySelector ? c.querySelector(sel) : null;
                if (nested) return nested;
            }
            return null;
        },
        closest() { return null; },
    };
    return el;
}

function makeChildEl(selector, cls) {
    const el = makeEl('child-' + selector, null, []);
    el._selector = selector;
    if (cls) cls.forEach((c) => el.classList.add(c));
    return el;
}

function setupWindow() {
    documentBars = new Map();
    global.window = global;
    global.innerWidth = 1280;
    global.innerHeight = 720;
    global.localStorage = localStorage;
    global.setTimeout = setTimeout;
    global.clearTimeout = clearTimeout;
    global.addEventListener = () => {};
    global.document = {
        readyState: 'complete',
        listeners: {},
        addEventListener(type, fn) { (global.document.listeners[type] = global.document.listeners[type] || []).push(fn); },
        getElementById(id) {
            if (id && id.startsWith('ui-window-bar-')) return documentBars.get(id) || null;
            return null;
        },
        createElement(tag) {
            const el = makeEl('created-' + tag);
            el.tagName = String(tag || '').toUpperCase();
            el.innerHTML = '';
            el.parentNode = null;
            el.querySelector = (sel) => {
                if (sel === '.ui-window-bar-label') return el._label || null;
                if (sel === '.ui-window-bar-restore') return el._restoreBtn || null;
                return null;
            };
            return el;
        },
        body: {
            appendChild(el) {
                if (el.id && el.id.startsWith('ui-window-bar-')) documentBars.set(el.id, el);
                el.parentNode = global.document.body;
            },
            removeChild(el) {
                if (el.id && el.id.startsWith('ui-window-bar-')) documentBars.delete(el.id);
                el.parentNode = null;
            }
        }
    };
    global.UIText = {
        t: (k) => {
            const m = { 'ui.windows.restore_hint': '恢复窗口', 'ui.windows.win-limbs': '肢体检视' };
            return m[k] || k;
        }
    };
}

/** 已创建的任务条（document stub 全局，便于用例断言） */
let documentBars = new Map();

function freshModule() {
    delete require.cache[require.resolve(MODULE_PATH)];
    require(MODULE_PATH);
    return global.UIWindows;
}

function registerLog(UIWindows, el, extra) {
    return UIWindows.registerPanel('win-log', Object.assign({
        type: 'free',
        titleKey: 'ui.windows.log',
        el: () => el,
        defaultPos: 'fullwidth-bottom',
        defaultSize: { h: 100 },
        minW: 220,
        minH: 64,
        closable: false,
        resizable: true,
        dragHandle: '.game-log-header',
        handles: { top: '.t', left: '.l', right: '.r' },
        dblclickReset: true
    }, extra || {}));
}

// ---------- 用例 ----------
function testDefaultLayout() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('game-log-panel', { left: 0, top: 620, width: 1280, height: 100, right: 1280, bottom: 720 });
    registerLog(UI, el);
    UI.init();
    // 默认：贴底全宽 100px（与 #game-log-panel CSS 一致）
    assert.strictEqual(el.style.position, 'fixed', 'default position fixed');
    assert.strictEqual(el.style.left, '0', 'default left 0');
    assert.strictEqual(el.style.right, '0', 'default right 0');
    assert.strictEqual(el.style.bottom, '0', 'default bottom 0');
    assert.strictEqual(el.style.height, '100px', 'default height 100px');
    assert.strictEqual(el.style.display, '', 'default visible');
    console.log('PASS default layout (fullwidth-bottom 100px)');
}

function testIllegalEntryDropped() {
    setupWindow();
    store.clear();
    store.set(STORAGE_KEY, JSON.stringify({
        version: 1,
        lock: false,
        windows: {
            'win-log': { x: 'garbage', y: 10, w: 400, h: 120, visible: true }
        }
    }));
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    UI.init();
    // 非法坐标 → 丢弃该条 → 默认布局
    assert.strictEqual(el.style.bottom, '0', 'illegal entry -> default bottom');
    assert.strictEqual(el.style.left, '0', 'illegal entry -> default left');
    // 且不写回非法数据
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    assert.ok(!saved.windows['win-log'], 'illegal entry not persisted');
    console.log('PASS illegal entry dropped -> default layout');
}

function testUnknownIdIgnored() {
    setupWindow();
    store.clear();
    store.set(STORAGE_KEY, JSON.stringify({
        version: 1,
        lock: false,
        windows: {
            'win-future': { x: 10, y: 10, w: 300, h: 100, visible: true }
        }
    }));
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    UI.init();
    assert.strictEqual(el.style.bottom, '0', 'unknown id ignored');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    assert.ok(!saved.windows['win-future'], 'unknown id not persisted back');
    console.log('PASS unknown id ignored');
}

function testVersionMismatch() {
    setupWindow();
    store.clear();
    store.set(STORAGE_KEY, JSON.stringify({
        version: 999,
        lock: true,
        windows: { 'win-log': { x: 10, y: 10, w: 300, h: 100, visible: true } }
    }));
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    UI.init();
    assert.strictEqual(el.style.bottom, '0', 'version mismatch -> default');
    assert.strictEqual(UI.getLock(), false, 'version mismatch -> lock reset');
    console.log('PASS version mismatch -> whole discard');
}

function testStoredPixelBoxApplied() {
    setupWindow();
    store.clear();
    store.set(STORAGE_KEY, JSON.stringify({
        version: 1,
        lock: false,
        windows: { 'win-log': { x: 300, y: 100, w: 500, h: 140, visible: true } }
    }));
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    UI.init();
    assert.strictEqual(el.style.left, '300px', 'stored x applied');
    assert.strictEqual(el.style.top, '100px', 'stored y applied');
    assert.strictEqual(el.style.width, '500px', 'stored w applied');
    assert.strictEqual(el.style.height, '140px', 'stored h applied');
    assert.strictEqual(el.style.right, 'auto', 'right auto when pixel box');
    console.log('PASS stored pixel box applied');
}

function testMinClampOnAdopt() {
    setupWindow();
    store.clear();
    // 存储尺寸低于 min（220×64）→ 注册时夹紧
    store.set(STORAGE_KEY, JSON.stringify({
        version: 1,
        lock: false,
        windows: { 'win-log': { x: 10, y: 10, w: 50, h: 30, visible: true } }
    }));
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    UI.init();
    assert.strictEqual(el.style.width, '220px', 'width clamped to minW');
    assert.strictEqual(el.style.height, '64px', 'height clamped to minH');
    console.log('PASS min clamp on adopt');
}

function testVisibilityOnlyOverride() {
    setupWindow();
    store.clear();
    store.set(STORAGE_KEY, JSON.stringify({
        version: 1,
        lock: false,
        windows: { 'win-log': { visible: false } }
    }));
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    UI.init();
    // 仅可见性覆盖：隐藏 + 保留默认布局（不转像素盒）
    assert.strictEqual(el.style.display, 'none', 'hidden');
    assert.strictEqual(el.style.bottom, '0', 'default layout kept');
    assert.strictEqual(el.style.left, '0', 'default layout kept (left)');
    console.log('PASS visibility-only override keeps default layout');
}

function testSetVisiblePersistsAndReset() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    UI.init();
    UI.setVisible('win-log', false);
    assert.strictEqual(el.style.display, 'none', 'hidden after setVisible(false)');
    UI.setVisible('win-log', true);
    assert.strictEqual(el.style.display, '', 'visible after setVisible(true)');
    UI.resetWindow('win-log');
    assert.strictEqual(el.style.bottom, '0', 'reset -> default bottom');
    assert.strictEqual(el.style.height, '100px', 'reset -> default height');
    assert.strictEqual(el.style.display, '', 'reset -> visible');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    assert.ok(!saved.windows['win-log'], 'reset clears stored entry');
    console.log('PASS setVisible + resetWindow');
}

function testClampWindow() {
    setupWindow();
    store.clear();
    store.set(STORAGE_KEY, JSON.stringify({
        version: 1,
        lock: false,
        windows: { 'win-log': { x: -200, y: 700, w: 5000, h: 900, visible: true } }
    }));
    const UI = freshModule();
    const el = makeEl('game-log-panel', { left: -200, top: 700, width: 5000, height: 900, right: 4800, bottom: 1600 });
    registerLog(UI, el);
    UI.init();
    // applyLayout 直接应用原始值（clamp 由 clampWindow/拖拽时做），手动触发 clamp 验证
    UI.clampWindow('win-log');
    const l = parseFloat(el.style.left);
    const w = parseFloat(el.style.width);
    const t = parseFloat(el.style.top);
    const h = parseFloat(el.style.height);
    assert.ok(l >= 0, 'clamp left >= 0');
    assert.ok(t >= 0, 'clamp top >= 0');
    assert.ok(t + h <= 720, 'clamp bottom within viewport');
    assert.ok(w >= 220, 'clamp width >= minW');
    assert.ok(h >= 64 && h <= Math.floor(720 * 0.72), 'clamp height within [minH, maxH]');
    assert.ok(l + w <= 1280 - 8, 'clamp right within viewport');
    console.log('PASS clampWindow: ' + JSON.stringify({ l, t, w, h }));
}

// ---------- M2：dock 默认 / closable / setGameVisible / lock / z 提升 ----------
function makeDockPanel(UI, id, extra) {
    const grip = makeChildEl('.ui-window-grip', ['ui-window-grip']);
    const close = makeChildEl('.ui-window-close', ['ui-window-close']);
    const el = makeEl(id, null, [grip, close]);
    UI.registerPanel(id, Object.assign({
        type: 'free',
        titleKey: 'ui.windows.' + id,
        el: () => el,
        defaultPos: 'dock',
        minW: 160,
        minH: 64,
        closable: true,
        resizable: false,
        dragHandle: '.ui-window-grip'
    }, extra || {}));
    return el;
}

function testDockDefaultLayout() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeDockPanel(UI, 'win-limbs');
    UI.init();
    // dock：清空内联定位（回退 CSS/文档流），默认可见
    assert.strictEqual(el.style.position, '', 'dock clears position');
    assert.strictEqual(el.style.left, '', 'dock clears left');
    assert.strictEqual(el.style.display, '', 'dock default visible');
    console.log('PASS M2 dock default layout (cleared inline, visible)');
}

function testCloseButtonBinds() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeDockPanel(UI, 'win-limbs');
    UI.init();
    // close 按钮已绑定 click → setVisible(false)
    const grip = el.querySelector('.ui-window-grip');
    const close = el.querySelector('.ui-window-close');
    assert.ok(grip, 'grip present');
    assert.ok(close, 'close present');
    assert.ok((close.listeners.click || []).length >= 1, 'close click bound');
    const clickFn = close.listeners.click[0];
    clickFn({ preventDefault() {}, stopPropagation() {} });
    assert.strictEqual(el.style.display, 'none', 'close click hides window');
    assert.strictEqual(UI.getVisible('win-limbs'), false, 'visible=false after close');
    console.log('PASS M2 close button binds and hides');
}

function testSetGameVisibleMerge() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeDockPanel(UI, 'win-limbs');
    UI.init();
    // 游戏门控 false → 隐藏（玩家偏好不覆盖）
    UI.setGameVisible('win-limbs', false);
    assert.strictEqual(el.style.display, 'none', 'game gate false -> hidden');
    // 游戏门控 true + 玩家偏好 false → 仍隐藏
    UI.setGameVisible('win-limbs', true);
    UI.setVisible('win-limbs', false);
    assert.strictEqual(el.style.display, 'none', 'player pref false -> hidden');
    // 游戏门控 true + 玩家偏好 true → 显示
    UI.setVisible('win-limbs', true);
    assert.strictEqual(el.style.display, '', 'both true -> visible');
    console.log('PASS M2 setGameVisible && player-pref merge');
}

function testLockBlocksDrag() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeDockPanel(UI, 'win-limbs');
    UI.init();
    UI.setLock(true);
    const grip = el.querySelector('.ui-window-grip');
    const md = (grip.listeners.mousedown || [])[0];
    assert.ok(md, 'grip mousedown bound');
    md({ button: 0, clientX: 10, clientY: 10, preventDefault() {}, target: grip });
    // 锁定时 mousedown 不进入拖拽：style.left 保持空
    assert.strictEqual(el.style.left, '', 'locked -> no drag started');
    UI.setLock(false);
    md({ button: 0, clientX: 10, clientY: 10, preventDefault() {}, target: grip });
    // 解锁后 mousedown 会 ensureFixedPixelBox（rect 默认 0,0,1280,100 → left 0 但不为空串）
    assert.ok(el.style.left !== '', 'unlocked -> drag starts');
    console.log('PASS M2 lock blocks drag, unlock allows');
}

function testZRaiseOnDrag() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeDockPanel(UI, 'win-limbs');
    UI.init();
    const grip = el.querySelector('.ui-window-grip');
    const md = (grip.listeners.mousedown || [])[0];
    md({ button: 0, clientX: 10, clientY: 10, preventDefault() {}, target: grip });
    const z = parseInt(el.style.zIndex, 10);
    assert.ok(z >= 30 && z <= 38, 'z raised within [30,38], got ' + z);
    console.log('PASS M2 z-index raised on drag: ' + z);
}

// ---------- M3：锚定窗口 / getPanelList / displayManaged ----------
function testAnchoredNoDragBinding() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('top-hud');
    UI.registerPanel('win-time', {
        type: 'anchored',
        titleKey: 'ui.windows.time',
        el: () => el,
        closable: true
    });
    UI.init();
    // 锚定窗口不绑定拖拽：init 后无 header mousedown 监听（bindPanel 直接跳过）
    assert.strictEqual(el.listeners.mousedown, undefined, 'anchored no mousedown binding');
    // 显隐仍可用
    UI.setVisible('win-time', false);
    assert.strictEqual(el.style.display, 'none', 'anchored hide works');
    UI.setVisible('win-time', true);
    assert.strictEqual(el.style.display, '', 'anchored show works');
    console.log('PASS M3 anchored window: no drag, visibility works');
}

function testDisplayManagedFalse() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('dialogue-panel');
    let visCb = null;
    UI.registerPanel('win-dialogue', {
        type: 'anchored',
        titleKey: 'ui.windows.dialogue',
        el: () => el,
        closable: true,
        displayManaged: false,
        onVisibility: (el2, visible) => { visCb = visible; }
    });
    UI.init();
    // displayManaged false：管线不碰 style.display（DialogueUI 管），只回调偏好
    assert.strictEqual(el.style.display, undefined, 'display untouched (undefined)');
    UI.setVisible('win-dialogue', false);
    assert.strictEqual(el.style.display, undefined, 'still untouched after hide pref');
    assert.strictEqual(visCb, false, 'onVisibility callback fired with false');
    assert.strictEqual(UI.getVisible('win-dialogue'), false, 'pref recorded');
    console.log('PASS M3 displayManaged=false: preference only, DOM untouched');
}

function testGetPanelListFiltersGated() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const elA = makeEl('a');
    const elB = makeEl('b');
    UI.registerPanel('win-a', { type: 'free', el: () => elA, defaultPos: 'dock', gameVisible: () => true });
    UI.registerPanel('win-b', { type: 'free', el: () => elB, defaultPos: 'dock', gameVisible: () => false }); // 未解锁
    UI.init();
    const list = UI.getPanelList();
    const ids = list.map((x) => x.id);
    assert.ok(ids.includes('win-a'), 'unlocked window listed');
    assert.ok(!ids.includes('win-b'), 'gated window not listed (认知论：不占位)');
    assert.strictEqual(list[0].titleKey, 'ui.windows.win-a', 'titleKey fallback');
    console.log('PASS M3 getPanelList filters gated windows');
}

function testMenuResetClearsAll() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('game-log-panel');
    registerLog(UI, el);
    const el2 = makeEl('role-card');
    UI.registerPanel('win-role', { type: 'free', el: () => el2, defaultPos: 'dock' });
    UI.init();
    UI.setVisible('win-role', false);
    UI.setLock(true);
    assert.strictEqual(UI.getVisible('win-role'), false, 'hidden before reset');
    UI.resetAll();
    assert.strictEqual(UI.getVisible('win-role'), true, 'visible after resetAll');
    assert.strictEqual(UI.getLock(), false, 'lock cleared after resetAll');
    console.log('PASS M3 resetAll clears visibility + lock');
}

// ---------- M3.5：最小化任务条（RO 式） ----------
function testMinimizeCreatesTaskBar() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const grip = makeChildEl('.ui-window-grip', ['ui-window-grip']);
    const close = makeChildEl('.ui-window-close', ['ui-window-close']);
    const min = makeChildEl('.ui-window-min', ['ui-window-min']);
    const el = makeEl('status-limbs', null, [grip, close, min]);
    UI.registerPanel('win-limbs', {
        type: 'free', titleKey: 'ui.windows.win-limbs',
        el: () => el, defaultPos: 'dock', minW: 160, minH: 64,
        closable: true, resizable: false, dragHandle: '.ui-window-grip'
    });
    UI.init();
    UI.minimize('win-limbs');
    // 窗口本体隐藏、任务条创建
    assert.strictEqual(el.style.display, 'none', 'window hidden when minimized');
    assert.ok(documentBars.has('ui-window-bar-win-limbs'), 'task bar created');
    const bar = documentBars.get('ui-window-bar-win-limbs');
    assert.ok(bar.style.left !== undefined, 'bar positioned');
    // 恢复
    UI.restore('win-limbs');
    assert.strictEqual(el.style.display, '', 'window visible after restore');
    assert.ok(!documentBars.has('ui-window-bar-win-limbs'), 'task bar removed after restore');
    console.log('PASS M3.5 minimize creates/removes task bar');
}

function testMinimizePersists() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('status-limbs');
    UI.registerPanel('win-limbs', {
        type: 'free', titleKey: 'ui.windows.win-limbs',
        el: () => el, defaultPos: 'dock', closable: true, dragHandle: '.ui-window-grip'
    });
    UI.init();
    UI.minimize('win-limbs');
    // 等待防抖写盘
    const saved = JSON.parse(localStorage.getItem('ui_windows_v1'));
    assert.strictEqual(saved.windows['win-limbs'].minimized, true, 'minimized persisted');
    // 重载模块：恢复 minimized 状态（重新创建任务条）
    const UI2 = freshModule();
    const el2 = makeEl('status-limbs');
    UI2.registerPanel('win-limbs', {
        type: 'free', titleKey: 'ui.windows.win-limbs',
        el: () => el2, defaultPos: 'dock', closable: true, dragHandle: '.ui-window-grip'
    });
    UI2.init();
    assert.ok(documentBars.has('ui-window-bar-win-limbs'), 'task bar restored after reload');
    assert.strictEqual(el2.style.display, 'none', 'window stays hidden after reload');
    console.log('PASS M3.5 minimized state persists across reload');
}

function testMinimizeGameGateRemovesBar() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('status-combat-resources-card');
    UI.registerPanel('win-battle', {
        type: 'free', titleKey: 'ui.windows.battle',
        el: () => el, defaultPos: 'dock', closable: true, dragHandle: '.ui-window-grip',
        gameVisible: () => true
    });
    UI.init();
    UI.minimize('win-battle');
    assert.ok(documentBars.has('ui-window-bar-win-battle'), 'bar exists while gated visible');
    // 战斗结束门控关闭 → 任务条消失（窗口都不该存在）
    UI.setGameVisible('win-battle', false);
    assert.ok(!documentBars.has('ui-window-bar-win-battle'), 'bar removed when game gate closes');
    // 门控恢复 → 任务条重现
    UI.setGameVisible('win-battle', true);
    assert.ok(documentBars.has('ui-window-bar-win-battle'), 'bar back when gate reopens');
    console.log('PASS M3.5 game gate controls task bar visibility');
}

function testResetAllRemovesBars() {
    setupWindow();
    store.clear();
    const UI = freshModule();
    const el = makeEl('status-limbs');
    UI.registerPanel('win-limbs', {
        type: 'free', titleKey: 'ui.windows.win-limbs',
        el: () => el, defaultPos: 'dock', closable: true, dragHandle: '.ui-window-grip'
    });
    UI.init();
    UI.minimize('win-limbs');
    assert.ok(documentBars.has('ui-window-bar-win-limbs'), 'bar before reset');
    UI.resetAll();
    assert.ok(!documentBars.has('ui-window-bar-win-limbs'), 'bar removed after resetAll');
    assert.strictEqual(el.style.display, '', 'window visible after resetAll');
    console.log('PASS M3.5 resetAll removes task bars');
}

// ---------- M4：对话安全 forceVisible ----------
function testForceVisibleTemporary() {
    return new Promise((resolve) => {
        setupWindow();
        store.clear();
        const UI = freshModule();
        const el = makeEl('dialogue-panel');
        UI.registerPanel('win-dialogue', {
            type: 'anchored', titleKey: 'ui.windows.dialogue',
            el: () => el, closable: true, displayManaged: false
        });
        UI.init();
        // 玩家在窗口列表里隐藏对话面板（防抖写盘）
        UI.setVisible('win-dialogue', false);
        setTimeout(() => {
            const saved = JSON.parse(localStorage.getItem('ui_windows_v1'));
            assert.strictEqual(saved.windows['win-dialogue'].visible, false, 'player hide pref persisted');
            // 触发对话：强制恢复（仅本次会话）
            UI.forceVisible('win-dialogue');
            assert.strictEqual(UI.getVisible('win-dialogue'), true, 'dialogue forced visible');
            // 未写盘：强制恢复后 localStorage 仍是隐藏偏好（刷新后玩家偏好保留）
            const saved2 = JSON.parse(localStorage.getItem('ui_windows_v1'));
            assert.strictEqual(saved2.windows['win-dialogue'].visible, false, 'forceVisible not persisted');
            console.log('PASS M4 forceVisible: temporary, player pref untouched');
            resolve();
        }, 250);
    });
}

// ---------- 运行 ----------
const cases = [
    testDefaultLayout,
    testIllegalEntryDropped,
    testUnknownIdIgnored,
    testVersionMismatch,
    testStoredPixelBoxApplied,
    testMinClampOnAdopt,
    testVisibilityOnlyOverride,
    testSetVisiblePersistsAndReset,
    testClampWindow,
    testDockDefaultLayout,
    testCloseButtonBinds,
    testSetGameVisibleMerge,
    testLockBlocksDrag,
    testZRaiseOnDrag,
    testAnchoredNoDragBinding,
    testDisplayManagedFalse,
    testGetPanelListFiltersGated,
    testMenuResetClearsAll,
    testMinimizeCreatesTaskBar,
    testMinimizePersists,
    testMinimizeGameGateRemovesBar,
    testResetAllRemovesBars,
    testForceVisibleTemporary
];
let failed = 0;
let pending = 0;
let done = 0;
function runCase(c) {
    pending++;
    try {
        const r = c();
        if (r && typeof r.then === 'function') {
            r.then(() => { done++; if (--pending === 0) finish(); })
             .catch((e) => { failed++; done++; console.error('FAIL ' + c.name + ': ' + e.message); console.error(e.stack); if (--pending === 0) finish(); });
        } else {
            done++;
            if (--pending === 0) finish();
        }
    } catch (e) {
        failed++;
        done++;
        console.error('FAIL ' + c.name + ': ' + e.message);
        console.error(e.stack);
        if (--pending === 0) finish();
    }
}
function finish() {
    if (failed) {
        console.error(failed + '/' + cases.length + ' cases FAILED');
        process.exit(1);
    }
    console.log('ALL ' + cases.length + ' CASES PASSED');
}
for (const c of cases) runCase(c);
