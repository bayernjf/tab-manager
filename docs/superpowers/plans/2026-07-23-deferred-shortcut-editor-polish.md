# Deferred Shortcut Editor — 当前实现记录

> **Status:** ✅ 已实现（v0.1.11）

> 本文件是原始打磨计划的历史归档。当前实现采用 `<input type="time">` 紧凑编辑器，已满足需求。

## 当前实现方式

- **输入控件**：`<input type="time">`，每行一个时间快捷方式
- **上限**：最多 5 个（`MAX_DEFERRED_SHORTCUTS = 5`）
- **交互**：添加按钮 `＋ 添加倒计时`、每行删除按钮 `×`、计数显示 `n / 5`
- **位置**：选项页 → 偏好设置 → 快捷提醒时间卡片
- **消费端**：看板 tab 的「稍后处理」菜单读取已配置的时间列表

## 关键代码位置

| 文件 | 内容 |
|---|---|
| `src/options.html` | `#shortcut-times-card` 卡片 + `.shortcut-editor` 容器 |
| `src/options.ts` | `createShortcutInput()` / `updateShortcutEditorState()` / `renderShortcutInputs()` |
| `src/options.css` | `.shortcut-editor` / `.deferred-shortcut` / `.shortcut-add` 样式 |
| `src/shared.ts` | `deferredShortcutTimes` 验证与默认值 |
