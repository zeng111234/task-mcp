#!/usr/bin/env node
// ============================================================
// task-mcp — MCP Server
// 3 个工具：checkpoint / set_mode / get_mode
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  checkpoint,
  handleCheckpointAction,
  setMode,
  getMode,
} from "./checkpoint";

// ============================================================
// 创建 MCP Server
// ============================================================

const server = new Server(
  { name: "task-mcp", version: "0.3.0" },
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
        "人工检查点。AI 完成一个阶段的工作后调用，自动跑验证命令。" +
        "根据当前模式决定是否弹窗：" +
        "\n- manual: 每次都弹窗" +
        "\n- smart（默认）: 验证通过自动继续，失败才弹窗" +
        "\n- auto: 不弹窗，验证通过自动继续（失败也自动继续）" +
        "\n\n弹窗时可一键切换模式。",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "项目路径" },
          summary: { type: "string", description: "AI 做了什么（一句话）" },
          mode: {
            type: "string",
            enum: ["manual", "auto", "smart"],
            description: "覆盖本次 checkpoint 的模式（可选，默认用会话级设置）",
          },
          evidence: {
            type: "object",
            description: "手动验证结果（可选）",
            properties: {
              test: { type: "string" },
              build: { type: "string" },
              lint: { type: "string" },
              log: { type: "string" },
            },
          },
          open: { type: "string", description: "要打开的 URL（可选）" },
          auto_validate: { type: "boolean", description: "自动跑验证（默认 true）" },
        },
        required: ["project", "summary"],
      },
    },
    {
      name: "checkpoint_action",
      description:
        "处理用户的 checkpoint 选择（pass/fail/switch_mode）。" +
        "由 Reasonix AI 在用户点击按钮后自动调用。",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["pass", "fail", "switch_auto", "switch_smart", "switch_manual"],
            description: "用户选择",
          },
          reason: {
            type: "string",
            description: "不合格理由（仅 action=fail 时）",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "set_mode",
      description:
        "切换 checkpoint 模式。切换后所有后续 checkpoint 都使用新模式。" +
        "\n- manual: 每次都弹窗确认" +
        "\n- smart（默认）: 失败才弹窗" +
        "\n- auto: 全自动，不弹窗",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["manual", "auto", "smart"],
            description: "目标模式",
          },
        },
        required: ["mode"],
      },
    },
    {
      name: "get_mode",
      description:
        "查看当前 checkpoint 模式和统计数据（总次数、连续失败次数、最近历史）。",
      inputSchema: {
        type: "object",
        properties: {},
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
      case "checkpoint":
        result = checkpoint({
          project: args!.project as string,
          summary: args!.summary as string,
          mode: args!.mode as any,
          evidence: args!.evidence as any,
          open: args!.open as string | undefined,
          auto_validate: args!.auto_validate !== false,
        });
        break;

      case "checkpoint_action":
        result = handleCheckpointAction(
          args!.action as string,
          args!.reason as string | undefined
        );
        break;

      case "set_mode":
        result = setMode(args!.mode as any);
        break;

      case "get_mode":
        result = getMode();
        break;

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
  console.error("task-mcp v0.3.0 started");
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
