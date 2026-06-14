<div align="center">

# 🔧 task-mcp

### 给 AI 野马套上马鞍 — 人工检查点 MCP 服务器

[![npm](https://img.shields.io/npm/v/task-mcp)](https://www.npmjs.com/package/task-mcp)
[![License](https://img.shields.io/npm/l/task-mcp)](./LICENSE)

**AI 跑完后停下来让你确认，合格才继续。支持三种模式：manual / smart / auto。**

</div>

---

## 🤔 为什么做这个？

Vibe Coding 的真实体验：

```
AI 一口气写了 500 行 → 跑了一下 → 你粘贴报错 → AI 改 → 还是不对 → 循环 5 次
```

**问题不是 AI 不会写代码，是它跑完了不停下来让你看。**

---

## 💡 三种模式

| 模式 | 行为 | 适合场景 |
|------|------|---------|
| `smart`（默认） | 通过自动继续，失败才弹窗 | **推荐** |
| `manual` | 每次都弹窗确认 | 核心功能，怕写歪 |
| `auto` | 全自动，不弹窗 | 赶时间 |

### smart 模式的工作流

```
AI 写代码 → 跑测试 → 通过 → ✅ 自动继续（不打扰你）
                     → 失败 → ❌ 弹窗 → 你输入理由 → AI 修复
```

**只有出问题才打扰你，没问题就默默跑。**

### 一键切换

弹窗里直接有切换按钮：

```
[✅ 合格，继续] [❌ 不合格] [⚡ 切换到 auto]
```

---

## 🚀 Quick Start

### 1. 配置 Reasonix

```toml
[[plugins]]
name    = "task"
command = "npx"
args    = ["-y", "task-mcp@latest"]
```

### 2. 安装 Hook（推荐）

```bash
# 项目级
cp -r node_modules/task-mcp/hooks/.reasonix /你的项目/.reasonix

# 或全局
cp hooks/.reasonix/settings.json ~/.reasonix/settings.json
```

### 3. 重启 Reasonix

---

## 🔧 Tools

### `checkpoint`

```typescript
checkpoint({
  project: ".",
  summary: "实现了热度评分因子",
  mode: "smart",        // 可选：manual / auto / smart
  open: "http://localhost:3000",  // 可选：打开 URL
  auto_validate: true,  // 可选：自动跑验证
})
```

### `set_mode`

```typescript
set_mode({ mode: "auto" })  // 切换模式
```

### `get_mode`

```typescript
get_mode()  // 查看当前模式和统计
```

---

## 🪝 Hook 工作原理

```
AI 跑 npm test
    ↓
PostToolUse Hook 检测到 "test"
    ↓
exit 2 → 拦截 AI
    ↓
注入消息："请调用 checkpoint"
    ↓
AI 调用 checkpoint
    ↓
smart 模式：失败 → 弹窗
smart 模式：通过 → 自动继续
```

**Hook 还覆盖 write_file/edit_file：**
- 写文件后注入提醒："考虑调用 checkpoint 验证"
- exit 1 = 注入消息（不拦截，只是提醒）

---

## 📊 统计

`get_mode` 返回：

```json
{
  "mode": "smart",
  "description": "验证通过自动继续，失败才弹窗（推荐）",
  "stats": {
    "total_checkpoints": 12,
    "consecutive_failures": 0,
    "recent_history": [...]
  }
}
```

**连续失败 2 次以上，弹窗会加警告：**
```
⚠️ 警告：连续 3 次验证失败
```

---

## 🏗️ 架构

```
task-mcp/
├── src/
│   ├── server.ts           # MCP Server（4 个工具）
│   └── checkpoint.ts       # 核心逻辑（模式、状态、验证）
├── hooks/
│   ├── .reasonix/
│   │   └── settings.json   # Hook 配置模板
│   └── README.md
├── README.md
└── package.json
```

---

## 📄 License

MIT
