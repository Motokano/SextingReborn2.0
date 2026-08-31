## 一、设计目的

本模块定义**经脉与穴位系统**，用于在不改变核心战斗流程的前提下，为角色提供一条长期、稳定的数值成长线：

- 通过点亮经脉上的各个穴位，角色可以逐步提升**底气可容纳上限**与**后天五维**（筋骨 / 柔韧 / 呼吸 / 身手 / 专注）。
- 通过打通任脉、督脉与全部经脉，角色可以获得少量但极为稀有的**先天五维**加成。
- 经脉与穴位系统本身**不新增即时战斗指令**，只作为被动成长来源接入现有战斗与生存公式。

经脉与穴位的具体数据来源为策划表 `docs/穴位.csv`，本文件主要约定**设计与实现口径**。

---

## 二、核心概念

### 2.1 先天 / 后天五维

角色的五项基础属性为：**筋骨、柔韧、呼吸、身手、专注**（详见 `05-character-attributes.md`）。每一项都拆分为：

- **先天值**：角色创建时分配的基础值，通常仅能通过极少数特殊手段提升。
- **后天值**：来自技能、装备、buff、经脉穴位等所有外在成长来源。

在任何数值公式中，使用的都是：

- **实际值 = 先天值 + 后天值**

本模块约定：

- 穴位表中标记的“**后天筋骨+2**”“**后天柔韧+2**”等，**一律计入后天五维**。
- 任督与全通成就赠送的“**先天五维+1**”，**一律计入先天五维**。

### 2.2 底气与底气上限

底气在本作中为可消耗的战斗与修行资源（详见呼吸与战斗相关条目）。底气有两层含义：

- **当前底气值 `qi`**：可消耗的即时资源。
- **底气可容纳上限 `maxQi`**：当前呼吸法与各类加成下可容纳的最大底气。

经脉与穴位系统只修改 **`maxQi`**，不直接干预当前底气 `qi` 的恢复或消耗逻辑：

- 穴位效果中的“**底气上限+10**”被严格解释为：**底气可容纳上限 `maxQi` +10**。

### 2.3 经脉与穴位

- **经脉（Meridian）**：
  - 包含：督脉、任脉与十二正经（手太阴肺经、手阳明大肠经、足阳明胃经等）。
  - 每条经脉有固定的穴位顺序，用于 UI 展示与成就统计。

- **穴位（Acupoint）**：
  - 隶属于某一条经脉。
  - 每个穴位对应一组数值效果（如“底气上限+10，后天筋骨+2”）。
  - 可被玩家通过消耗“点穴点数”等资源**点亮 / 激活**。

具体名单与效果配置全部维护在策划 CSV：`docs/穴位.csv`。

---

## 三、数据结构与存储形式（面向实现）

本节只约定**字段语义与映射关系**，不强制具体编程语言。以下示意使用 TypeScript/JavaScript 风格。

### 3.1 角色数据（节选）

```ts
type FiveStats = {
  // 先天五维
  baseBone: number;    // 先天筋骨
  baseFlex: number;    // 先天柔韧
  baseBreath: number;  // 先天呼吸
  baseAgility: number; // 先天身手
  baseFocus: number;   // 先天专注
  // 后天五维
  bone: number;
  flex: number;
  breath: number;
  agility: number;
  focus: number;
};

type Character = {
  id: string;
  name: string;

  // 底气
  maxQi: number; // 底气可容纳上限
  qi: number;    // 当前底气值

  stats: FiveStats;

  // 穴位系统
  acupointPoints: number;      // 可用点穴点数
  unlockedAcupoints: string[]; // 已点亮穴位 id 列表

  // 经脉成就状态（只结算一次）
  renCompleted: boolean;          // 任脉已全通
  duCompleted: boolean;           // 督脉已全通
  renDuBonusGiven: boolean;       // 任督俱通奖励已发放
  allCompletedBonusGiven: boolean;// 全部穴位全通奖励已发放
};
```

实现时，`Character` 的其他字段（生命、体力、装备、技能等）按各自模块定义；本节只关心与经脉穴位直接相关的部分。

### 3.2 经脉与穴位数据

```ts
type AcupointEffect =
  | { type: "maxQi"; delta: number }   // 底气上限 +delta
  | { type: "bone"; delta: number }    // 后天筋骨 +delta
  | { type: "flex"; delta: number }    // 后天柔韧 +delta
  | { type: "breath"; delta: number }  // 后天呼吸 +delta
  | { type: "agility"; delta: number } // 后天身手 +delta
  | { type: "focus"; delta: number };  // 后天专注 +delta

type Acupoint = {
  id: string;             // 内部唯一 id，如 "du_changqiang"
  name: string;           // 中文名，如“长强”
  meridianId: string;     // 隶属经脉 id，如 "du"
  effects: AcupointEffect[];
  unlockCost: number;     // 点亮消耗（如默认 1）
};

type Meridian = {
  id: string;         // 经脉 id，如 "du", "ren", "lu", "li", ...
  name: string;       // 经脉中文名，如“督脉”
  category: string;   // 经脉分类：督脉 / 任脉 / 十二正经-手太阴肺经 等
  acupointIds: string[]; // 该经脉下所有穴位 id（按顺序）
};
```

### 3.3 与 CSV 的字段映射

`docs/穴位.csv` 中的字段建议保持为：

- `经脉分类` → `Meridian.category`
- `经脉`       → `Meridian.name` / `Meridian.id`（实现时可通过映射表把中文名映射到简写 id，如 “督脉” → `"du"`）
- `穴位`       → `Acupoint.name`
- `效果`       → 解析为 `Acupoint.effects`：
  - “底气上限+10，后天筋骨+2” →  
    `[{ type: "maxQi", delta: 10 }, { type: "bone", delta: 2 }]`

导入流程可在实现阶段通过脚本完成，不在本文展开。

---

## 四、点穴玩法循环

经脉与穴位系统围绕一个简单的“点穴”循环展开：

1. **获得点穴点数（Acupoint Points）**
   - 主要来源：升级、任务奖励、战斗掉落等，由经验与经济系统决定。
   - 本模块仅约定存在一个整数资源 `acupointPoints`，每点可用于点亮一个或多个穴位（取决于 `unlockCost`）。

2. **浏览经脉与穴位树**
   - UI 以“经脉”为一级入口（督脉 / 任脉 / 各条十二正经）。
   - 选中某条经脉后，展示该经脉上的全部穴位，区分：
     - 已点亮穴位（高亮）
     - 未点亮穴位（灰显，显示所需点数与效果摘要）

3. **点亮穴位**
   - 玩家在 UI 中点击某个未点亮穴位：
     1. 校验是否已解锁 / 是否有足够 `acupointPoints`；
     2. 扣除对应点数；
     3. 将该穴位 id 加入 `unlockedAcupoints`；
     4. 按该穴位的 `effects` 更新角色数值（`maxQi` 与后天五维）。

4. **经脉成就与全通奖励（见下一节）**
   - 每次成功点亮穴位后，系统都会重新检查任脉、督脉以及全部穴位的完成情况，并在首次达成某一成就时发放对先天五维的加成。

整个系统设计为**可随时扩展**：后续可以增加更多经脉、额外效果类型或新的成就层级，而不改变现有基础逻辑。

---

## 五、任督与全通成就规则

本节约定“打通任督二脉”与“全经脉全部打通”时的**先天五维奖励**逻辑，供数值与实现统一口径。

### 5.1 成就触发条件与奖励一览

1. **任脉全通**
   - 条件：任脉（`meridianId = "ren"`）下的所有穴位全部出现在 `unlockedAcupoints` 中。
   - 奖励：**先天五维各 +1**（筋骨 / 柔韧 / 呼吸 / 身手 / 专注）。
   - 实现标记：`renCompleted = true`。

2. **督脉全通**
   - 条件：督脉（`meridianId = "du"`）下的所有穴位全部出现在 `unlockedAcupoints` 中。
   - 奖励：**先天五维各 +1**。
   - 实现标记：`duCompleted = true`。

3. **任督二脉俱通**
   - 条件：`renCompleted = true` 且 `duCompleted = true`，且尚未发放任督成就奖励。
   - 奖励：**先天五维各再 +1**。
   - 实现标记：`renDuBonusGiven = true`。

4. **全部穴位全通**
   - 条件：所有经脉的全部穴位都被点亮，例如：
     - `unlockedAcupoints.length === 全部穴位总数`。
   - 奖励：**先天五维各再 +1**。
   - 实现标记：`allCompletedBonusGiven = true`。

> 若玩家最终点亮全图，累计获得的先天五维加成为：  
> 任脉全通（+1）+ 督脉全通（+1）+ 任督俱通（+1）+ 全穴位全通（+1） = **先天五维各 +4**。

### 5.2 实现约定（伪代码）

以下为成就检测的伪代码示意，用于实现时对齐逻辑：

```js
function addInnateFiveStats(character, delta) {
  character.stats.baseBone   += delta;
  character.stats.baseFlex   += delta;
  character.stats.baseBreath += delta;
  character.stats.baseAgility+= delta;
  character.stats.baseFocus  += delta;
}

function checkMeridianCompleted(character, meridianId, meridiansById) {
  const mer = meridiansById[meridianId];
  if (!mer) return false;
  return mer.acupointIds.every(id => character.unlockedAcupoints.includes(id));
}

function checkMeridianAchievements(character, meridiansById, allAcupointCount) {
  // 任脉完成
  if (!character.renCompleted && checkMeridianCompleted(character, "ren", meridiansById)) {
    character.renCompleted = true;
    addInnateFiveStats(character, 1);
  }

  // 督脉完成
  if (!character.duCompleted && checkMeridianCompleted(character, "du", meridiansById)) {
    character.duCompleted = true;
    addInnateFiveStats(character, 1);
  }

  // 任督二脉俱通
  if (character.renCompleted && character.duCompleted && !character.renDuBonusGiven) {
    character.renDuBonusGiven = true;
    addInnateFiveStats(character, 1);
  }

  // 全穴位全通
  if (!character.allCompletedBonusGiven &&
      character.unlockedAcupoints.length === allAcupointCount) {
    character.allCompletedBonusGiven = true;
    addInnateFiveStats(character, 1);
  }
}
```

上述函数应在**每次成功点亮穴位后**调用一次，确保成就即时结算且不会重复发放。

---

## 六、与战斗及其他系统的关系

### 6.1 与角色属性系统（05-character-attributes.md）

- 本模块只是**新增了一种“后天属性来源”与少量“先天属性来源”**：
  - 穴位效果中的“后天筋骨+2”等，计入五维的**后天部分**；
  - 任督与全通成就中的“先天五维+1”，计入五维的**先天部分**。
- 其他关于属性上限、创建分配、成长曲线与门槛等规则，全部以 `05-character-attributes.md` 为准。
- 在任何公式中，仍然只使用“先天 + 后天”合计值作为输入；经脉与穴位系统不改动这些公式，只是影响其输入参数。

### 6.2 与战斗核心（07-combat-core.md）

- 战斗核心只关心**最终属性值**（如实际筋骨、实际柔韧、实际呼吸、实际身手等）以及衍生的速度、伤害、减伤、底气上限、恢复速度等。
- 经脉与穴位系统通过：
  - 提高底气上限 `maxQi` → 增强战斗中的技能续航能力；
  - 提高后天五维 → 间接提升伤害、减伤、命中率、负重与学习效率；
  - 提高先天五维 → 影响所有只看先天的门槛规则（如武器先天筋骨要求与惩罚区）。
- 战斗流程（行动顺序、命中判定、减伤链等）**不因为经脉与穴位系统而改变**。

### 6.3 与其他系统

- **技能系统（11-skills.md）**：后续可选地在技能前置条件中加入“某条经脉贯通度”或“特定穴位已点亮”作为解锁条件，本模块不做强制约束。
- **身体部位与状态（09-body-parts.md）**：可在未来扩展为“特定部位严重损毁时，暂时封印相关经脉/穴位效果”，本版本中默认不实现封穴逻辑。

---

## 七、小结

- 经脉与穴位系统为角色提供一条**长期且明确可见的数值成长路径**，核心作用是：
  - 用小步长的被动加成为底气上限与后天五维提供逐穴成长；
  - 用极少数里程碑成就为先天五维提供稀有增强。
- 该系统的数据完全来源于 `docs/穴位.csv`，实现时只需将其映射为统一的经脉/穴位数据结构，并在点穴时按本文约定更新角色属性与成就状态。
- 其余战斗与生存公式不因本模块而改变，只是多了一个数值来源。

