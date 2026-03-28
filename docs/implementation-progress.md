# 实现进度快照与后续建议

本文档记录**相对设计文档**的仓库实现进度与优先建议，便于迭代时对齐，不作为设计正本。设计仍以 [GAME_DESIGN.md](../GAME_DESIGN.md) 与 [docs/design/00-index.md](design/00-index.md) 为准。

**快照日期**：2025-03-21  
**依据**：通读 `GAME_DESIGN.md`、`docs/design/00-index.md`、`15-todo.md`、`14-implementation.md`、`17-loading-and-decoupling.md` 及 `docs/migration/*` 说明；并对 `js/`、`data/`、`capitalism/` 目录与关键检索做对照。**未**在本快照中跑完整游戏或自动化测试；若需可审计结论，应补一轮手动 smoke 或 CI。

---

## 1. 设计锚点

- 模块索引与**实现顺序简表**：`docs/design/00-index.md` 第四节（基础框架 → … → 区域与地牢）。
- 技术栈、存档与字段约定：`docs/design/14-implementation.md`。
- 启动与文案解耦：`docs/design/17-loading-and-decoupling.md`。
- 贸易设计正文：`capitalism/*.md`（见 `00-index` 第三节 12.1～12.6）。

---

## 2. 已较扎实或已落地的部分

| 领域 | 说明（典型路径） |
|------|------------------|
| 启动与文案 | `js/bootstrap.js`、`js/ui-text.js`、`data/ui_text_zhCN.json`；与 `17-loading-and-decoupling.md` 一致。 |
| 场景与地图 | `js/game-engine.js`、`js/scene-app.js`、`data/maps/*.json`；渲染与动画相关：`js/scene-renderer.js`、`js/core/tile-renderer-v2.js`、`js/scene-animation.js`。 |
| 状态抽离（进行中） | `js/core/game-state-core.js`（框架无关核心，与迁移文档方向一致）。 |
| 生存（对照 06） | `js/survival.js`、`data/survival-config.json`。 |
| 角色与装备栏（对照 05 / 14 子集） | `js/character-attributes.js`、`js/inventory-equipment.js`（含战斗子状态、死亡清空装备等）。 |
| 采集与生产 | `js/gathering.js`、`js/production-quality.js`、`data/gathering_point_instances.json`（实例/掉落/品质硬上限）、`data/gathering_points.json`（兼容）、`tools/gathering-point-editor.html` 等。 |
| 技能 | `js/combat-skills.js`、`js/survival-skills.js`、`data/combat-skills.json`。 |
| Buff（对照 18） | `js/buff-system.js`、`data/buffs.json`、`data/editor/buff_event_registry.json`。 |
| 经脉/穴位（对照 12） | `js/acupoints.js`。 |
| NPC / 对话 | `js/npc-system.js`、`js/dialogue-ui.js`、`data/npc/*`；Svelte 对话迁移见 `docs/migration/svelte-ui-rewrite.md`。 |
| 贸易 UI 试验 | `js/trade_canvas_ui.js`、`js/trade_context.js`、`js/trade_layout.js` 等（界面与数据结构，**非** capitalism 全文规则引擎）。 |
| 游戏时间 | `js/game-time.js`（`totalTicks` 与 Buff 等系统衔接）。 |
| 日志 | `js/game-log.js`。 |

---

## 3. 明显偏薄或尚未闭环的部分

| 领域 | 说明 |
|------|------|
| 战斗核心 + 命中招架伤害（07 / 08） | 装备与 Buff 侧已有状态形状与事件语义（如 `hit_roll_success`）；**完整**「回合刻 → 出手 → 命中/招架/减伤」主循环仍需独立落地与验证。 |
| 身体部位与手术（09） | 运行时模块未见与设计 09 同级的一体化实现。 |
| 敌人（10） | 存在 `data/loot_tables.json` 等；敌人 AI、遭遇与战斗对接仍弱（亦见 `15-todo.md`）。 |
| 死亡与投保（03） | 生存侧死亡、装备清空有基础；**保险代码、装备快照、地牢标识与取回**等与 `14` 大段约定相比缺口大。 |
| 存档（14） | 设计：实时存档、存档世代、加密导出等。当前 `localStorage` 多用于 NPC demo 标记等，**非**完整进度快照与加密导出。 |
| 玩家间交易（13） | 交易码、特征码、与存档世代联动等未见对应实现模块。 |
| 区域与地牢循环（02） | 多地图与传送有；地牢目标、撤离与死亡/投保联动未形成闭环。 |
| capitalism 全块 | `capitalism/` 以设计文档为主；JS 需按 `trading_tables.md` 等逐项接 **runtime**（规则、会话、结算、通胀等）。 |

---

## 4. 建议的下一步（按依赖与风险）

1. **统一游戏状态 + 存档骨架（14 子集）**  
   先固定可序列化快照（`character`、四类 `inventory_*`、`equipment`、`GameTime.totalTicks` 等），实现**本地实时存档**（首版可无 AES）。阻塞面最大：贸易、P2P、投保、地牢都依赖稳定数据模型。

2. **战斗最小可玩切片（07 + 08，接 Buff）**  
   单场景、单敌人、固定招式；完整命中/招架/伤害链，并从**统一入口**触发 Buff（含多段命中唯一事件 id 等，见 buff 规则文档）。

3. **死亡与投保（03）**  
   在存档模型稳定后，落地保险码/校验/与「禁止旧档刷物品」规则，与 `14` 存档世代约定对齐。

4. **敌人与遭遇（10）**  
   在战斗切片后接 `loot_tables` 等最小掉落闭环；AI 可后做。

5. **贸易 runtime（capitalism）**  
   分段：先 `trading_scene_rules`、会话状态、结算落地（对齐 `trade_ui_data_structures.md`），再旅行商人循环与通胀等。

6. **前端架构收尾**  
   `game-state-core`、Svelte 对话、新瓦片渲染与 `SceneApp` 并行时，建议在 `docs/migration` 增补**当前真源与弃用时间表**，避免双轨长期分裂。

---

## 5. 维护说明

更新本快照时：修改**快照日期**、按需调整表格、在文末追加一行**修订记录**（日期 + 摘要）即可。

**修订记录**

- 2025-03-21：初版（由实现对照设计文档整理写入仓库）。
