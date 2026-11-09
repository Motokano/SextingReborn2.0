# 启动加载结构与“彻底解耦”约定（实现补充）

本文件补充说明当前实现的**文件加载结构**、**启动入口**、以及用于保证“文案/变量不脱钩”的**强校验机制**。

---

## 1. 目标（面向实现）

- **HTML 纯壳**：`index.html` 仅保留结构与挂载点，不写死任何面向玩家的文本。
- **文案数据化**：所有 UI 文案来自 `/data/`（当前为 `data/ui_text_zhCN.json`）。
- **强校验**：缺失 key 时必须**立即失败**（throw），避免“静默空文本/错位文案”导致隐性脱钩。
- **单一启动入口**：集中化控制启动顺序与扩展点，避免多个脚本各自启动产生竞态。

---

## 2. 文件与职责

### 2.1 `index.html`（结构壳）

- 只包含 DOM 结构与样式。
- 通过以下属性声明需要注入的文案 key：
  - `data-ui="key"`：注入到 `textContent`
  - `data-ui-attr="attrName"`：把 `data-ui` 对应 key 注入到指定属性（如 `placeholder`/`title`）
  - `data-ui-title="key"`：注入到 `title`
  - `data-ui-aria="key"`：注入到 `aria-label`

### 2.2 `data/ui_text_zhCN.json`（文案字典）

- key → 文案字符串。
- 支持简单模板：`{name}`、`{v}` 等占位符由代码传参替换。

### 2.3 `js/ui-text.js`（UI 文案注入器，强校验）

提供全局 `window.UIText`：

- `UIText.setDict(dict)`：设置文案字典（必须是对象）
- `UIText.t(key, vars?)`：取文案（缺 key 直接 throw）
- `UIText.applyDom(root?)`：扫描 `[data-ui]` 并注入；任意节点失败会抛出带节点信息的错误

### 2.4 `js/scene-app.js`（纯接线入口，2026-11-08）

- 只按 [职责清单](../architecture/scene-modules.json) 调用所有模块的 `initialize()`，再调用所有模块的 `bind()`；不定义业务函数、规则、状态或回调。
- `js/scene/startup.js` 负责启动时序和依赖接线，`config.js` 负责配置装载，`session.js` 负责角色恢复，其他动作与界面按职责独立维护。
- `js/scene/public.js` 只绑定旧的 `SceneApp.init/loadConfig/render` 等兼容接口；文案适配由 `SceneFeedback` 拥有。
- 不得把接线模块变为替代主文件。完整约束及自动检查见 [场景入口规则](../architecture/scene-entry.md)。

### 2.5 `js/bootstrap.js`（单一启动入口 + 扩展挂点）

- 负责 DOM 就绪后启动应用：调用 `SceneApp.init()`。
- 具备强保护：
  - 防重复启动：`window.__APP_BOOTED__`
  - 失败可见：渲染 “BOOT FAILED” 覆盖层并抛错中止
- 提供稳定扩展点（后续模块无需改启动链路）：
  - `window.AppBoot.addBeforeStart(fn)`
  - `window.AppBoot.addAfterStart(fn)`

---

## 3. 启动顺序（高层）

1. 浏览器加载脚本（顺序由 `index.html` 控制）
2. `bootstrap.js` 在 DOMReady 时执行：
   - 检查 `SceneApp` 等关键全局存在
   - 执行 `AppBoot.beforeStart` hooks
   - 调用 `SceneApp.init()`
   - 执行 `AppBoot.afterStart` hooks
3. `SceneApp.init()` 内部流程（简化）：
   - `loadConfig()` 拉取 `data/ui_text_zhCN.json` 并 `UIText.setDict`
   - `UIText.applyDom(document)` 注入所有 `[data-ui]`（缺 key 直接失败）
   - 加载其余 `data/*.json` 配置并初始化系统

---

## 4. 扩展约定（新增模块不破坏启动）

新增模块时，必须遵守 [场景入口规则](../architecture/scene-entry.md)，并且：

- 场景模块在两个登记入口页面同步加载，放在 `scene-app.js` 之前；入口再先于 `bootstrap.js`。新增模块、公开接口、依赖和验证须更新职责清单。
- 使用 `AppBoot.addBeforeStart/AfterStart` 注册启动逻辑，不要直接在模块文件顶层调用 `init()`。
- 所有新增 UI 文案必须进入 `data/ui_text_zhCN.json`，并通过 `UIText.t()`/`ui()` 获取。
- 若模块引入新 `[data-ui]` 节点，必须保证字典 key 齐全；否则启动会主动失败，避免隐性脱钩。

---

