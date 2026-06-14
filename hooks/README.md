# Hooks 配置

## 快速安装

把 `.reasonix/settings.json` 复制到你的项目根目录：

```bash
cp -r hooks/.reasonix /你的项目路径/.reasonix
```

或者复制到全局配置（所有项目生效）：

```bash
cp hooks/.reasonix/settings.json ~/.reasonix/settings.json
```

## Hook 工作原理

```
AI 跑 npm test
    ↓
PostToolUse Hook 触发
    ↓
Hook 脚本检测到 "test" 关键字
    ↓
exit 2 → 拦截 AI 继续执行
    ↓
Reasonix 注入消息："请调用 checkpoint 工具"
    ↓
AI 调用 checkpoint
    ↓
弹窗：✅ 合格 / ❌ 不合格
    ↓
你点"合格" → AI 继续
你点"不合格" → 输入理由 → AI 修复
```

## Hook 配置说明

### PostToolUse

在工具执行**后**触发。用于检测 test/build 命令。

```json
{
  "match": "run_command",           // 匹配的工具名（正则）
  "command": "node -e \"...\"",     // 要执行的脚本
  "description": "说明"
}
```

### 退出码约定

| 退出码 | 含义 | 效果 |
|--------|------|------|
| 0 | pass | 继续执行 |
| 1 | warn | 注入警告消息 |
| 2 | block | 拦截执行，注入消息要求调用 checkpoint |

## 自定义

### 只在特定命令后触发

修改 `match` 中的正则：

```json
// 只匹配 pytest
"command": "node -e \"const p=JSON.parse(require('fs').readFileSync(0,'utf8'));if(p.toolArgs?.command?.includes('pytest'))process.exit(2)\""
```

### 每次写文件后触发

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "match": "write_file|edit_file",
        "command": "echo '文件已修改，考虑调用 checkpoint'",
        "description": "写文件后提醒"
      }
    ]
  }
}
```

### 禁用 Hook

删除 `.reasonix/settings.json` 或清空 hooks：

```json
{ "hooks": {} }
```
