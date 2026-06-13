// ============================================================
// task_runner — 核心 MCP 工具
// 把大任务拆成小任务，逐个执行，逐步确认
// ============================================================

import * as crypto from "crypto";
import {
  TaskPlan,
  Subtask,
  TaskRunnerParams,
  ValidateCommands,
  AskOption,
  UserAction,
} from "../types";
import {
  scanProject,
  findRelevantFiles,
  readKeyFiles,
  detectValidateCommands,
  savePlan,
} from "../core/planner";
import {
  applyCode,
  generateDiff,
  runValidation,
  backupFiles,
  rollbackSubtask,
  updateSubtaskStatus,
  getProgressSummary,
  formatTaskList,
} from "../core/executor";

// ============================================================
// 存储活跃的任务计划（内存 + 文件双备份）
// ============================================================
const activePlans = new Map<string, TaskPlan>();

// ============================================================
// Step 1: 分析项目 + 拆分任务（返回给 AI 拆分用的上下文）
// ============================================================

export function startTask(params: TaskRunnerParams): string {
  const projectPath = params.project;

  // 扫描项目结构
  const projectTree = scanProject(projectPath);

  // 查找相关文件
  const relevantFiles = findRelevantFiles(projectPath, params.intent);

  // 读取相关文件内容
  const fileContents = readKeyFiles(projectPath, relevantFiles);

  // 检测验证命令
  const detectedCommands = params.validate || detectValidateCommands(projectPath);

  // 生成任务计划 ID
  const planId = crypto.randomBytes(4).toString("hex");

  // 返回上下文给 AI，让它拆分任务
  return [
    `## 任务分析完成`,
    ``,
    `**任务**: ${params.intent}`,
    `**项目**: ${projectPath}`,
    `**计划 ID**: ${planId}`,
    ``,
    `### 项目结构`,
    `\`\`\``,
    projectTree,
    `\`\`\``,
    ``,
    `### 相关文件`,
    relevantFiles.length > 0
      ? relevantFiles.map((f) => `- ${f}`).join("\n")
      : "（未找到相关文件，可能是新建模块）",
    ``,
    fileContents ? `### 文件内容预览\n\`\`\`\n${fileContents}\n\`\`\`` : "",
    ``,
    `### 检测到的验证命令`,
    `\`\`\`json`,
    JSON.stringify(detectedCommands, null, 2),
    `\`\`\``,
    ``,
    `---`,
    ``,
    `请根据以上信息，将任务拆分为 3-8 个子任务。`,
    `每个子任务应该是一个完整的、可独立验证的工作单元。`,
    ``,
    `**输出格式**（严格遵守）：`,
    `\`\`\`json`,
    `{"plan_id": "${planId}", "subtasks": [`,
    `  {"title": "子任务标题", "description": "具体做什么，改哪些文件", "estimated_lines": 30, "files_to_modify": ["lib/xxx.js"]}`,
    `]}`,
    `\`\`\``,
  ].join("\n");
}

// ============================================================
// Step 2: 接收 AI 拆分的任务，创建计划
// ============================================================

export function createPlan(
  projectPath: string,
  intent: string,
  planId: string,
  subtasks: { title: string; description: string; estimated_lines?: number; files_to_modify?: string[] }[],
  validate?: ValidateCommands
): string {
  const detectedCommands = validate || detectValidateCommands(projectPath);

  const plan: TaskPlan = {
    id: planId,
    intent,
    project_path: projectPath,
    subtasks: subtasks.map((s, i) => ({
      id: i + 1,
      title: s.title,
      description: s.description,
      estimated_lines: s.estimated_lines || 0,
      files_to_modify: s.files_to_modify || [],
      status: "pending" as const,
      redo_count: 0,
    })),
    current_index: 0,
    created_at: new Date().toISOString(),
    validate_commands: detectedCommands,
  };

  // 保存计划
  activePlans.set(planId, plan);
  savePlan(projectPath, plan);

  // 创建备份目录
  const backupDir = require("path").join(projectPath, ".task-mcp", "backups", planId);
  require("fs").mkdirSync(backupDir, { recursive: true });

  return [
    formatTaskList(plan),
    "",
    "任务计划已创建。请调用 `execute_next_subtask` 工具开始执行第一个子任务。",
    `参数: {"plan_id": "${planId}"}`,
  ].join("\n");
}

// ============================================================
// Step 3: 执行下一个子任务（返回上下文给 AI 生成代码）
// ============================================================

export function executeNextSubtask(planId: string): string | object {
  const plan = activePlans.get(planId);
  if (!plan) return `错误: 找不到计划 ${planId}`;

  // 找到下一个待执行的任务
  const nextTask = plan.subtasks.find(
    (s) => s.status === "pending" || s.status === "redo"
  );

  if (!nextTask) {
    // 所有任务都完成了
    return {
      all_completed: true,
      summary: getProgressSummary(plan),
      message: "🎉 所有子任务已完成！",
    };
  }

  // 标记为执行中
  updateSubtaskStatus(plan, nextTask.id, "in_progress");

  // 备份要修改的文件
  const backupDir = require("path").join(
    plan.project_path,
    ".task-mcp",
    "backups",
    plan.id
  );
  backupFiles(plan.project_path, nextTask.files_to_modify, backupDir, nextTask.id);

  // 读取要修改的文件的当前内容
  const fileContents = readKeyFiles(plan.project_path, nextTask.files_to_modify);

  // 如果是重做，附带上次的理由
  const redoContext = nextTask.redo_reason
    ? `\n⚠️ **上次用户反馈**: ${nextTask.redo_reason}\n请根据反馈修正。`
    : "";

  return [
    `## 执行子任务 ${nextTask.id}/${plan.subtasks.length}`,
    ``,
    `**标题**: ${nextTask.title}`,
    `**描述**: ${nextTask.description}`,
    `**预估行数**: ~${nextTask.estimated_lines} 行`,
    `**要修改的文件**: ${nextTask.files_to_modify.join(", ") || "（新建文件）"}`,
    redoContext,
    "",
    fileContents ? `### 当前文件内容\n\`\`\`\n${fileContents}\n\`\`\`` : "",
    "",
    `### 进度`,
    getProgressSummary(plan),
    "",
    "---",
    "",
    `请为这个子任务生成代码。`,
    `完成后调用 \`complete_subtask\` 工具，参数:`,
    `\`\`\`json`,
    `{"plan_id": "${planId}", "subtask_id": ${nextTask.id}, "files": {"文件路径": "完整文件内容"}}`,
    `\`\`\``,
  ].join("\n");
}

// ============================================================
// Step 4: 子任务完成，展示 diff，等用户确认
// ============================================================

export async function completeSubtask(
  planId: string,
  subtaskId: number,
  files: Record<string, string>
): Promise<object> {
  const plan = activePlans.get(planId);
  if (!plan) return { error: `找不到计划 ${planId}` };

  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return { error: `找不到子任务 ${subtaskId}` };

  // 生成 diff
  const diffs: string[] = [];
  for (const [filePath, code] of Object.entries(files)) {
    const diff = generateDiff(plan.project_path, filePath, code);
    diffs.push(diff.patch);
  }

  // 保存代码到子任务
  subtask.code = JSON.stringify(files);
  subtask.diff = diffs.join("\n\n");

  // 自动模式：直接落盘，不弹窗
  if (plan.auto_mode) {
    // 代码落盘
    for (const [filePath, code] of Object.entries(files)) {
      applyCode(plan.project_path, filePath, code);
    }
    updateSubtaskStatus(plan, subtaskId, "confirmed");

    // 检查是否还有下一个任务
    const hasMore = plan.subtasks.some(
      (s) => s.status === "pending" || s.status === "redo"
    );
    if (hasMore) {
      return {
        auto_confirmed: true,
        message: `✅ Task ${subtaskId} 已自动确认（自动模式）`,
        next_action: "execute_next_subtask",
        params: { plan_id: planId },
      };
    } else {
      return {
        all_completed: true,
        summary: getProgressSummary(plan),
        message: "🎉 所有子任务已完成！（自动模式）",
      };
    }
  }

  // 非自动模式：弹窗让用户选择
  updateSubtaskStatus(plan, subtaskId, "completed", { diff: subtask.diff });

  const options: AskOption[] = [
    { label: "✅ 确认，继续", value: "confirm", description: "代码落盘，执行下一个任务" },
    { label: "🧪 跑测试再决定", value: "test", description: "运行验证命令，看结果再选" },
    { label: "❌ 重做", value: "redo", description: "点击后输入理由，AI 重新生成" },
    { label: "⚡ 自动模式", value: "auto", description: "后续任务无需确认，自动执行" },
    { label: "⏸️ 暂停", value: "pause", description: "暂停执行" },
  ];

  return {
    need_user_action: true,
    action_type: "ask_choice",
    task_plan_id: planId,
    current_subtask: {
      id: subtask.id,
      title: subtask.title,
      description: subtask.description,
      redo_count: subtask.redo_count,
    },
    diff_preview: subtask.diff,
    progress: getProgressSummary(plan),
    options,
  };
}

// ============================================================
// Step 5: 处理用户选择
// ============================================================

export async function handleUserAction(
  planId: string,
  subtaskId: number,
  action: UserAction,
  reason?: string
): Promise<string | object> {
  const plan = activePlans.get(planId);
  if (!plan) return { error: `找不到计划 ${planId}` };

  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return { error: `找不到子任务 ${subtaskId}` };

  const backupDir = require("path").join(
    plan.project_path,
    ".task-mcp",
    "backups",
    plan.id
  );

  switch (action) {
    case "confirm": {
      // 代码落盘
      if (subtask.code) {
        const files = JSON.parse(subtask.code);
        for (const [filePath, code] of Object.entries(files)) {
          applyCode(plan.project_path, filePath, code as string);
        }
      }
      updateSubtaskStatus(plan, subtaskId, "confirmed");

      // 检查是否还有下一个任务
      const hasMore = plan.subtasks.some(
        (s) => s.status === "pending" || s.status === "redo"
      );
      if (hasMore) {
        return {
          message: `✅ Task ${subtaskId} 已确认`,
          next_action: "execute_next_subtask",
          params: { plan_id: planId },
        };
      } else {
        // 跑最终验证
        if (plan.validate_commands) {
          const result = await runValidation(
            plan.project_path,
            plan.validate_commands
          );
          return {
            all_completed: true,
            validation: result,
            summary: getProgressSummary(plan),
            message: result.success
              ? "🎉 所有子任务完成，验证通过！"
              : "⚠️ 所有子任务完成，但验证有失败项",
          };
        }
        return {
          all_completed: true,
          summary: getProgressSummary(plan),
          message: "🎉 所有子任务已完成！",
        };
      }
    }

    case "test": {
      if (!plan.validate_commands) {
        return { message: "⚠️ 没有配置验证命令，无法跑测试" };
      }
      const result = await runValidation(
        plan.project_path,
        plan.validate_commands
      );

      // 展示测试结果，再次让用户选择
      const options: AskOption[] = [
        { label: "✅ 测试通过，确认继续", value: "confirm", description: "代码落盘，执行下一个任务" },
        { label: "❌ 测试失败，重做", value: "redo", description: "根据测试结果重新生成" },
        { label: "⚡ 自动模式", value: "auto", description: "后续任务无需确认，自动执行" },
      ];

      return {
        need_user_action: true,
        action_type: "ask_choice",
        task_plan_id: planId,
        current_subtask: { id: subtask.id, title: subtask.title },
        test_results: result,
        diff_preview: subtask.diff,
        progress: getProgressSummary(plan),
        options,
      };
    }

    case "redo": {
      // 回滚
      rollbackSubtask(plan.project_path, subtask, backupDir);
      subtask.redo_reason = reason || "用户要求重做";
      subtask.redo_count += 1;
      updateSubtaskStatus(plan, subtaskId, "redo", {
        redo_reason: subtask.redo_reason,
        redo_count: subtask.redo_count,
      });

      const maxRetries = 3;
      if (subtask.redo_count >= maxRetries) {
        updateSubtaskStatus(plan, subtaskId, "failed", {
          error: `超过最大重试次数 (${maxRetries})`,
        });
        return {
          message: `❌ Task ${subtaskId} 重试超过 ${maxRetries} 次，标记为失败`,
          next_action: "skip_to_next",
          params: { plan_id: planId },
        };
      }

      return {
        message: `🔄 Task ${subtaskId} 将重新生成（第 ${subtask.redo_count} 次重做）`,
        reason: subtask.redo_reason,
        next_action: "execute_next_subtask",
        params: { plan_id: planId },
      };
    }

    case "auto": {
      // 开启自动模式：当前任务确认 + 后续任务自动执行
      if (subtask.code) {
        const files = JSON.parse(subtask.code);
        for (const [filePath, code] of Object.entries(files)) {
          applyCode(plan.project_path, filePath, code as string);
        }
      }
      updateSubtaskStatus(plan, subtaskId, "confirmed");
      plan.auto_mode = true;
      savePlan(plan.project_path, plan);

      return {
        message: `⚡ 自动模式已开启，后续任务将自动执行`,
        next_action: "execute_next_subtask",
        params: { plan_id: planId },
      };
    }

    case "pause": {
      updateSubtaskStatus(plan, subtaskId, "in_progress");
      return {
        message: `⏸️ 已暂停。稍后调用 \`execute_next_subtask\` 继续`,
        plan_id: planId,
        resume_command: `execute_next_subtask({"plan_id": "${planId}"})`,
      };
    }

    case "abort": {
      // 回滚所有未确认的任务
      for (const task of plan.subtasks) {
        if (task.status !== "confirmed" && task.status !== "skipped") {
          rollbackSubtask(plan.project_path, task, backupDir);
        }
      }
      return {
        message: "🛑 已终止，所有未确认的变更已回滚",
        summary: getProgressSummary(plan),
      };
    }

    default:
      return { error: `未知动作: ${action}` };
  }
}
