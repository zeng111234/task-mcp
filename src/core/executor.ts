// ============================================================
// 任务执行器 — 逐个执行子任务，生成代码，管理状态
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { TaskPlan, Subtask, SubtaskStatus, ValidationResult, ValidateCommands, DiffResult } from "../types";
import { savePlan } from "./planner";

/**
 * 应用代码变更到项目文件
 */
export function applyCode(
  projectPath: string,
  filePath: string,
  code: string
): void {
  const fullPath = path.join(projectPath, filePath);
  const dir = path.dirname(fullPath);

  // 确保目录存在
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, code, "utf-8");
}

/**
 * 追加代码到现有文件
 */
export function appendToFile(
  projectPath: string,
  filePath: string,
  code: string
): void {
  const fullPath = path.join(projectPath, filePath);
  fs.appendFileSync(fullPath, "\n" + code, "utf-8");
}

/**
 * 生成简单的 diff 预览
 */
export function generateDiff(
  projectPath: string,
  filePath: string,
  newCode: string
): DiffResult {
  const fullPath = path.join(projectPath, filePath);
  let oldCode = "";

  try {
    oldCode = fs.readFileSync(fullPath, "utf-8");
  } catch {
    // 文件不存在，全部是新增
  }

  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");

  // 简单 diff：计算新增和删除行数
  const additions = newLines.filter((l) => !oldLines.includes(l)).length;
  const deletions = oldLines.filter((l) => !newLines.includes(l)).length;

  // 生成 patch 预览（简化版）
  const patch = generateSimplePatch(filePath, oldLines, newLines);

  return {
    file: filePath,
    additions,
    deletions,
    patch,
  };
}

/**
 * 生成简化的 patch 预览
 */
function generateSimplePatch(
  file: string,
  oldLines: string[],
  newLines: string[]
): string {
  const maxPreview = 30;
  const result: string[] = [];

  // 如果是新文件
  if (oldLines.length === 0 || (oldLines.length === 1 && oldLines[0] === "")) {
    result.push(`+++ new file: ${file}`);
    for (const line of newLines.slice(0, maxPreview)) {
      result.push(`+ ${line}`);
    }
    if (newLines.length > maxPreview) {
      result.push(`... (还有 ${newLines.length - maxPreview} 行)`);
    }
    return result.join("\n");
  }

  // 简单展示前 N 行
  result.push(`--- ${file}`);
  result.push(`+++ ${file} (modified)`);
  result.push(`@@ ${oldLines.length} lines → ${newLines.length} lines @@`);

  // 展示变更的行
  let shown = 0;
  for (let i = 0; i < Math.max(oldLines.length, newLines.length) && shown < maxPreview; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine !== newLine) {
      if (oldLine !== undefined) result.push(`- ${oldLine}`);
      if (newLine !== undefined) result.push(`+ ${newLine}`);
      shown++;
    }
  }

  return result.join("\n");
}

/**
 * 回滚当前子任务的变更
 */
export function rollbackSubtask(
  projectPath: string,
  subtask: Subtask,
  backupDir: string
): void {
  const subtaskBackupDir = path.join(backupDir, `task-${subtask.id}`);

  if (!fs.existsSync(subtaskBackupDir)) {
    return; // 没有备份，无法回滚
  }

  // 恢复备份的文件
  const files = fs.readdirSync(subtaskBackupDir);
  for (const file of files) {
    const backupPath = path.join(subtaskBackupDir, file);
    const originalPath = path.join(projectPath, file);

    try {
      const content = fs.readFileSync(backupPath, "utf-8");
      fs.writeFileSync(originalPath, content, "utf-8");
    } catch {
      // 恢复失败，跳过
    }
  }

  // 更新子任务状态
  subtask.status = "pending";
  subtask.code = undefined;
  subtask.diff = undefined;
}

/**
 * 创建文件备份
 */
export function backupFiles(
  projectPath: string,
  files: string[],
  backupDir: string,
  subtaskId: number
): void {
  const subtaskBackupDir = path.join(backupDir, `task-${subtaskId}`);
  if (!fs.existsSync(subtaskBackupDir)) {
    fs.mkdirSync(subtaskBackupDir, { recursive: true });
  }

  for (const file of files) {
    const fullPath = path.join(projectPath, file);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      fs.writeFileSync(path.join(subtaskBackupDir, file), content, "utf-8");
    } catch {
      // 文件不存在，可能是新建的
    }
  }
}

/**
 * 运行验证命令
 */
export async function runValidation(
  projectPath: string,
  commands: ValidateCommands
): Promise<ValidationResult> {
  const { execSync } = require("child_process");
  const results: ValidationResult["results"] = [];

  const commandMap: [string, string | undefined][] = [
    ["lint", commands.lint],
    ["test", commands.test],
    ["build", commands.build],
    ["run", commands.run],
  ];

  for (const [name, cmd] of commandMap) {
    if (!cmd) continue;

    try {
      const stdout = execSync(cmd, {
        cwd: projectPath,
        encoding: "utf-8",
        timeout: 60000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      results.push({
        name,
        command: cmd,
        passed: true,
        stdout: stdout.toString(),
        stderr: "",
      });
    } catch (err: any) {
      results.push({
        name,
        command: cmd,
        passed: false,
        stdout: err.stdout?.toString() || "",
        stderr: err.stderr?.toString() || err.message,
      });
    }
  }

  return {
    success: results.every((r) => r.passed),
    results,
  };
}

/**
 * 更新子任务状态并保存计划
 */
export function updateSubtaskStatus(
  plan: TaskPlan,
  subtaskId: number,
  status: SubtaskStatus,
  extra?: Partial<Subtask>
): void {
  const subtask = plan.subtasks.find((s) => s.id === subtaskId);
  if (subtask) {
    subtask.status = status;
    if (extra) Object.assign(subtask, extra);
  }
  savePlan(plan.project_path, plan);
}

/**
 * 获取当前进度摘要
 */
export function getProgressSummary(plan: TaskPlan): string {
  const total = plan.subtasks.length;
  const confirmed = plan.subtasks.filter((s) => s.status === "confirmed").length;
  const completed = plan.subtasks.filter((s) => s.status === "completed").length;
  const inProgress = plan.subtasks.filter((s) => s.status === "in_progress").length;
  const skipped = plan.subtasks.filter((s) => s.status === "skipped").length;
  const failed = plan.subtasks.filter((s) => s.status === "failed").length;

  const percent = Math.round((confirmed / total) * 100);
  const bar = "█".repeat(Math.round(percent / 5)) + "░".repeat(20 - Math.round(percent / 5));

  return [
    `进度: [${bar}] ${percent}%`,
    `  ✅ 已确认: ${confirmed}  ⏳ 待确认: ${completed}  🔄 进行中: ${inProgress}  ⏭️ 跳过: ${skipped}  ❌ 失败: ${failed}`,
    `  总计: ${total} 个子任务`,
  ].join("\n");
}

/**
 * 生成任务列表预览
 */
export function formatTaskList(plan: TaskPlan): string {
  const lines: string[] = [];
  lines.push(`📋 任务计划: ${plan.intent}`);
  lines.push(`项目: ${plan.project_path}`);
  lines.push(`子任务: ${plan.subtasks.length} 个`);
  lines.push("");

  for (const task of plan.subtasks) {
    const statusIcon = getStatusIcon(task.status);
    lines.push(`  ${statusIcon} Task ${task.id}/${plan.subtasks.length}: ${task.title}`);
    lines.push(`     ${task.description}`);
    if (task.estimated_lines) {
      lines.push(`     预估: ~${task.estimated_lines} 行`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getStatusIcon(status: SubtaskStatus): string {
  switch (status) {
    case "pending": return "⬜";
    case "in_progress": return "🔄";
    case "completed": return "📝";
    case "confirmed": return "✅";
    case "redo": return "❌";
    case "skipped": return "⏭️";
    case "failed": return "💥";
    default: return "❓";
  }
}
