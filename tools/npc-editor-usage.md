## NPC 编辑器使用说明（`tools/npc-editor.html`）

本说明对应当前仓库内的 NPC 编辑器页面：`tools/npc-editor.html`。它用于制作两类数据：

- **NPC 基础数据**：导出到 `data/npc/<npcId>.json`
- **NPC 触发事件（triggers）**：导出到 `data/npc/<npcId>_triggers.json`

同时支持一键更新 `data/npc/npc_registry.json`（NPC 注册表）。

---

## 打开方式与基本约定

- **打开**：用浏览器打开 `tools/npc-editor.html`
- **导出文件命名**：编辑器会把 `npc.id` 里的 `.` 替换成 `_` 作为文件名的一部分（与注册表一致）。
- **保存位置（重要）**：你下载出来的 JSON 需要手动放入项目目录：
  - NPC 本体：`data/npc/`
  - NPC 事件：`data/npc/`
  - 注册表：`data/npc/npc_registry.json`

---

## 0. 5 分钟上手（最短成功路径）

1. 打开 `tools/npc-editor.html`
2. 点击 **「新建 NPC」**
3. 在左侧填写：
   - **ID（唯一）**：例如 `npc.supervisor.linShuyao`
   - **姓名 / 称呼**
   - **出现时间与位置**：`appearanceSchedule`、`location.sceneId/x/y`
4. 右侧点击 **「+ 新增事件」**，在事件编辑区填写：
   - `id`（例如 `supervisor.firstTalk_01`）
   - 条件（推荐先用 `flagEquals` / `skillLevel*`）
   - 对话台词（至少 1 句）
   - 效果（可选）
5. 顶部依次点击导出：
   - **「导出 NPC 数据」** → 放入 `data/npc/`
   - **「导出事件」** → 放入 `data/npc/`
   - **「一键更新注册表」** → 覆盖/合并生成 `npc_registry.json`，放入 `data/npc/`
6. 回到游戏（建议用本地静态服务器打开 `index.html`），验证 NPC 是否出现、闲聊是否触发。

---

## 1. 新建 / 导入 NPC

### 新建 NPC

点击顶部 **「新建 NPC」**。

### 新建 NPC 文件夹

点击 **「新建 NPC 文件夹」**，按当前 NPC 的 **ID** 创建（如 `npc.supervisor.linShuyao` → `npc_supervisor_linShuyao`；会把 `.` 替换成 `_`）：

- `image/<npc_id>/`：对话头像
- `assets/npc/<npc_id>/`：地图形象（sprite）图片

需在弹窗中选择**项目根目录**（含 `image`、`assets` 的文件夹）。浏览器需支持 File System Access API（Chrome/Edge）。若不支持，会提示你手动创建上述目录。

建议你按顺序填：

- **ID（唯一）**：例如 `npc.supervisor.linShuyao`
- **姓名 / 称呼**：`name` 与 `displayTitle`
- **出现时间与位置**：
  - `appearanceSchedule.start / end`：例如 `09:00` ~ `17:30`
  - `location.sceneId`：例如 `base_main`
  - `location.x / y`：地图站位坐标
- **地图形象（sprite）**：填写图片路径，如 `assets/npc/<npc_id>/xxx.png`（用于地图上 NPC 形象）。可先点「新建 NPC 文件夹」创建目录。
- **主菜单**：是否显示「闲聊」「离开」（工作/任务入口目前 主场景 里未完整实现）
- **默认台词池**：`fallbackDialoguePoolId`（可选）
- **标签**：用于分类与筛选（可选）

### 导入 NPC（本地文件或粘贴）

顶部工具栏提供：

- **「从本地载入 NPC」**：选择一个 `data/npc/*.json`
- **「粘贴 NPC」**：把 NPC JSON 粘贴进弹窗

导入后会自动填充到表单。

---

## 2. 事件（Triggers）编辑：新增/选择/保存

右侧上半部分是事件列表（entries），下半部分是当前事件的编辑面板。

- **新增事件**：点击 **「+ 新增事件」**
- **选中事件**：点击左侧事件卡片
- **保存当前事件**：点击 **「保存当前事件」**
- **删除事件**：点击 **「删除此事件」**

事件的关键字段：

- `id`：条目唯一 ID（例如 `supervisor.firstTalk_01`）
- `entryType`：目前主要用 `dialogue`
- `entrySource`：目前主要用 `chat`（闲聊入口）
- `condition`：触发条件（见下）
- `repeatable`：是否可重复触发（不勾=一次性）
- `scope`：global/region/daily/weekly（当前 demo 主要按 global 理解）

---

## 3. 条件（Condition）怎么填

编辑器提供基础表单（推荐）：

- `flagEquals`：某个 flag 是否等于 true/false
- `skillLevelEquals`：某技能等级等于某数值
- `skillLevelGte`：某技能等级 ≥ 某数值
- `postEffectObtainedGte`：主角“已获得后遗症”的数量 ≥ 某个数值（一次性闲聊等用它筛选“至少有一个后遗症”）
- `hasItem`：背包持有物品（注意：当前 demo 运行时可能未完全接入）

也支持 **高级 JSON**：

- 勾选 **「高级：显示 JSON」** 或选择 **「自定义」** 后，直接编辑 JSON。

当前 demo 运行时（`js/npc-system.js`）还额外支持：

- `and / or / not` 组合条件
- `timeBetween`：`{ "type":"timeBetween","start":"09:00","end":"10:00" }`
- `timePeriodEquals`：`{ "type":"timePeriodEquals","value":"morning" }`（morning/noon/afternoon/evening）
- `postEffectObtainedGte` 示例：`{ "type":"postEffectObtainedGte","value":1 }`

---

## 4. 对话（Dialogue）编辑：linesRich 与头像

### 4.1 每句台词

对话以 **聊天记录** 方式编辑，不需要你手写 JSON。

每句包含：

- **说话人**：npc / player / narration
- **文本**：多行文本会按换行显示
- **头像（可选）**：
  - **头像路径**：例如 `image/林书瑶/01.png`
  - **选图**：选择一张图片用于预览，并自动填一个建议路径
  - **上传**：若浏览器支持 File System Access API，可直接写入 `/image/<npc_id>/`（以 NPC 的 `id` 生成文件夹名，`.` 会替换成 `_`）

导出时会写入：

- `dialogue.linesRich`: `[{ speaker, text, avatar? }, ...]`
- `dialogue.lines`: 纯文本数组（兼容旧逻辑）

### 4.2 一键全部使用同一张头像

在「台词」区域按钮行：

- 点击 **「一键全部用同一张头像」** 选择图片
- 默认勾选 **「仅 NPC 台词」**：只给 speaker=npc 的句子填头像
- 取消勾选后：所有句子都填同一头像

如果浏览器支持文件夹写入，会尝试把图片写入：

- `image/<npc_id>/<文件名>`（基于 NPC 的 `id`）

否则只会填好路径，你需要手动把图片放到对应目录。

---

## 5. 图片写入（/image/<npc_id>/）的注意事项

由于浏览器安全限制，网页不能“无权限写入你的项目文件夹”。

编辑器的“上传到 /image/”依赖 **File System Access API**：

- **Edge / Chrome** 一般可用
- 需要你在弹窗里**手动选择一次**你项目的 `image/` 目录（建议就选项目根目录下的 `image` 文件夹）
- 编辑器会在该目录下自动创建 `<npc_id>/` 子目录并写入图片（基于 NPC 的 `id`，`.` 替换为 `_`）

如果浏览器不支持，会提示你手动复制图片到项目目录。

---

## 6. 导出：NPC、本体事件、注册表

顶部工具栏：

### 导出 NPC 数据

- 点击 **「导出 NPC 数据」**
- 下载得到：`<npcId替换点为下划线>.json`
- 放入：`data/npc/`

### 导出事件（Triggers）

- 点击 **「导出事件」**
- 下载得到：`<npcId替换点为下划线>_triggers.json`
- 放入：`data/npc/`

### 一键更新注册表（npc_registry.json）

- 点击 **「一键更新注册表」**
- 可选择现有 `npc_registry.json` 来合并；也可以不选，直接生成新文件
- 生成文件放入：`data/npc/npc_registry.json`

注册表结构示例：

```json
{
  "npcs": {
    "npc.supervisor.linShuyao": {
      "def": "data/npc/npc_supervisor_linShuyao.json",
      "triggers": "data/npc/npc_supervisor_linShuyao_triggers.json"
    }
  }
}
```

---

## 8. 常见校验错误与运行时限制（重要）

### 8.1 导出 NPC 时提示红色错误

编辑器会在左侧顶部显示错误汇总，常见原因：

- **NPC ID 为空/包含空格**：修正 `npc.id` 后再导出。
- **时间格式不对**：应为 `HH:MM`（如 `09:00`）。新版编辑器已优先使用原生 time 输入，但仍建议保持该格式。

### 8.2 导出事件时提示 `hasItem` 条件不触发

当前 demo 运行时 `js/npc-system.js` 的 `hasItem` 仍是占位实现（会始终返回 false）。如果你在事件条件里用了 `hasItem`：

- 编辑器会在导出时给出醒目提醒。
- 短期建议：先不要用 `hasItem` 条件；或先在运行时把背包查询接口接上。

### 8.3 对话编辑快捷键（提效）

- **Ctrl+Enter**：在当前句后新增一句并聚焦
- **Alt+↑ / Alt+↓**：上下移动当前句
- **Ctrl+D**：复制当前句

---

## 7. 常见问题排查

- **运行时找不到 NPC / 对话不触发**：
  - 先确认 `data/npc/npc_registry.json` 已更新且路径正确
  - 再确认 `data/npc/*.json` 与 `*_triggers.json` 文件放对目录
- **首次对话/flag 条件不命中**：
  - demo 里未设置的 flag 会按 false 处理（更符合“首次触发”）
  - 一次性条目（repeatable=false）触发过会被记录；可用 主场景 右侧 🧹 清空 demo 存档再测
- **图片不显示**：
  - 确认路径相对项目可访问（建议用本地静态服务器打开 `index.html`）
  - `file://` 打开可能导致资源/fetch 受限

