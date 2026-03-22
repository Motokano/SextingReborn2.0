# Svelte UI 重写说明（对话组件）

本次基于你现有 React 组件 `js/dialogue-react-view.js`，提供了等价 Svelte 版本。

## 新增文件

- `svelte/dialogue/DialogueAvatar.svelte`
- `svelte/dialogue/DialogueActions.svelte`
- `svelte/dialogue/DialogueOptions.svelte`
- `svelte/dialogue/dialogue-svelte-view.js`

## 设计原则

- 行为对齐原 React 版本（头像 fallback、按钮回调、选项点击）。
- 继续复用 `DialogueUI` 现有调用方式：`mount/render/unmount`。
- 业务状态仍在你已抽离的纯逻辑层；Svelte 组件只做渲染与事件转发。

## 接入步骤

1. 在你的 Svelte 构建入口引入 `dialogue-svelte-view.js`。
2. 在运行时将 `DialogueUI` 使用的视图实现替换为 Svelte 版本：
   - 临时兼容方式：`window.DialogueReactView = window.DialogueSvelteView`
3. 移除 `index.html` 中 React/ReactDOM 及 `js/dialogue-react-view.js` 脚本。

## 备注

- 该目录是迁移代码，不影响当前老页面直接运行（老页面依然可继续走 React 版本）。
- 完整迁移后，建议把 `DialogueReactView` 命名彻底改为 `DialogueView`，避免历史命名误导。
