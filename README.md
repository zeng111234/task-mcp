<div align="center">

# 🔧 task-mcp

### 人工检查点 MCP 服务器

[![npm](https://img.shields.io/npm/v/task-mcp)](https://www.npmjs.com/package/task-mcp)
[![License](https://img.shields.io/npm/l/task-mcp)](./LICENSE)

**AI 跑完后弹窗让你确认，合格才继续。**

</div>

---

## 🤔 这是什么？

task-mcp 是一个 MCP 工具，提供 `checkpoint` 弹窗确认功能。

**配合 [reasonix-harness](https://github.com/zeng111234/reasonix-harness) 使用效果最佳：**

| 项目 | 定位 |
|------|------|
| **reasonix-harness** | 控制层：Hook 硬拦截 + 阶段管理 |
| **task-mcp** | 便利层：弹窗确认 + 自动验证 |

---

## 🚀 安装

### Reasonix

```toml
[[plugins]]
name    = "task"
command = "npx"
args    = ["-y", "task-mcp@latest"]
```

### Claude Desktop

```json
{
  "mcpServers": {
    "task": {
      "command": "npx",
      "args": ["-y", "task-mcp@latest"]
    }
  }
}
```

---

## 🔧 Tools

### `checkpoint`

AI 完成一个阶段后调用，自动跑验证，弹窗确认。

```typescript
checkpoint({
  project: ".",                        // 项目路径
  summary: "实现了热度评分因子",          // 做了什么
  mode: "smart",                       // manual / auto / smart
  open: "http://localhost:3000",        // 打开 URL（可选）
})
```

**弹窗：**
```
[✅ 合格，继续] [❌ 不合格] [⚡ 切换到 auto]
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

## 🤝 配合 reasonix-harness

```bash
# 安装 harness
git clone https://github.com/zeng111234/reasonix-harness.git
cd reasonix-harness
cp -r .reasonix /你的项目/.reasonix
cp AGENTS.md.example /你的项目/AGENTS.md
```

**工作流：**
```
Harness Hook 拦截 test/build 命令
  → 注入消息要求调用 checkpoint
  → checkpoint 弹窗确认
  → 用户点"合格" → 继续
```

---

## 📄 License

MIT
