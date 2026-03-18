// UI 文案注入与强校验：所有展示文案必须来自 data/ui_text_zhCN.json
(function (global) {
    'use strict';

    var dict = null;
    var loaded = false;

    function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

    function makeError(code, details, cause) {
        var parts = ['[' + code + ']'];
        if (details && typeof details === 'object') {
            try { parts.push(JSON.stringify(details)); } catch (e) { /* ignore */ }
        }
        if (cause) {
            var msg = (cause && cause.message) ? cause.message : String(cause);
            parts.push('cause=' + msg);
        }
        var err = new Error(parts.join(' '));
        err.code = code;
        err.details = details || null;
        if (cause) err.cause = cause;
        return err;
    }

    function setDict(next) {
        if (!isObj(next)) throw makeError('E_UI_DICT_INVALID', { expected: 'object', got: typeof next });
        dict = next;
        loaded = true;
    }

    function format(str, vars) {
        if (str == null) return '';
        var s = String(str);
        if (!vars) return s;
        return s.replace(/\{(\w+)\}/g, function (_, k) {
            if (!Object.prototype.hasOwnProperty.call(vars, k)) return '{' + k + '}';
            return String(vars[k]);
        });
    }

    function t(key, vars) {
        if (!loaded || !dict) throw makeError('E_UI_NOT_LOADED', { key: String(key || '') });
        if (!key) throw makeError('E_UI_KEY_EMPTY', {});
        if (!Object.prototype.hasOwnProperty.call(dict, key)) {
            throw makeError('E_UI_MISSING_KEY', { key: String(key) });
        }
        return format(dict[key], vars);
    }

    function requireKeys(keys) {
        if (!Array.isArray(keys)) return;
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!Object.prototype.hasOwnProperty.call(dict || {}, k)) {
                throw makeError('E_UI_MISSING_REQUIRED_KEY', { key: String(k) });
            }
        }
    }

    function describeEl(el) {
        if (!el) return '(null)';
        var tag = el.tagName ? String(el.tagName).toLowerCase() : 'unknown';
        var id = el.id ? ('#' + el.id) : '';
        var cls = '';
        try {
            if (el.classList && el.classList.length) cls = '.' + Array.prototype.slice.call(el.classList).join('.');
        } catch (e) { /* ignore */ }
        var parts = [tag + id + cls];
        try {
            var uiKey = el.getAttribute && el.getAttribute('data-ui');
            if (uiKey) parts.push('data-ui="' + uiKey + '"');
            var uiAttr = el.getAttribute && el.getAttribute('data-ui-attr');
            if (uiAttr) parts.push('data-ui-attr="' + uiAttr + '"');
            var uiTitle = el.getAttribute && el.getAttribute('data-ui-title');
            if (uiTitle) parts.push('data-ui-title="' + uiTitle + '"');
            var uiAria = el.getAttribute && el.getAttribute('data-ui-aria');
            if (uiAria) parts.push('data-ui-aria="' + uiAria + '"');
        } catch (e2) { /* ignore */ }
        return parts.join(' ');
    }

    function cssEscapeIdent(s) {
        // Minimal, safe enough for ids/classes we use here
        return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    function getSelector(el) {
        try {
            if (!el || !el.tagName) return '';
            if (el.id) return '#' + cssEscapeIdent(el.id);
            var path = [];
            var cur = el;
            var depth = 0;
            while (cur && cur.nodeType === 1 && depth < 7) {
                var tag = cur.tagName.toLowerCase();
                var seg = tag;
                if (cur.classList && cur.classList.length) {
                    var cls = Array.prototype.slice.call(cur.classList).slice(0, 3).map(cssEscapeIdent).join('.');
                    if (cls) seg += '.' + cls;
                }
                // nth-of-type within parent
                var parent = cur.parentElement;
                if (parent) {
                    var siblings = parent.children;
                    var idx = 0;
                    var count = 0;
                    for (var i = 0; i < siblings.length; i++) {
                        if (siblings[i].tagName === cur.tagName) {
                            count++;
                            if (siblings[i] === cur) idx = count;
                        }
                    }
                    if (count > 1) seg += ':nth-of-type(' + idx + ')';
                }
                path.unshift(seg);
                if (parent && parent.id) {
                    path.unshift('#' + cssEscapeIdent(parent.id));
                    break;
                }
                cur = parent;
                depth++;
            }
            return path.join(' > ');
        } catch (e) {
            return '';
        }
    }

    function applyDom(root) {
        if (!loaded || !dict) throw makeError('E_UI_NOT_LOADED', { where: 'applyDom' });
        root = root || document;
        var nodes = root.querySelectorAll('[data-ui]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var key = el.getAttribute('data-ui');
            if (!key) continue;
            var attr = el.getAttribute('data-ui-attr');
            try {
                if (attr) el.setAttribute(attr, t(key));
                else el.textContent = t(key);
                var titleKey = el.getAttribute('data-ui-title');
                if (titleKey) el.setAttribute('title', t(titleKey));
                var ariaKey = el.getAttribute('data-ui-aria');
                if (ariaKey) el.setAttribute('aria-label', t(ariaKey));
            } catch (e) {
                throw makeError(
                    'E_UI_APPLY_DOM',
                    {
                        index: i,
                        selector: getSelector(el),
                        element: describeEl(el),
                        data_ui: key,
                        data_ui_attr: attr || null,
                        data_ui_title: el.getAttribute('data-ui-title') || null,
                        data_ui_aria: el.getAttribute('data-ui-aria') || null,
                        fix_hint: 'Check key in data/ui_text_zhCN.json or correct data-ui attributes in index.html'
                    },
                    e
                );
            }
        }
    }

    global.UIText = {
        setDict: setDict,
        t: t,
        requireKeys: requireKeys,
        applyDom: applyDom
    };
})(typeof window !== 'undefined' ? window : this);

