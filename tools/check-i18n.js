'use strict';
/**
 * 编码与 i18n 体检脚本（防 mojibake 回归 + 硬编码中文清单）。
 * 用法：node tools/check-i18n.js
 *
 * 检查项：
 * 1. mojibake 检测：文件里出现「UTF-8 中文被 Latin-1/CP1252 误解码」产生的特征字符序列（如 Ã¤、â€、çŽ、åœ¨ 等）。
 * 2. 硬编码中文：JS 非注释行里的中文字符串字面量（玩家可见文案应抽到 data/ui_text_zhCN.json）。
 *
 * 退出码：0 = 通过；1 = 发现问题（列出明细）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['js'];

// —— mojibake 特征：常见「UTF-8→CP1252/Latin-1」乱码的连续字符对 ——
// 正常源码里几乎不会连续出现这些 Latin-1 扩展字符；mojibake 中文会大量产生。
const MOJIBAKE_PATTERNS = [
    /Ã[\x80-\xBF]{1,2}/,   // Ã€Ã©Ã¤Ã¶Ã¼ 等（0xC3 开头被拆）
    /Â[\x80-\xBF]/,         // Â€Â 等（0xC2 开头被拆）
    /â€[^ ]/,               // â€œ â€ 等（引号/破折号）
    /çŽ|ç©|ç”|ç»|çš„/,      // 常见中文字头 mojibake（现/空/生/经/的）
    /åœ¨|å¯¹|ä¸[€-﾿]|ä¸Ž/,  // 在/对/一…/与
    /æ˜¯|æ—¥|æœˆ|æ•°/,      // 是/日/月/数
];

// —— 中文字符串字面量（用于硬编码清单）——
const CJK = /[\u4e00-\u9fff]/;
const STRING_LITERAL_WITH_CJK = /(['"`])(?:(?!\1).)*[\u4e00-\u9fff](?:(?!\1).)*\1/g;

let problems = 0;
let cjkStringCount = 0;
const cjkFiles = new Map();

function walk(dir) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return [];
    const out = [];
    for (const name of fs.readdirSync(full)) {
        const p = path.join(full, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) { out.push(...walk(path.join(dir, name))); }
        else if (name.endsWith('.js')) out.push(path.join(dir, name));
    }
    return out;
}

const files = [];
for (const d of SCAN_DIRS) files.push(...walk(d));

for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const content = fs.readFileSync(abs, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, i) => {
        const ln = i + 1;
        // 跳过纯注释行
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--')) return;

        // 1) mojibake 检测
        for (const re of MOJIBAKE_PATTERNS) {
            if (re.test(line)) {
                console.log(`[MOJIBAKE] ${rel}:${ln}  ${trimmed.slice(0, 80)}`);
                problems++;
                break;
            }
        }

        // 2) 硬编码中文字符串字面量：跳过「已 i18n 化」的行（含 ui(/t(/tQuick(/tUi(/UIText.t 调用，中文是防御性 fallback）
        if (/ui\s*\(|tQuick\s*\(|tUi\s*\(|UIText\.t\s*\(|(^|[^\w.])t\s*\(\s*['"]/.test(line)) return;
        const m = line.match(STRING_LITERAL_WITH_CJK);
        if (m) {
            cjkStringCount++;
            if (!cjkFiles.has(rel)) cjkFiles.set(rel, []);
            cjkFiles.get(rel).push(ln);
        }
    });
}

console.log('=== 硬编码中文字符串（应抽 i18n）统计 ===');
console.log('共 ' + cjkStringCount + ' 处，涉及 ' + cjkFiles.size + ' 个文件：');
for (const [rel, lns] of cjkFiles) {
    console.log(`  ${rel}: ${lns.length} 处（行 ${lns.slice(0, 12).join(', ')}${lns.length > 12 ? ' …' : ''}）`);
}

if (problems > 0) {
    console.log(`\n发现 ${problems} 处疑似 mojibake，请修复。`);
    process.exit(1);
} else {
    console.log('\n未发现 mojibake。');
    process.exit(0);
}
