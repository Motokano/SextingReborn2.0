# 三档地痞正式接入

2026-10-31，用户确认按首版方案实装。本文覆盖单体设计稿与箭步视觉验收时的“尚未实装”状态；冻结视觉记录保留历史原文。

## 战斗模板

`data/combat-enemies.json` 新增 `enemy.street_thug_tier1`、`enemy.street_thug_tier2`、`enemy.street_thug_tier3`，分别60／80／100级，底气200／300／400，普通招式底气6／8／10、气力均25。七部位血量、五维、护体、招架、熟练标定按前两档与第三档设计稿。旧 `enemy.street_thug` 保留以读取存量地图。

三档均不催气。混混按摆拳60、戳眼20、踹膝20权重选合法动作，避免重复已有减益；打手和老练优先墙边推搡、未生效戳眼、未生效踹膝、摆拳，伤残后从剩余合法动作降级选择。各招仍执行真实肢体、支撑、气力、底气检查，不按固定肢体循环。

普通回底气0.3／0.4／0.5每tick；未出招的tick回复50气力。底气不足普通攻击时调息到两次普通费用，回到驻地可调息至满；调息回复13／20／28底气，当tick受伤则本次调息无收益，调息不招架。资源付款与普通战斗管线共用预约提交，避免同时出招或多段处理时重复扣费。

## 箭步

仅第三档，零费用、无准备轮，不额外推进世界tick，也不占用或刷新普通攻击机会。目标须在自身视野内，八方向格距不超过4；实际路线最多4步，包含落点、不含起点。最短路抵达目标可近战邻格，斜向两侧均需畅通，关闭门、墙、家具、资源、单位均不能穿越。共享警戒不能替代自己看见目标。

成功提交时记录 `dashReadyTick = 当前世界tick + 6`；失败不进入冷却。腿伤、眩晕、移动禁用、正在调息均阻止发动。零资源时仍能箭步，落地能否出招另外检查，禁止免费攻击。已经用掉本tick攻击机会时，箭步不补回。

正式事件 `combat:dash` 包含每个真实途经格。`js/combat-fx-dash-runtime.js` 复用未更改的 `js/combat-fx-dash.js`，保留蹬地、两道淡残影、沿路径尘土和刹步，1.5倍速度、144px棋格、125%人物。视觉队列在落地后衔接实际攻击；演出不延迟或重复游戏结算，切图／读档清除旧演出。

## 独立人数与配置

正式源为 `data/street-thug-spawn.json`，由 `data/dungeon-config.json.populationSource` 指定。房外12±20%，房型范围见[人数表](street-thug-floor-distribution.md)，使用首版表；每个房间独立抽取，不套用房外浮动。无门、缺墙、无墙房仍属房内。

人数修正可从该配置的 `modifierSources`、地牢配置 `populationModifiers`、门票 `populationModifiers` 和入场参数 `populationModifiers` 合成。示例：

```json
{
  "populationModifiers": {
    "nonRoom": {"multiplier": 1.25},
    "rooms": {"add": 1},
    "profiles": {"workshop": {"add": 1}}
  }
}
```

同一范围的加值求和、倍率相乘，先修正并取整再抽数量。`all` 同时作用房内外一次，`nonRoom` 只改室外，`rooms` 只改房内，`profiles` 指定房型。最大值原本为0的无敌人房／废弃状态仍为0；0～1的零散占用房应用+1后为1～2。当前未新增门票物品或词条UI。

四层权重8:2:0、3:3:3、2:5:3、1:6:3，按每个普通敌人抽取，不强制小房组成。头目独立60%且只有0／1，专属小屋固定，不扣普通额度。普通敌人不再充当大型房与头目的供体。人数使用独立稳定随机通道；站位需保留门口、必要通路、搜索点操作位，无法完整布置则重试或明确失败，不偷偷减人数。

新出征保存人数配置快照；已生成敌人的位置、档位、资源、伤势和箭步冷却存档恢复。旧出征无配置快照时继续旧规则，不重排已生成内容。正式掉落按用户安排后补。

## 验收

- `tools/test-street-thug-tiers.mjs`：三档属性、费用、调息、箭步范围／绕障／冷却／腿伤，真实世界tick移动→攻击→FX顺序、重复tick与已用攻击机会、四层生成和存档。
- `tools/test-street-thug-boss.mjs`：既有头目数值、AI、催气、扯领膝撞、部署与撤离回归。
- `tools/test-enemy-body-runtime.mjs`：真实七部位交战与读档回归。
- `tools/test-combat-fx-dash.mjs`、`tools/test-combat-fx-playback.mjs`、`tools/test-combat-fx-demo-parity.mjs`：路径、时序和既定攻击画面回归。

实景入口 `tools/combat-dash-runtime-check.html`，完整楼层入口 `tools/street-thug-boss-room-generation.html`。均采用隔离内存，不改用户存档。前者含直线／绕障、零资源、腿伤、三档切换；后者显示房内外人数与三档实际数量。
