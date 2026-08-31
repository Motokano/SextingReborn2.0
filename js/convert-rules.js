/**
 * 转换单向约束（k15，设计 08 §伤害类型转换 / 39 §转换单向约束 强制）：
 * - 伤害类型顺序：钝击 → 劈砍 → 戳刺（blunt → slash → pierce）
 * - 形态顺序：拳 → 掌 → 戳
 * - 任意顺向可跨级（钝→劈、劈→戳、钝→戳 均合法）；严禁反向（劈→钝、戳→劈、戳→钝 / 掌→拳、戳→掌、戳→拳）。
 * - 目的：防止来回转换形成循环、伤害无限膨胀（一条伤害链吃两条增伤合法，来回循环增伤禁止）。
 *
 * 本模块是转换方向判定的**唯一事实源**：未来伤害/形态转换结算（改造件 k21、手套 k31 等）必须经
 * isForwardConvert 校验；审计脚本 tools/audit-convert-direction.mjs 用同一套规则扫描数据。
 */
(function (global) {
    'use strict';

    /** 伤害类型顺序（08：钝击 → 劈砍 → 戳刺） */
    var DAMAGE_TYPE_ORDER = ['blunt', 'slash', 'pierce'];

    /** 形态顺序（39：拳 → 掌 → 戳；踢为脚部形态，不参与手部转换） */
    var FORM_ORDER = ['拳', '掌', '戳'];

    /** 伤害类型别名归一化（中文/简写 → 规范 id；不认识的返回 null） */
    var DAMAGE_TYPE_ALIASES = {
        'blunt': 'blunt', '钝': 'blunt', '钝击': 'blunt', '拳': 'blunt', '掌': 'blunt',
        'slash': 'slash', '劈': 'slash', '劈砍': 'slash',
        'pierce': 'pierce', '戳': 'pierce', '戳刺': 'pierce'
    };

    /** 形态别名归一化（中文 → 规范值；不认识的返回 null） */
    var FORM_ALIASES = { '拳': '拳', '掌': '掌', '戳': '戳' };

    function normalizeDamageType(v) {
        var key = String(v == null ? '' : v).trim();
        return DAMAGE_TYPE_ALIASES[key] != null ? DAMAGE_TYPE_ALIASES[key] : null;
    }

    function normalizeForm(v) {
        var key = String(v == null ? '' : v).trim();
        return FORM_ALIASES[key] != null ? FORM_ALIASES[key] : null;
    }

    /**
     * 转换方向判定（k15 核心）。
     * @param {string} kind - 'damage_type' | 'form'
     * @param {*} from - 源（伤害类型或形态；自动归一化中文别名）
     * @param {*} to - 目标
     * @returns {{ok:boolean, direction:'forward'|'reverse'|'same'|'unknown', reason:string, from?:string, to?:string}}
     */
    function isForwardConvert(kind, from, to) {
        var order = kind === 'form' ? FORM_ORDER : DAMAGE_TYPE_ORDER;
        var norm = kind === 'form' ? normalizeForm : normalizeDamageType;
        var f = norm(from);
        var t = norm(to);
        if (f == null || t == null) {
            return { ok: false, direction: 'unknown', reason: '无法识别的' + (kind === 'form' ? '形态' : '伤害类型') + '：from=' + String(from) + ' to=' + String(to) };
        }
        var fi = order.indexOf(f);
        var ti = order.indexOf(t);
        if (fi < 0 || ti < 0) {
            return { ok: false, direction: 'unknown', reason: '不在顺序表内：' + String(from) + '→' + String(to) };
        }
        if (fi === ti) {
            return { ok: false, direction: 'same', reason: '同源同目标（无意义转换）：' + String(from) + '→' + String(to) };
        }
        if (fi < ti) {
            return { ok: true, direction: 'forward', reason: '顺向（可跨级）：' + String(from) + '→' + String(to) };
        }
        return { ok: false, direction: 'reverse', reason: '反向转换禁止：' + String(from) + '→' + String(to) };
    }

    /** 效果声明 → 方向判定（effect_type: damage_type_convert | form_convert；effect_params: {from, to}） */
    function validateConvertEffect(effect) {
        var e = effect || {};
        var type = String(e.effect_type || '').trim();
        var p = e.effect_params || {};
        if (type === 'damage_type_convert') {
            return isForwardConvert('damage_type', p.from, p.to);
        }
        if (type === 'form_convert') {
            return isForwardConvert('form', p.from, p.to);
        }
        return null; // 非转换效果
    }

    /**
     * 递归扫描任意数据对象中所有转换效果声明。
     * 返回 [{ source: '模块id/路径', effect, result }]；只含命中 damage_type_convert / form_convert 的条目。
     * @param {*} obj - 要扫描的 JSON 对象/数组
     * @param {string} [source] - 溯源标签（如 'modules.mod_hooded_coat'），自动拼接路径
     * @param {string} [path] - 内部递归路径
     */
    function scanConvertDeclarations(obj, source, path) {
        var out = [];
        if (obj == null) return out;
        var base = source || '';
        var p = path || '';
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) {
                out = out.concat(scanConvertDeclarations(obj[i], base, p + '[' + i + ']'));
            }
            return out;
        }
        if (typeof obj === 'object') {
            var vt = validateConvertEffect(obj);
            if (vt) {
                out.push({ source: base || '?', path: p || '(root)', effect: obj, result: vt });
            }
            for (var k in obj) {
                if (!obj.hasOwnProperty(k)) continue;
                var v = obj[k];
                if (v && typeof v === 'object') {
                    out = out.concat(scanConvertDeclarations(v, base, p ? p + '.' + k : k));
                }
            }
        }
        return out;
    }

    /** 扫描指定文件的转换声明（Node/审计用） */
    function scanFile(filePath, sourceLabel) {
        var out = [];
        try {
            var fs = require('fs');
            var data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            out = scanConvertDeclarations(data, sourceLabel || filePath);
        } catch (e) {
            out.push({ source: sourceLabel || String(filePath), path: '(load)', effect: null, result: { ok: false, direction: 'unknown', reason: '文件读取/解析失败：' + String(e && e.message ? e.message : e) } });
        }
        return out;
    }

    var api = {
        DAMAGE_TYPE_ORDER: DAMAGE_TYPE_ORDER.slice(),
        FORM_ORDER: FORM_ORDER.slice(),
        normalizeDamageType: normalizeDamageType,
        normalizeForm: normalizeForm,
        isForwardConvert: isForwardConvert,
        validateConvertEffect: validateConvertEffect,
        scanConvertDeclarations: scanConvertDeclarations,
        scanFile: scanFile
    };

    // 浏览器挂全局
    global.ConvertRules = api;
    // Node/ESM 可导入（审计脚本用）
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
