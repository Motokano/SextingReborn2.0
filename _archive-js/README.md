# _archive-js — 未接线探索产物归档（scene-app 组合根化拆解 ③-2）

> 这些代码从未被 `index.html` 加载（或从未被任何模块引用），属历史探索/备用实现。
> 归档而非删除：保留 git 历史可追溯，需要时可 `git mv` 回 `js/` 恢复。**不作为活跃代码维护**。

| 路径 | 原位置 | 说明 |
|------|--------|------|
| `game-state-core.js` | `js/core/` | 「框架无关状态核心」探索件，0 引用（`js/core/tile-renderer-v2.js` 仍在用，未归档） |
| `svelte/` | `svelte/dialogue/` | Svelte 对话视图原型（docs/migration 探索方向），未编译未加载；运行时对话走 React 版 |
| `trade/` | `js/trade_*.js` | P2P 交易/资本主义 UI 探索实现（docs/design/13 + capitalism 设计文档仍在），簇内互引、无外部引用 |

关联：`docs/design/00-index.md` §二·C、`docs/scene-app-decomposition.md` 执行日志。
