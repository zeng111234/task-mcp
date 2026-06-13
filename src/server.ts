#!/usr/bin/env node
// ============================================================
// task-mcp — MCP Server 入口
// 把大任务拆成小任务，逐个执行，逐步确认
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { startTask, createPlan, executeNextSubtask, completeSubtask, handleUserAction } from "./tools/task-runner";

// ============================================================
// 创建 MCP Server
// ============================================================

const server = new Server(
  {
    name: "task-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================
// 注册工具列表
// ============================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "start_task",
      description:
        "开始一个新任务。分析项目结构，查找相关文件，返回上下文供 AI 拆分子任务。" +
        "这是 task_runner 流程的第一步。",
      inputSchema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "项目路径",
          },
          intent: {
            type: "string",
            description: "任务描述（自然语言）",
          },
          validate: {
            type: "object",
            description: "验证命令（可选，不传则自动检测）",
            properties: {
              lint: { type: "string" },
              test: { type: "string" },
              build: { type: "string" },
              run: { type: "string" },
            },
          },
        },
        required: ["project", "intent"],
      },
    },
    {
      name: "create_plan",
      description:
        "接收 AI 拆分的子任务列表，创建任务计划。" +
        "在 start_task 之后调用，需要 AI 先根据返回的上下文拆分任务。",
      inputSchema: {
        type: "object",
        properties: {
          project: { type: "string", description: "项目路径" },
          intent: { type: "string", description: "原始任务描述" },
          plan_id: { type: "string", description: "计划 ID（来自 start_task 返回）" },
          subtasks: {
            type: "array",
            description: "子任务列表",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "子任务标题" },
                description: { type: "string", description: "具体做什么" },
                estimated_lines: { type: "number", description: "预估代码行数" },
                files_to_modify: {
                  type: "array",
                  items: { type: "string" },
                  description: "要修改的文件路径",
                },
              },
              required: ["title", "description"],
            },
          },
          validate: {
            type: "object",
            description: "验证命令（可选）",
            properties: {
              lint: { type: "string" },
              test: { type: "string" },
              build: { type: "string" },
              run: { type: "string" },
            },
          },
        },
        required: ["project", "intent", "plan_id", "subtasks"],
      },
    },
    {
      name: "execute_next_subtask",
      description:
        "执行下一个待执行的子任务。返回子任务信息和相关文件内容，" +
        "供 AI 生成代码。如果所有任务已完成，返回完成摘要。",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "计划 ID" },
        },
        required: ["plan_id"],
      },
    },
    {
      name: "complete_subtask",
      description:
        "子任务代码生成完成，提交代码。返回 diff 预览和用户确认选项。" +
        "AI 应该将返回的 need_user_action 结果展示给用户，等待用户选择。",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "计划 ID" },
          subtask_id: { type: "number", description: "子任务 ID" },
          files: {
            type: "object",
            description: "生成的文件内容，key 是文件路径，value 是完整文件内容",
            additionalProperties: { type: "string" },
          },
        },
        required: ["plan_id", "subtask_id", "files"],
      },
    },
    {
      name: "handle_user_action",
      description:
        "处理用户的确认选择。根据用户的选择（确认/重做/自动模式/暂停等）执行对应操作。" +
        "如果用户选择重做，需要提供 reason 参数说明哪里不对。" +
        "如果用户选择自动模式，后续任务将自动执行无需确认。",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "计划 ID" },
          subtask_id: { type: "number", description: "子任务 ID" },
          action: {
            type: "string",
            enum: ["confirm", "test", "redo", "auto", "pause", "abort"],
            description: "用户选择的动作",
          },
          reason: {
            type: "string",
            description: "重做理由（仅 action=redo 时需要）",
          },
        },
        required: ["plan_id", "subtask_id", "action"],
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
      case "start_task": {
        result = startTask({
          project: args!.project as string,
          intent: args!.intent as string,
          validate: args!.validate as any,
        });
        break;
      }

      case "create_plan": {
        result = createPlan(
          args!.project as string,
          args!.intent as string,
          args!.plan_id as string,
          args!.subtasks as any,
          args!.validate as any
        );
        break;
      }

      case "execute_next_subtask": {
        result = executeNextSubtask(args!.plan_id as string);
        break;
      }

      case "complete_subtask": {
        result = await completeSubtask(
          args!.plan_id as string,
          args!.subtask_id as number,
          args!.files as Record<string, string>
        );
        break;
      }

      case "handle_user_action": {
        result = await handleUserAction(
          args!.plan_id as string,
          args!.subtask_id as number,
          args!.action as any,
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

    // 如果结果是字符串，包装为 text content
    if (typeof result === "string") {
      return {
        content: [{ type: "text", text: result }],
      };
    }

    // 如果结果是对象，序列化为 JSON
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
// 启动服务器
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("task-mcp server started");
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
