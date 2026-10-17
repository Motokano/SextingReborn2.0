# 技能装配窗口

用户确认的四肢对照表、肌群总览和双列肌肉列表使用同一 CombatPanel。默认游戏加载独立的 `assets/ui/combat-loadout.js`，不依赖其他 HUD 的迁移；若完整 Svelte 面板已经挂载，独立入口自动让出所有权。

```sh
npm ci
npm run check:combat-ui
npm run build:combat-ui
npm run test:combat-ui
```

修改 `ui/src/features/CombatPanel.svelte` 或相关 runtime 后重新构建，并一同提交源代码与生成文件。构建保留 assets/ui 下的其他资源。主入口在 js/scene-app.js 之后、bootstrap.js 之前加载窗口脚本；读取真实配置需等待 AppBoot.afterReady。

界面材质仅放在 `css/combat-loadout.css`。SceneApp.combatApi 保留原装配、关闭和时间消耗规则；Muscles 与 InventoryEquipment 继续持有进度和存档数据。详见[界面定稿记录](../docs/design/skill-loadout-ui.md)。

回归测试用隔离内存存储加载正式脚本与本地数据，覆盖入口所有权、前置技能、呼吸法耗时、肌肉解锁、属性加成、被动唯一性、分页、嵌套关闭和存档恢复；不访问用户存档。
