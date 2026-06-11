# 潮碧物语 — 完整设计文档

本文档为设计总览与入口；详细内容已按模块拆分为独立文件，便于实现时按需查阅。

---

## 总览与模块索引

完整的设计哲学摘要、主设计文档模块表、**贸易与旅行商人（capitalism）子模块表**及实现模块清单，见：

- **[docs/design/00-index.md](docs/design/00-index.md)**

---

## 主设计模块（docs/design/）

| 模块 | 文件 |
|------|------|
| 设计哲学 | [01-philosophy.md](docs/design/01-philosophy.md) |
| 区域结构 | [02-regions.md](docs/design/02-regions.md) |
| 死亡与投保 | [03-death-and-insurance.md](docs/design/03-death-and-insurance.md) |
| 实战经验 | [04-combat-exp.md](docs/design/04-combat-exp.md) |
| 角色基础属性 | [05-character-attributes.md](docs/design/05-character-attributes.md) |
| 生存属性 | [06-survival.md](docs/design/06-survival.md) |
| 战斗核心 | [07-combat-core.md](docs/design/07-combat-core.md) |
| 命中招架与伤害 | [08-hit-parry-damage.md](docs/design/08-hit-parry-damage.md) |
| 身体部位与状态 | [09-body-parts.md](docs/design/09-body-parts.md) |
| 敌人设计 | [10-enemies.md](docs/design/10-enemies.md) |
| 技能系统 | [11-skills.md](docs/design/11-skills.md) |
| 经脉与穴位系统 | [12-meridians-and-acupoints.md](docs/design/12-meridians-and-acupoints.md) |
| Buff / Debuff 系统 | [18-buff-system.md](docs/design/18-buff-system.md) |
| 动作系统 | [19-action-system.md](docs/design/19-action-system.md) |
| **贸易与旅行商人** | 见 [00-index.md](docs/design/00-index.md) 第三节「贸易与旅行商人（capitalism 子模块）」 |
| 玩家间交易 | [13-p2p-trading.md](docs/design/13-p2p-trading.md) |
| 实现约定 | [14-implementation.md](docs/design/14-implementation.md) |
| 启动加载与解耦约定（实现补充） | [17-loading-and-decoupling.md](docs/design/17-loading-and-decoupling.md) |
| 后续可补充 | [15-todo.md](docs/design/15-todo.md) |
| **实现进度快照（仓库对照）** | [docs/implementation-progress.md](docs/implementation-progress.md) |

---

## 贸易与旅行商人（capitalism）

贸易与旅行商人的完整设计位于 **capitalism** 目录，不在此处重复。各文件路径与内容说明见 **docs/design/00-index.md** 第三节「贸易与旅行商人（capitalism 子模块）」表（12.1～12.6）。

---

## 肢体损毁值上限（速查）

与 **`docs/design/09-body-parts.md`**「各部位损毁值上限」表一致，数值以 **`data/survival-config.json`** 的 **`body_part_destroy_max`** 为运行时单一数据源（缺键时按模块内设计回退）。

| 部位 | 损毁值上限 |
|------|-----------|
| 头 | 50 |
| 胸 | 100 |
| 腹 | 80 |
| 左手 / 右手 | 各 100 |
| 左脚 / 右脚 | 各 100 |

**ID 约定（实现）**：存档与 `CharacterAttributes` 使用 **`head` / `chest` / `abdomen` / `lhand` / `rhand` / `lfoot` / `rfoot`**；战斗命中部位 `abdomen` 与侧栏 UI 标签 **`belly`（腹）** 同指，查询时做别名映射。

---

*文档版本：按模块拆分后，主文档为总览与索引；正文见 docs/design/ 与 capitalism/。*
