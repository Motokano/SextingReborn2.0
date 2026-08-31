# 29 · 藏身处账号仓库（hideout_warehouse）

> **状态**：设计定案（实现待接）。升级材料表见 **`warehouse-upgrade-roadmap.html`**、**`data/warehouse-upgrades.json`**。  
> **与调试仓**：过渡期 **`modal-base-warehouse` 无限取物**仍保留；真仓 **`hideout_warehouse`** 独立存档与 API，见 **§9**。

---

## 1. 身份与边界

| 概念 | 口径 |
|------|------|
| **唯一玩家仓** | `hideout_warehouse`：藏身处账号级仓库，与「世界箱 / 载具 / 设施柜」等 **Storage** 分离，API 与存档字段不得混用。 |
| **存档绑定** | 本作 **仅一个 save slot**；`hideout_warehouse` **绑定当前存档**，与角色进度同档读写。 |
| **死亡** | **仓库内容死亡不清**（与 [03-death-and-insurance.md](03-death-and-insurance.md)「基地仓库与生产存货不受影响」一致；即指本仓）。身上 **口袋 / 背心 / 背包 / 载具** 仍按死亡规则清空。 |
| **离线** | **关游戏后整个游戏冻结**（无后台 tick）；腐败计时、工程 tick 等均不推进，直至再次进入游戏。 |

---

## 2. 容量与负重

- **限格不限重**：仓库只限制 **格位数**，**不做**角色负重 \(W / W_{\max}\) 检查（存入/取出均不触发超重判定）。
- **基础格位**：**100 格**（开局，见 §4）。
- **材料扩格终局**：**700 格**（阶梯见 §6、`capacity_ladder`）。

---

## 3. 堆叠与实例

### 3.1 默认可堆叠

- 模板 **`stack_limit > 1`** 的物品，在仓内 **默认允许** 同格叠 `count`（与背包分字段，见下）。
- 仓专用字段（模板，与背包堆叠字段分离）：
  - **`warehouse_stackable`**（可选覆盖）
  - **`warehouse_stack_limit`**（可选覆盖）
- **`deposit_auto_stack`**：**基础行为（免费、开局即有）**：存入时，若目标格已有同 `item_id` 且可叠，则合并 `count`，否则占新格。

### 3.2 唯一实例与装备

- **可存装备与完整实例**：带实例 id、`resolved_rolls`、鉴定状态等 **完整物品实例** 写入仓格；**未鉴定状态随实例保留**。
- 默认 **`stack_limit === 1`**（或未达可叠条件）时：**1 格 1 实例**。

### 3.3 展示

- 名称/描述与背包一致：走 **`InventoryEquipment.getDisplayName` / `getDisplayDesc`**，须传入 **`character`**（语言等级、鉴定展示同 [item-display-language-agent](.cursor/rules/item-display-language-agent.mdc)）。

---

## 4. 开局免费能力（默认开放）

**首版实现：默认开放**（新档即可通过仓库 NPC 使用，不等待剧情 flag）。下列能力 **无需付费升级** 即拥有：

| 能力 | 说明 |
|------|------|
| **100 格** | 基础容量 |
| **四类容器 → 仓** | 口袋、背心、背包、载具均可 **手动** 存入（拖拽/按钮） |
| **`deposit_auto_stack`** | 可叠物品存入时自动合并同格 |
| **取出** | 按 [05-character-attributes.md](05-character-attributes.md) §5.5.5 **默认放入顺序** 进入人物栏 |

**付费升级**（U-C1 等）在免费能力之上叠加 QoL（如双击快存、一键理仓等），见 §6。

### 4.1 A0（升级前置占位）

- **`A0`**：在 `warehouse-upgrades.json` 中作为扩建节点 **逻辑前置占位**（「仓库系统已启用」）。
- **首版**：运行时 **默认视为已满足**（与「默认开放」一致）；后续若剧情需要门控，再改为 quest/npc flag，**勿**在未门控时阻断扩建。

---

## 5. 访问入口

- **正式入口**：**设施 NPC** 管线（与灶台/制肥桶/床位同构）：地图绑定 `warehouse_station_interact_npc_by_cell`（或回退 id）→ **`interactNpc`** → 主菜单打开仓库面板。
- **过渡期**：地图 `annotations: "仓库"` + **`modal-base-warehouse` 调试无限取物** 可 **暂时并存**；真仓上线后逐步收口，见 §9。
- **默认访问范围**：**仅藏身处**（基地内）。
- **U-G2 远驿**：地牢内设施 **临时** 开放 **同一存档** 的 `hideout_warehouse`（见 §8）。

---

## 6. 升级系统

- **入口**：仓库面板内 **「扩建 / 升级」** 按钮，选择可解锁节点 → 扣 **`inputs`** → 工程 **`task_ticks` × `stamina_per_tick`**（默认 10×5，对齐农业建造）。
- **工程计时（面板内）**：扩建 **不占用世界 tick**；仅在 **扩建子层打开且仓库面板打开** 时，按 **`panel_tick_ms`（默认 2000ms = 现实 2 秒）** 推进 1 工程 tick，并扣对应体力。关闭扩建层或仓库面板即 **暂停**（不后台扣体力）；再次打开扩建层可继续。
- **施工中移动**：扩建子层计时进行中时，玩家 **不可移动**（与灶台制作中类似）；**关闭按钮禁用**（含仓库 ✕ 与扩建层 ×），直至本 tick 计时结束或体力不足暂停。
- **数据**：**`data/warehouse-upgrades.json`**；可视化 **`warehouse-upgrade-roadmap.html`**。
- **阶梯**：100 → 200 (U-A1) → 350 (U-A2) → 500 (U-A3) → 700 (U-A4)。
- **14 个付费 QoL 节点**：路线图 v6；材料均为现有 `items.json` id。

### 6.0 路线发现与三选一开局

- **首档三选一**：新档首次打开扩建层时，仅在 **`route_pick.route_starts`**（默认 U-A1 / U-C1 / U-B1）中 **选一条** 登记为 `initial_route_id`；其余两条路线 **不进入发现列表**。
- **未发现 = 完全隐藏**：扩建列表只渲染 `discovered_upgrade_ids` 中的节点（及已完成、施工中节点）；未发现的终局项（冷藏、远驿等）**不出现在 UI**。
- **完成后发现下一环**：某节点完工后，凡 **`requires` 全部满足**（除 A0）且尚未发现的节点，写入 `discovered_upgrade_ids`（汇合点如 U-F1 须双前置皆完成才出现）。
- **旧档兼容**：已有 `unlocked_upgrade_ids` 或进行中工程、但 `discovered_upgrade_ids` 为空时，读档自动回填发现列表并标记 `initial_route_picked`。

### 6.1 节点速查

| id | 名称 | 要点 |
|----|------|------|
| U-A1～A4 | 扩仓 I～IV | 格位阶梯 |
| U-C1 | 顺手存取 | 双击快存/取 |
| U-B1 | 一键理仓 | 压空+排序+邻接 |
| U-C2 | 估格整备 | 批量存入预览 |
| U-D1 | 仓内账册 | 筛选统计预警 |
| U-F1 / F3 | 常备套 / ×3 | loadout |
| U-F2 | 工料仓 | 设施扣仓（§7） |
| U-E1 | 封签与星标 | 锁定/星标 |
| U-G3 | 冷藏 | 整仓冻结腐败计时 |
| U-C3 | 饱和取出 | 取满四容器 |
| U-G1 | 分栏视图 | Tab |
| U-G2 | 远驿 | 地牢临时开仓（§8） |

---

## 7. 工料仓（U-F2）与生产扣料

- 接入烹饪 / 农业 / 制药 / 制肥等 **设施制作** 时，扫描库存：**人物四容器 + `hideout_warehouse`**。
- **玩家可选「优先扣仓」**（设置或单次勾选）；未勾选时按现有规则先扫身上容器。
- 农业扣物入口仍走 **`AgriculturePlayerItems`** 统一枚举，扩展 `hideout_warehouse` 源，**禁止**农业 UI 私写扣仓逻辑（见 [28-agriculture-irrigation.md](28-agriculture-irrigation.md) §16.3）。

---

## 8. 远驿（U-G2）

| 项 | 口径 |
|----|------|
| **剧情** | `requires_story: true`；须 **U-A4** + 剧情条件（flag/NPC 事件，待策划）。 |
| **有效期** | **当次地牢有效**（进入地牢至撤离/死亡/离开地牢即失效）。 |
| **权限** | **能存、不能取**：地牢内仅允许 **存入** 至 `hideout_warehouse`，**禁止取出** 到身上。 |
| **仓内容** | 仍为同一存档字段，与藏身处看到的是 **同一仓库**。 |

---

## 9. 腐败与冷藏（U-G3）

### 9.1 模板字段

- **`spoilage_ticks`**（物品模板）：`0` = 不腐败；`> 0` = 可腐败，上限 tick 数。
- **实例字段（计划）**：**`spoilage_elapsed_ticks`**（仅可腐败实例）。

### 9.2 计时规则

| 场景 | `spoilage_elapsed_ticks` |
|------|--------------------------|
| 游戏未运行（关客户端） | **不推进**（全局冻结） |
| 仓内、**未升 U-G3** | **照常计时** |
| 仓内、**已升 U-G3（冷藏）** | **整仓冻结**（不递增 elapsed） |
| 取出后 | **继续计时**；**不补算** 离线期间 elapsed |

> 冷藏为 **整仓** 生效，非单独冷藏格子分区。

---

## 10. 存档结构（草案）

```json
{
  "hideout_warehouse": {
    "capacity": 100,
    "slots": [ /* 格数组：完整物品实例或 null */ ],
    "unlocked_qol_ids": [],
    "unlocked_upgrade_ids": [],
    "discovered_upgrade_ids": [],
    "initial_route_picked": false,
    "initial_route_id": null,
    "settings": {
      "prefer_deduct_warehouse": false
    }
  }
}
```

- 与 **`InventoryEquipment`**、世界 **Storage** 分字段；读写入口建议 **`js/hideout-warehouse.js`**（待建）。
- **不随** 无意义的 `saveGeneration` 回滚而单独回滚（与当前单档约定一致）。

---

## 11. 调试仓（过渡期）

见 **`.cursor/rules/base-warehouse-agent.mdc`**：

- `annotations: "仓库"` + `modal-base-warehouse`：**无限从 items 表取 1**，不扣仓库存。
- 与 **`hideout_warehouse`** 并存期间，UI/文案应区分「调试取物」与「账号仓库」。
- 真仓就绪后，调试入口可移除或仅限开发 flag。

---

## 12. 实现索引

| 职责 | 路径 |
|------|------|
| 设计正本 | 本文件 |
| 分 Agent Prompt 包 | `docs/design/hideout-warehouse-port-agent-prompts.md`（W0～W9、全局约束） |
| UI 外部 Agent Prompt | `docs/design/hideout-warehouse-ui-agent-prompt.md` |
| UI 视觉参照（只读） | `reference/code_artifact.html` |
| 升级数据 | `data/warehouse-upgrades.json` |
| 路线图 HTML | `warehouse-upgrade-roadmap.html` |
| 人物栏放入顺序 | `05-character-attributes.md` §5.5.5 |
| 死亡不清仓 | `03-death-and-insurance.md` |
| 农业扣物扩展 | `28-agriculture-irrigation.md` §16.3 |
| 调试仓规则 | `.cursor/rules/base-warehouse-agent.mdc` |
| 运行时（待建） | `js/hideout-warehouse.js`、`js/hideout-warehouse-panel.js` |
| 场景胶水（待接） | `js/scene-app.js`（面板 open/close、NPC 菜单、tick 钩子） |

---

## 13. 验收清单（首版 MVP）

1. **默认开放**（§4）：新档无需 A0/剧情 flag 即可通过仓库 NPC 开仓、存取；100 格，`deposit_auto_stack` 生效。（A0 为扩建前置占位，首版运行时默认视为已满足，见 §4.1；勿因 A0 未显式解锁而阻断开仓。）
2. `stack_limit > 1` 物品可同格叠；装备实例完整存取，未鉴定状态保留。
3. 存入/取出不改变 \(W\) 判定（仓不受负重限制）。
4. 面板内扩建扣材料 + tick，容量与 QoL 与 JSON 一致。
5. 死亡后仓内容不变；身上容器清空。
6. 关游戏再开：腐败 elapsed 不补算离线 tick。
7. U-G3 后仓内腐败冻结；取出后继续计。
8. U-G2：地牢内仅存入；当次地牢结束权限失效。
9. U-F2：制作可选优先扣仓。
10. 展示与背包 tooltip 一致（传 `character`）。
