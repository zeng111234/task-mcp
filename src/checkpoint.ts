// ============================================================
// task-mcp — checkpoint 核心逻辑
// 三种模式：manual（每次弹窗）/ smart（失败才弹）/ auto（不弹）
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ============================================================
// 类型定义
// ============================================================

export type CheckpointMode = "manual" | "auto" | "smart";

export interface CheckpointParams {
  project: string;
  summary: string;
  mode?: CheckpointMode;
  evidence?: {
    test?: string;
    build?: string;
    lint?: string;
    log?: string;
  };
  open?: string;
  auto_validate?: boolean;
}

// ============================================================
// 全局状态（会话级）
// ============================================================

let currentMode: CheckpointMode = "smart";
let consecutiveFailures = 0;
let totalCheckpoints = 0;
let checkpointHistory: Array<{
  timestamp: string;
  summary: string;
  mode: CheckpointMode;
  passed: boolean;
  reason?: string;
}> = [];

export function setMode(mode: CheckpointMode): object {
  const oldMode = currentMode;
  currentMode = mode;
  return {
    message: `⚡ 模式已切换：${oldMode} → ${mode}`,
    mode,
    description: getModeDescription(mode),
  };
}

export function getMode(): object {
  return {
    mode: currentMode,
    description: getModeDescription(currentMode),
    stats: {
      total_checkpoints: totalCheckpoints,
      consecutive_failures: consecutiveFailures,
      recent_history: checkpointHistory.slice(-5),
    },
  };
}

function getModeDescription(mode: CheckpointMode): string {
  switch (mode) {
    case "manual":
      return "每次 checkpoint 都弹窗确认";
    case "auto":
      return "不弹窗，验证通过自动继续";
    case "smart":
      return "验证通过自动继续，失败才弹窗（推荐）";
  }
}

// ============================================================
// 工具函数
// ============================================================

function detectCommands(projectPath: string): Record<string, string> {
  const commands: Record<string, string> = {};
  const pkgPath = path.join(projectPath, "package.json");

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts || {};
    if (scripts.test) commands.test = "npm test";
    if (scripts.build) commands.build = "npm run build";
    if (scripts.lint) commands.lint = "npm run lint";
    if (scripts.check) commands.check = "npm run check";
  } catch {
    // 没有 package.json
  }

  if (fs.existsSync(path.join(projectPath, "Makefile"))) {
    const content = fs.readFileSync(path.join(projectPath, "Makefile"), "utf-8");
    if (content.includes("test:")) commands.test = commands.test || "make test";
  }

  return commands;
}

function runCommand(cmd: string, cwd: string): { passed: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: 120000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { passed: true, output: output.trim().slice(0, 3000) };
  } catch (err: any) {
    const output = (err.stdout || "") + "\n" + (err.stderr || err.message);
    return { passed: false, output: output.trim().slice(0, 3000) };
  }
}

function getGitDiffSummary(projectPath: string): string {
  try {
    return execSync("git diff --stat HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 10000,
    }).trim().slice(0, 1000);
  } catch {
    return "";
  }
}

function getGitDiffContent(projectPath: string): string {
  try {
    return execSync("git diff HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 10000,
    }).trim().slice(0, 3000);
  } catch {
    return "";
  }
}

// ============================================================
// 核心：checkpoint
// ============================================================

export function checkpoint(params: CheckpointParams): object {
  const {
    project,
    summary,
    evidence = {},
    open,
    auto_validate = true,
  } = params;

  // 确定本次使用的模式（参数 > 会话级 > 默认）
  const mode = params.mode || currentMode;
  totalCheckpoints++;

  // 1. 跑验证
  const validationResults: Record<string, { passed: boolean; output: string }> = {};

  if (auto_validate) {
    const commands = detectCommands(project);
    for (const [name, cmd] of Object.entries(commands)) {
      if (evidence[name as keyof typeof evidence]) continue;
      validationResults[name] = runCommand(cmd, project);
    }
  }

  // 2. 合并证据
  const allEvidence: Record<string, { passed: boolean | null; output: string }> = {};

  for (const [key, value] of Object.entries(evidence)) {
    if (value) allEvidence[key] = { passed: null, output: value };
  }
  for (const [key, value] of Object.entries(validationResults)) {
    allEvidence[key] = value;
  }

  // 3. Git diff
  const diffSummary = getGitDiffSummary(project);
  const diffContent = getGitDiffContent(project);

  // 4. 判断是否通过
  const allPassed = Object.values(allEvidence).every((e) => e.passed !== false);
  const hasEvidence = Object.keys(allEvidence).length > 0;

  // 5. 更新状态
  if (allPassed) {
    consecutiveFailures = 0;
  } else {
    consecutiveFailures++;
  }

  checkpointHistory.push({
    timestamp: new Date().toISOString(),
    summary,
    mode,
    passed: allPassed,
  });

  // 只保留最近 20 条
  if (checkpointHistory.length > 20) {
    checkpointHistory = checkpointHistory.slice(-20);
  }

  // 6. 构建验证结果文本
  const evidenceText = Object.entries(allEvidence)
    .map(([name, result]) => {
      const icon = result.passed === true ? "✅" : result.passed === false ? "❌" : "📝";
      const output = result.output.length > 200
        ? result.output.slice(0, 200) + "..."
        : result.output;
      return `${icon} **${name}**:\n\`\`\`\n${output}\n\`\`\``;
    })
    .join("\n\n");

  const statusText = hasEvidence
    ? allPassed ? "🟢 所有验证通过" : "🔴 有验证失败项"
    : "⚪ 无验证结果";

  // 7. 根据模式决定行为
  // === auto 模式：不弹窗 ===
  if (mode === "auto") {
    if (allPassed) {
      return {
        mode: "auto",
        message: [
          `✅ Checkpoint 通过（auto 模式，不弹窗）`,
          `**AI**: ${summary}`,
          diffSummary ? `**变更**: ${diffSummary.split("\n").length} 个文件` : "",
        ].filter(Boolean).join(" | "),
        pass: true,
        validation: allEvidence,
        diff_summary: diffSummary,
      };
    } else {
      // auto 模式但验证失败 → 降级为弹窗
      return buildPopupResult(summary, evidenceText, diffSummary, diffContent, allEvidence, allPassed, hasEvidence, statusText, open, mode, consecutiveFailures);
    }
  }

  // === smart 模式：通过不弹，失败弹 ===
  if (mode === "smart") {
    if (allPassed) {
      return {
        mode: "smart",
        message: [
          `✅ Checkpoint 通过（smart 模式，自动继续）`,
          `**AI**: ${summary}`,
          diffSummary ? `**变更**: ${diffSummary.split("\n").length} 个文件` : "",
        ].filter(Boolean).join(" | "),
        pass: true,
        validation: allEvidence,
        diff_summary: diffSummary,
      };
    } else {
      return buildPopupResult(summary, evidenceText, diffSummary, diffContent, allEvidence, allPassed, hasEvidence, statusText, open, mode, consecutiveFailures);
    }
  }

  // === manual 模式：每次都弹 ===
  return buildPopupResult(summary, evidenceText, diffSummary, diffContent, allEvidence, allPassed, hasEvidence, statusText, open, mode, consecutiveFailures);
}

// ============================================================
// 构建弹窗结果
// ============================================================

function buildPopupResult(
  summary: string,
  evidenceText: string,
  diffSummary: string,
  diffContent: string,
  allEvidence: Record<string, { passed: boolean | null; output: string }>,
  allPassed: boolean,
  hasEvidence: boolean,
  statusText: string,
  open: string | undefined,
  mode: CheckpointMode,
  failures: number,
): object {
  const options = [
    {
      label: "✅ 合格，继续",
      value: "pass",
      description: "确认通过，AI 继续下一步",
    },
    {
      label: "❌ 不合格",
      value: "fail",
      description: "点击后输入理由，AI 根据反馈修复",
    },
    {
      label: `⚡ 切换到 ${mode === "manual" ? "smart" : "auto"}`,
      value: `switch_${mode === "manual" ? "smart" : "auto"}`,
      description: mode === "manual" ? "只在失败时弹窗" : "后续不再弹窗",
    },
  ];

  const warningText = failures >= 2
    ? `\n⚠️ **警告：连续 ${failures} 次验证失败**`
    : "";

  return {
    need_user_action: true,
    action_type: "ask_choice",
    message: [
      `## 🔍 Checkpoint (${mode} 模式)`,
      ``,
      `**AI 完成了**: ${summary}`,
      ``,
      diffSummary ? `### 变更概览\n\`\`\`\n${diffSummary}\n\`\`\`` : "",
      ``,
      evidenceText ? `### 验证结果\n${evidenceText}` : "",
      ``,
      open ? `🌐 **已打开**: ${open}` : "",
      ``,
      statusText + warningText,
    ]
      .filter(Boolean)
      .join("\n"),

    options,
    diff_summary: diffSummary,
    diff_content: diffContent,
    validation: allEvidence,
    open_url: open,
    all_passed: allPassed,
    mode,
    consecutive_failures: failures,
  };
}

// ============================================================
// 处理用户选择
// ============================================================

export function handleCheckpointAction(
  action: string,
  reason?: string
): object {
  // 模式切换
  if (action.startsWith("switch_")) {
    const newMode = action.replace("switch_", "") as CheckpointMode;
    return setMode(newMode);
  }

  switch (action) {
    case "pass":
      consecutiveFailures = 0;
      checkpointHistory.push({
        timestamp: new Date().toISOString(),
        summary: "用户确认通过",
        mode: currentMode,
        passed: true,
      });
      return {
        message: "✅ Checkpoint 通过，AI 继续下一步",
        pass: true,
      };

    case "fail":
      checkpointHistory.push({
        timestamp: new Date().toISOString(),
        summary: reason || "用户标记为不合格",
        mode: currentMode,
        passed: false,
        reason,
      });
      return {
        message: `❌ Checkpoint 未通过${reason ? `: ${reason}` : ""}`,
        pass: false,
        reason: reason || "用户标记为不合格",
        consecutive_failures: consecutiveFailures,
      };

    default:
      return { error: `未知动作: ${action}` };
  }
}
