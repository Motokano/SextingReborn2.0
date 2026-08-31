# 三十五、代码文案规范（i18n 与编码防护）

> **目的**：根治「JS 里硬编码中文」导致的两类问题——① 误用工具造成的 mojibake 乱码；② 文案散落无法本地化。本文档是**强制代码规范**，含工具边界、key 命名规则、抽离流程与分批计划。
>
> **背景**：项目已有 `data/ui_text_zhCN.json` + `ui()`/`UIText.t()` 强校验机制，但历史代码遗留 **526+ 处硬编码中文字符串**（`tools/check-i18n.js` 实测），散在 27 个 JS 文件。此前一次 PowerShell 误操作把多个含中文文件写成 mojibake。

---

## 1. 工具边界（防 mojibake，强制）

**含中文的文件，只允许用以下方式读写**：

| 操作 | 允许 | 禁止 |
|------|------|------|
| 改 JS/HTML/JSON/MD | `edit`、`write` 工具；Node 脚本 `fs.readFileSync(f,'utf8')`/`writeFileSync(f, c,'utf8')` | ❌ PowerShell `Get-Content` + `Set-Content`（会按 ANSI 读、写 BOM，造成 mojibake） |
| 批量 ASCII 替换 | Node 脚本（utf8 读写） | ❌ PowerShell `.Replace()` + `Set-Content` |
| 只读验证 | `node --check`、`grep`、`ConvertFrom-Json` | — |
| 文件管理 | 删除/移动 | — |

**为什么**：Windows PowerShell 5.x 的 `Set-Content -Encoding UTF8` 实际写 UTF-8+BOM，且 `Get-Content` 默认按系统 ANSI 代码页（GBK）读无 BOM 的 UTF-8 文件 → 中文变 mojibake。`node --check` 只查语法、不查编码，所以会「语法通过但中文已烂」。

**每次改动后跑**：`node tools/check-i18n.js`（退出码 0=通过；检测 mojibake + 统计硬编码中文）。

---

## 2. key 命名规则

遵循项目现有分层（`log.system.*`、`combat.*`、`life.*` 等）：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `scene.msg.*` | 场景交互提示（showMsg） | `scene.msg.meditation_stopped` |
| `combat.deploy.*` | 战斗配置/装配提示 | `combat.deploy.parry_slot_only` |
| `combat.cfg.*` | 战斗配置校验 | `combat.cfg.invalid` |
| `log.*` | 游戏日志 | `log.system.attack.enemy` |
| 语义化小写点分 | 全小写、点分层、语义明确 | `life.skill.trade.desc` |

**带动态值**用模板：JSON 值写 `... {v} ...`，JS 调 `ui('key', { v })`。

---

## 3. 抽离流程（4 步，逐条机械执行）

1. **找**：`node tools/check-i18n.js` 列出该文件硬编码中文行；
2. **定 key**：按 §2 命名；
3. **加 JSON**：`data/ui_text_zhCN.json` 追加 `"key": "文案"`；
4. **改 JS**：`'中文'` → `ui('key')`（含动态值用 `ui('key', { v })`）。

---

## 4. 边界：哪些中文**不**抽 i18n

| 类型 | 例子 | 处置 |
|------|------|------|
| **数据比较/标识符** | `t === '烹饪台'`、`s === '仓库'`、`E.getAnnotationAt() === '制药台'` | **保留**（与地图 annotation/数据匹配，抽了会破坏） |
| **数据枚举标签** | 作物结构标签、模块名标签 | 移到**数据文件**（items/crop-defs），非 ui_text |
| **Canvas 字体名** | `"微软雅黑"` | 保留（字体配置） |
| **注释** | `// 与烹饪对称…` | 保留（不影响运行，中文注释可读性好） |
| **demo/embed** | `trade_canvas_renderer_demo.js`、`*.embed.js` | 最后处理或跳过 |

**抽离范围**：玩家可见文案（`showMsg`/`logMsg`/`textContent`/`innerHTML`/`tips`/`addOption` 标题）+ 调试日志。

---

## 5. 分批计划（按优先级）

| 批次 | 内容 | 规模（约） | 状态 |
|------|------|-----------|------|
| ① 玩家即时文案 | showMsg/logMsg/textContent/tips/innerHTML | ~350 处 / 27 文件 | ✅ **已完成**：scene-app、scene-renderer、livestock-state、livestock-panel（170 处全清）、gathering、inventory-equipment、game-time、item-info-modules、npc-system、save-system |
| ② 数据枚举标签 | crop 标签、模块名 | ~80 处 | 保留（数据 fallback，归数据文件） |
| ③ 调试/校验错误 | recipe-schema/recipe-system 的 error 文案 | ~90 处 | 待做（开发者可见，可选） |
| ④ 字体名/demo/embed | `"微软雅黑"`、trade demo | ~30 处 | 跳过（demo/生成物） |

**剩余 236 处分类**：agriculture-map 56（生成文件，需在 `tools/build-agriculture-map-js.mjs` 源处理）；recipe-schema/recipe-system 53（批次③）；trade demo 28（demo）；muscles/survival-skills 30（数据 fallback）；其余 ~70（annotation 数据比较 / fatal overlay / 物品模板 fallback / PRODUCT_NAMES 等，**均合理保留**）。

**推进建议**：玩家文案已抽离完毕。剩余仅「调试类（可选）+ 生成文件（需改生成器源）+ 数据保留（不动）」，如需彻底清零可对 recipe-* 与 agriculture 生成器源做批次③，但优先级低。

---

## 6. 已完成

- `tools/check-i18n.js` 检测脚本（mojibake + 硬编码中文统计）；
- **玩家可见文案全部抽离完成**（516 → 236 处）：10 个核心文件 + livestock-panel（170 处，含辅助函数 reasonText/tierLabel/grassStage 等）共 **280 处** → `ui_text_zhCN.json` + `ui('key')`/`t('key')`/`tQuick('key')`；
- 全量 mojibake 修复（本会话此前的编码事故），`check-i18n.js` 每次运行 mojibake 0。

---

*规范 v1：工具边界 + key 规则 + 四步流程 + 边界判定 + 分批计划。后续 i18n 抽离一律按本文档执行。*
