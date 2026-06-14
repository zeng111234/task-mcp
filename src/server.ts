#!/usr/bin/env node
// ============================================================
// task-mcp — MCP Server
// 只有 1 个工具：checkpoint
// AI 跑完后停下来，让你确认是否合格
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { checkpoint, handleCheckpointAction } from "./checkpoint";

// ============================================================
// 创建 MCP Server
// ============================================================

const server = new Server(
  { name: "task-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

// ============================================================
// 注册工具
// ============================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "checkpoint",
      description:
        "人工检查点。AI 完成一个阶段的工作后调用此工具，自动跑验证命令，" +
        "然后弹窗让用户确认是否合格。" +
        "合格 → 继续；不合格 → 用户输入理由，AI 修复后重新验证。" +
        "\n\n使用场景：\n" +
        "- AI 写完代码、跑完测试后\n" +
        "- AI 完成一个功能模块后\n" +
        "- 需要用户打开浏览器查看效果时\n" +
        "- Hook 触发（PostToolUse 检测到 test/build 命令后）",
      inputSchema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "项目路径（当前工作目录）",
          },
          summary: {
            type: "string",
            description: "AI 做了什么（一句话描述）",
          },
          evidence: {
            type: "object",
            description: "手动提供的验证结果（可选，不传则自动检测并运行）",
            properties: {
              test: { type: "string", description: "测试结果" },
              build: { type: "string", description: "构建结果" },
              lint: { type: "string", description: "Lint 结果" },
              log: { type: "string", description: "其他日志" },
            },
          },
          open: {
            type: "string",
            description: "要打开的 URL（可选，展示在弹窗里供用户查看）",
          },
          auto_validate: {
            type: "boolean",
            description: "是否自动跑验证命令（默认 true）",
          },
        },
        required: ["project", "summary"],
      },
    },
    {
      name: "checkpoint_action",
      description:
        "处理用户在 checkpoint 弹窗中的选择。" +
        "此工具由 Reasonix AI 在用户点击按钮后自动调用，不需要手动调用。",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["pass", "fail"],
            description: "用户选择：pass=合格，fail=不合格",
          },
          reason: {
            type: "string",
            description: "不合格理由（仅 action=fail 时需要）",
          },
        },
        required: ["action"],
      },
    },
  ],
}));

// ============================================================
// 处理工具调用
// ============================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    switch (name) {
      case "checkpoint": {
        result = checkpoint({
          project: args!.project as string,
          summary: args!.summary as string,
          evidence: args!.evidence as any,
          open: args!.open as string | undefined,
          auto_validate: args!.auto_validate !== false,
        });
        break;
      }

      case "checkpoint_action": {
        result = handleCheckpointAction(
          args!.action as string,
          args!.reason as string | undefined
        );
        break;
      }

      default:
        return {
          content: [{ type: "text", text: `未知工具: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `工具执行错误: ${err.message}` }],
      isError: true,
    };
  }
});

// ============================================================
// 启动
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("task-mcp v0.2.0 started (checkpoint only)");
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
