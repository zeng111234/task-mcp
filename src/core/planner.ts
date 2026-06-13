// ============================================================
// 任务拆分器 — 分析项目结构，把大任务拆成小任务
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { Subtask, TaskPlan, ValidateCommands } from "../types";

/**
 * 读取项目结构概览（文件树 + 关键文件内容摘要）
 */
export function scanProject(projectPath: string): string {
  const lines: string[] = [];
  const MAX_DEPTH = 3;
  const MAX_FILE_SIZE = 2000; // 只读前 2000 字符

  function walk(dir: string, depth: number, prefix: string) {
    if (depth > MAX_DEPTH) return;
    const ignore = new Set([
      "node_modules", ".git", "dist", "build", ".next",
      "__pycache__", ".venv", "venv", ".env",
    ]);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // 排序：目录在前，文件在后
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(projectPath, fullPath);

      if (entry.isDirectory()) {
        lines.push(`${prefix}📁 ${entry.name}/`);
        walk(fullPath, depth + 1, prefix + "  ");
      } else {
        const ext = path.extname(entry.name);
        const sizeIndicator = getFileSizeIndicator(fullPath);
        lines.push(`${prefix}📄 ${entry.name} ${sizeIndicator}`);
      }
    }
  }

  walk(projectPath, 0, "");
  return lines.join("\n");
}

/**
 * 获取文件大小指示器
 */
function getFileSizeIndicator(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 1000) return "";
    if (stat.size < 5000) return "(~100行)";
    if (stat.size < 20000) return "(~500行)";
    return "(大文件)";
  } catch {
    return "";
  }
}

/**
 * 读取关键文件的前 N 行，供 AI 理解上下文
 */
export function readKeyFiles(
  projectPath: string,
  files: string[],
  maxLines: number = 30
): string {
  const result: string[] = [];

  for (const file of files) {
    const fullPath = path.join(projectPath, file);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      const preview = lines.slice(0, maxLines).join("\n");
      const truncated = lines.length > maxLines
        ? `\n... (共 ${lines.length} 行，只展示前 ${maxLines} 行)`
        : "";
      result.push(`=== ${file} ===\n${preview}${truncated}`);
    } catch {
      // 文件不存在或无法读取，跳过
    }
  }

  return result.join("\n\n");
}

/**
 * 查找与任务相关的文件
 */
export function findRelevantFiles(
  projectPath: string,
  intent: string
): string[] {
  const keywords = extractKeywords(intent);
  const relevantFiles: { file: string; score: number }[] = [];

  function walk(dir: string, depth: number) {
    if (depth > 3) return;
    const ignore = new Set([
      "node_modules", ".git", "dist", "build", ".next",
      "__pycache__", ".venv", "venv",
    ]);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else {
        const relPath = path.relative(projectPath, fullPath);
        const score = calculateRelevance(entry.name, relPath, keywords);
        if (score > 0) {
          relevantFiles.push({ file: relPath, score });
        }
      }
    }
  }

  walk(projectPath, 0);
  relevantFiles.sort((a, b) => b.score - a.score);
  return relevantFiles.slice(0, 10).map((f) => f.file);
}

/**
 * 从任务描述中提取关键词
 */
function extractKeywords(intent: string): string[] {
  // 去掉常见停用词，提取有意义的词
  const stopWords = new Set([
    "的", "了", "在", "是", "我", "有", "和", "就",
    "不", "人", "都", "一", "一个", "上", "也", "很",
    "到", "说", "要", "去", "你", "会", "着", "没有",
    "看", "好", "自己", "这", "他", "她", "它",
    "给", "帮", "做", "把", "从", "对", "用",
    "a", "an", "the", "is", "are", "was", "were",
    "to", "of", "in", "for", "on", "with", "at",
    "by", "from", "as", "into", "about", "like",
    "add", "new", "create", "make", "fix", "update",
    "implement", "feature", "function", "module",
  ]);

  const words = intent
    .replace(/[^\w\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()));

  return [...new Set(words)];
}

/**
 * 计算文件与任务的相关度
 */
function calculateRelevance(
  fileName: string,
  relPath: string,
  keywords: string[]
): number {
  let score = 0;
  const nameLower = fileName.toLowerCase();
  const pathLower = relPath.toLowerCase();

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (nameLower.includes(kwLower)) score += 3;
    if (pathLower.includes(kwLower)) score += 1;
  }

  // 源代码文件加分
  if (/\.(ts|js|py|go|rs|java|jsx|tsx)$/.test(fileName)) score += 1;
  // 测试文件加分
  if (/\.(test|spec)\./.test(fileName)) score += 2;

  return score;
}

/**
 * 检测项目的验证命令（从 package.json 等推断）
 */
export function detectValidateCommands(projectPath: string): ValidateCommands {
  const commands: ValidateCommands = {};

  // 检查 package.json
  const pkgPath = path.join(projectPath, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts || {};

    if (scripts.lint) commands.lint = "npm run lint";
    if (scripts.test) commands.test = "npm test";
    if (scripts.build) commands.build = "npm run build";
    if (scripts.check) commands.lint = "npm run check";
  } catch {
    // 没有 package.json
  }

  // 检查 Makefile
  const makePath = path.join(projectPath, "Makefile");
  if (fs.existsSync(makePath)) {
    const content = fs.readFileSync(makePath, "utf-8");
    if (content.includes("test:")) commands.test = "make test";
    if (content.includes("lint:")) commands.lint = "make lint";
  }

  // 检查 pyproject.toml / setup.py
  if (fs.existsSync(path.join(projectPath, "pyproject.toml"))) {
    commands.test = "python -m pytest";
  }

  return commands;
}

/**
 * 保存任务计划到文件
 */
export function savePlan(projectPath: string, plan: TaskPlan): void {
  const planDir = path.join(projectPath, ".task-mcp");
  if (!fs.existsSync(planDir)) {
    fs.mkdirSync(planDir, { recursive: true });
  }
  const planPath = path.join(planDir, `plan-${plan.id}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf-8");
}

/**
 * 加载任务计划
 */
export function loadPlan(projectPath: string, planId: string): TaskPlan | null {
  const planPath = path.join(projectPath, ".task-mcp", `plan-${planId}.json`);
  try {
    return JSON.parse(fs.readFileSync(planPath, "utf-8"));
  } catch {
    return null;
  }
}
