<div align="center">

# 🔧 task-mcp

### 给 AI 野马套上马鞍 — 人工检查点 MCP 服务器

[![npm](https://img.shields.io/npm/v/task-mcp)](https://www.npmjs.com/package/task-mcp)
[![License](https://img.shields.io/npm/l/task-mcp)](./LICENSE)

**AI 跑完后停下来让你确认，合格才继续。**

</div>

---

## 🤔 为什么做这个？

Vibe Coding 的真实体验：

```
AI 一口气写了 500 行 → 跑了一下 → 你粘贴报错 → AI 改 → 还是不对 → 循环 5 次
```

**问题不是 AI 不会写代码，是它跑完了不停下来让你看。**

---

## 💡 解法

**Hook + MCP 组合方案：**

```
AI 分析 → AI 编码 → AI 跑测试
                         ↓
              Hook 拦截："测试跑完了，请确认"
                         ↓
              AI 调用 checkpoint → 弹窗
                         ↓
              [✅ 合格] [❌ 不合格]
                         ↓
              合格 → 继续
              不合格 → 输入理由 → AI 修复
```

---

## 🚀 Quick Start

### 1. 安装

```bash
npx task-mcp
```

### 2. 配置 Reasonix

在 `reasonix.toml` 添加：

```toml
[[plugins]]
name    = "task"
command = "npx"
args    = ["-y", "task-mcp@latest"]
```

### 3. 安装 Hook（可选但推荐）

```bash
# 复制 Hook 配置到你的项目
cp -r hooks/.reasonix /你的项目路径/.reasonix

# 或全局安装
cp hooks/.reasonix/settings.json ~/.reasonix/settings.json
```

Hook 的作用：**AI 跑完 test/build 命令后自动拦截，强制要求调用 checkpoint。**

### 4. 重启 Reasonix

---

## 🔧 Tools

### `checkpoint`

AI 完成一个阶段的工作后调用。

```typescript
checkpoint({
  project: ".",                          // 项目路径
  summary: "实现了热度评分因子",            // 做了什么
  open: "http://localhost:3000",          // 打开 URL（可选）
  evidence: { test: "手动测试通过" },      // 手动证据（可选）
  auto_validate: true                     // 自动跑验证（默认 true）
})
```

**自动做的事：**
1. 检测项目中的 test/build/lint 命令
2. 运行这些命令
3. 获取 git diff
4. 弹窗让你确认

**弹窗：**
```
[✅ 合格，继续] [❌ 不合格]
```

---

## 📋 完整流程

```
你："给 scorer.js 加一个热度评分因子"

AI 正常工作（用 write_file、edit_file、bash 写代码）
    ↓
AI 跑 npm test
    ↓
Hook 拦截（exit 2）
    ↓
Reasonix 注入消息："请调用 checkpoint"
    ↓
AI 调用 checkpoint
    ↓
自动跑验证 + 展示 diff + 弹窗
    ↓
你点"合格" → AI 继续
你点"不合格" → 输入理由 → AI 修复 → 重新验证
```

---

## 🏗️ 架构

```
task-mcp/
├── src/
│   ├── server.ts           # MCP Server（1 个工具）
│   └── checkpoint.ts       # 核心逻辑
├── hooks/
│   ├── .reasonix/
│   │   └── settings.json   # Hook 配置模板
│   └── README.md           # Hook 使用说明
├── package.json
└── README.md
```

**只有 1 个工具，~150 行核心代码。**

---

## 🔍 设计理念

> "模型是 agent，代码是 harness。构建好的 harness，agent 会完成剩下的事。"

task-mcp 是一个 **Harness 检查点**：

| 概念 | 实现 |
|------|------|
| Restate First | AI 调用 checkpoint 时必须描述"做了什么" |
| No Approval, No Execute | 弹窗必须等用户点"合格" |
| Done by Evidence | 自动跑 test/build，展示 git diff |
| AI 不能自我认证 | 弹窗由 MCP 控制，不由 AI 控制 |
| Hook 触发 | PostToolUse 拦截 test/build 命令 |

---

## ❓ FAQ

<details>
<summary><b>Q: 不装 Hook 也能用吗？</b></summary>

可以。不装 Hook 的话，AI 需要自觉调用 checkpoint。装了 Hook 后，AI 跑完 test/build 会被自动拦截。
</details>

<details>
<summary><b>Q: 和 Cursor / Claude Code 的 plan 模式有什么区别？</b></summary>

plan 模式只做规划，执行阶段还是一次性写完。task-mcp 的 checkpoint 是在执行过程中插入人工检查点。
</details>

<details>
<summary><b>Q: 支持哪些语言和项目？</b></summary>

任何语言、任何项目。checkpoint 只做验证和确认，不关心你用什么语言。
</details>

---

## 📄 License

MIT
