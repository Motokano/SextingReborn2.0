/**
 * 转换单向约束审计（k15，设计 08 §伤害类型转换 / 39 §转换单向约束 强制）：
 * 扫描全部数据源中 damage_type_convert / form_convert 声明，校验 from→to 必须顺向
 * （伤害类型 钝击→劈砍→戳刺、形态 拳→掌→戳；任意顺向可跨级、严禁反向；同源同目标无意义）。
 * 规则事实源：js/convert-rules.js（未来结算也必须走同一套 isForwardConvert）。
 * 用法：node tools/audit-convert-direction.mjs   （或 npm run audit:convert）
 * 退出码：0 = 全部合法；1 = 存在违规（供 CI/本地对账）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ConvertRules from '../js/convert-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** 扫描的数据文件（未来声明转换的数据源在此登记） */
const DATA_FILES = [
  { file: 'data/modules.json', label: 'modules.json' },
  { file: 'data/move-variants.json', label: 'move-variants.json' },
  { file: 'data/post-effects.json', label: 'post-effects.json' },
  { file: 'data/enchant.json', label: 'enchant.json' }
];

function main() {
  let total = 0;
  let violations = 0;
  const lines = [];

  for (const df of DATA_FILES) {
    const full = path.join(ROOT, df.file);
    if (!fs.existsSync(full)) {
      lines.push(`[audit-convert-direction] 跳过（文件不存在）：${df.file}`);
      continue;
    }
    const found = ConvertRules.scanFile(full, df.label);
    for (const rec of found) {
      total++;
      const r = rec.result;
      const loc = rec.path ? `${rec.source} :: ${rec.path}` : rec.source;
      if (r.ok) {
        lines.push(`  ✓ 顺向  ${loc}  →  ${r.reason}`);
      } else {
        violations++;
        lines.push(`  ✗ 违规  ${loc}  →  ${r.reason}`);
      }
    }
  }

  console.log('[audit-convert-direction] 转换声明审计（k15，单向约束：任意顺向可跨级、严禁反向）');
  console.log('伤害类型顺序：钝击 → 劈砍 → 戳刺（blunt → slash → pierce）');
  console.log('形态顺序：拳 → 掌 → 戳');
  console.log('----------------------------------------');
  if (total === 0) {
    console.log('（未发现任何 damage_type_convert / form_convert 声明）');
  } else {
    console.log(`共 ${total} 条转换声明：`);
    for (const l of lines) console.log(l);
  }
  console.log('----------------------------------------');
  if (violations > 0) {
    console.log(`[audit-convert-direction] 结果：失败（${violations} 条违规，反向/同源转换禁止）`);
    process.exitCode = 1;
  } else {
    console.log(`[audit-convert-direction] 结果：通过（${total} 条声明全部顺向合法）`);
  }
}

main();
