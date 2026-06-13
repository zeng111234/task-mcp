<div align="center">

# 🔧 task-mcp

### 把大任务拆成小任务，逐步执行，逐步确认

[![npm](https://img.shields.io/npm/v/task-mcp)](https://www.npmjs.com/package/task-mcp)
[![License](https://img.shields.io/npm/l/task-mcp)](./LICENSE)

**解决 AI 编码的核心痛点：一次性写太多代码，看不懂、审不过来、改不动。**

</div>

---

## 🤔 为什么做这个？

Vibe Coding 的真实体验：

```
你："帮我实现 X 功能"
AI：给你 500 行代码
你：粘贴进去... 跑不通
你：复制报错，粘贴给 AI
AI：给你 50 行修复
你：粘贴进去... 还是不对
（循环 5 次，30 分钟过去了）
```

**问题不是 AI 不会写代码，是一次性倒出来太多，你根本审不过来。**

---

## 💡 解法

**大任务 → 拆成小任务 → 每个小任务写完你确认 → 下一个**

```
你："给 scorer.js 加一个热度评分因子"

AI 自动拆分：
  Task 1: 创建数据获取函数（~40行）
  Task 2: 实现评分逻辑（~30行）
  Task 3: 集成到 scorer.js（~10行）
  Task 4: 写测试（~50行）
  Task 5: 全量验证

每个 Task 完成后弹窗让你选择：
  [✅ 确认，继续] [🧪 跑测试] [❌ 重做] [⏭️ 跳过]
```

---

## 🚀 Quick Start

### 安装

```bash
npx task-mcp
```

### 配置（Reasonix）

在 `reasonix.toml` 中添加：

```toml
[[plugins]]
name    = "task"
command = "npx"
args    = ["-y", "task-mcp@latest"]
```

### 配置（Claude Desktop）

在 `claude_desktop_config.json` 中添加：

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

| 工具 | 说明 | 调用者 |
|------|------|--------|
| `start_task` | 分析项目，返回上下文 | AI |
| `create_plan` | 接收拆分的子任务，创建计划 | AI |
| `execute_next_subtask` | 执行下一个子任务 | AI |
| `complete_subtask` | 提交代码，返回 diff | AI |
| `handle_user_action` | 处理用户选择 | AI |

**你不需要手动调用这些工具。** 你只需要告诉 AI 你的任务，它会自动走完整个流程。

---

## 📋 完整流程

```
你：描述任务
    ↓
AI 调用 start_task → 获取项目上下文
    ↓
AI 拆分任务，调用 create_plan
    ↓
AI 调用 execute_next_subtask → 获取子任务信息
    ↓
AI 生成代码，调用 complete_subtask
    ↓
弹窗让你选择：
  ✅ 确认 → 代码落盘，下一个任务
  🧪 跑测试 → 运行验证命令，看结果再选
  ❌ 重做 → 输入理由，AI 重新生成
  ⏭️ 跳过 → 跳过这个任务
  ⏸️ 暂停 → 稍后继续
    ↓
循环直到所有子任务完成
    ↓
🎉 完成！跑最终验证
```

---

## ❓ FAQ

<details>
<summary><b>Q: 和 Cursor / Claude Code 的 plan 模式有什么区别？</b></summary>

plan 模式只做规划，执行阶段还是一次性写完。task-mcp 的核心是**逐步执行 + 逐步确认**，每个小任务完成后你都能审核。
</details>

<details>
<summary><b>Q: 每次只写 10 行不会很慢吗？</b></summary>

不是每次 10 行，是每个子任务 30-80 行。一个完整的功能模块，你能看懂、能审核。比一次性 500 行然后反复粘贴报错快多了。
</details>

<details>
<summary><b>Q: 支持哪些语言和项目？</b></summary>

任何语言、任何项目。task-mcp 不关心你用什么语言，它只做任务拆分和代码管理。
</details>

<details>
<summary><b>Q: 验证命令怎么配置？</b></summary>

可以自动检测（从 package.json / Makefile 推断），也可以手动指定。
</details>

---

## 📄 License

MIT
