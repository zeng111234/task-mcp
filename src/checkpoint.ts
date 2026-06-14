// ============================================================
// task-mcp — checkpoint 工具
// AI 跑完后停下来，让你确认是否合格
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/** checkpoint 参数 */
export interface CheckpointParams {
  /** 项目路径 */
  project: string;
  /** AI 做了什么（一句话） */
  summary: string;
  /** 证据：测试结果、构建结果等 */
  evidence?: {
    test?: string;
    build?: string;
    lint?: string;
    log?: string;
  };
  /** 要打开的 URL（可选，会展示在弹窗里） */
  open?: string;
  /** 自动跑验证命令（默认 true） */
  auto_validate?: boolean;
}

/** 验证命令检测 */
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

  // Makefile
  if (fs.existsSync(path.join(projectPath, "Makefile"))) {
    const content = fs.readFileSync(path.join(projectPath, "Makefile"), "utf-8");
    if (content.includes("test:")) commands.test = commands.test || "make test";
  }

  return commands;
}

/** 跑一个命令，返回结果 */
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

/** git diff 摘要 */
function getGitDiffSummary(projectPath: string): string {
  try {
    const diff = execSync("git diff --stat HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 10000,
    });
    return diff.trim().slice(0, 1000);
  } catch {
    return "";
  }
}

/** git diff 内容 */
function getGitDiffContent(projectPath: string): string {
  try {
    const diff = execSync("git diff HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 10000,
    });
    return diff.trim().slice(0, 3000);
  } catch {
    return "";
  }
}

/**
 * 核心：执行 checkpoint
 * 跑验证 → 收集证据 → 返回弹窗请求
 */
export function checkpoint(params: CheckpointParams): object {
  const {
    project,
    summary,
    evidence = {},
    open,
    auto_validate = true,
  } = params;

  // 1. 自动跑验证命令
  const validationResults: Record<string, { passed: boolean; output: string }> = {};

  if (auto_validate) {
    const commands = detectCommands(project);

    for (const [name, cmd] of Object.entries(commands)) {
      // 如果用户已经手动提供了结果，跳过
      if (evidence[name as keyof typeof evidence]) continue;

      const result = runCommand(cmd, project);
      validationResults[name] = result;
    }
  }

  // 2. 合并用户手动提供的证据和自动跑的结果
  const allEvidence: Record<string, { passed: boolean | null; output: string }> = {};

  // 用户手动提供的
  for (const [key, value] of Object.entries(evidence)) {
    if (value) {
      allEvidence[key] = { passed: null, output: value };
    }
  }

  // 自动跑的
  for (const [key, value] of Object.entries(validationResults)) {
    allEvidence[key] = value;
  }

  // 3. Git diff
  const diffSummary = getGitDiffSummary(project);
  const diffContent = getGitDiffContent(project);

  // 4. 判断整体状态
  const allPassed = Object.values(allEvidence).every(
    (e) => e.passed !== false
  );
  const hasEvidence = Object.keys(allEvidence).length > 0;

  // 5. 构建弹窗选项
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
  ];

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

  // 7. 返回结果（Reasonix 的 AI 会读到 need_user_action 并调用 ask 弹窗）
  return {
    need_user_action: true,
    action_type: "ask_choice",
    message: [
      `## 🔍 Checkpoint`,
      ``,
      `**AI 完成了**: ${summary}`,
      ``,
      diffSummary ? `### 变更概览\n\`\`\`\n${diffSummary}\n\`\`\`` : "",
      ``,
      evidenceText ? `### 验证结果\n${evidenceText}` : "",
      ``,
      open ? `🌐 **已打开**: ${open}` : "",
      ``,
      hasEvidence
        ? allPassed
          ? "🟢 所有验证通过"
          : "🔴 有验证失败项"
        : "⚪ 无验证结果",
    ]
      .filter(Boolean)
      .join("\n"),

    options,
    diff_summary: diffSummary,
    diff_content: diffContent,
    validation: allEvidence,
    open_url: open,
    all_passed: allPassed,
  };
}

/**
 * 处理用户的 checkpoint 选择
 */
export function handleCheckpointAction(
  action: string,
  reason?: string
): object {
  switch (action) {
    case "pass":
      return {
        message: "✅ Checkpoint 通过，AI 继续下一步",
        pass: true,
      };

    case "fail":
      return {
        message: `❌ Checkpoint 未通过${reason ? `: ${reason}` : ""}`,
        pass: false,
        reason: reason || "用户标记为不合格",
      };

    default:
      return { error: `未知动作: ${action}` };
  }
}
