// ============================================================
// guard.js — Reasonix Workflow 守卫
// 核心：按阶段限制工具，verify 阶段要求人工确认
// ============================================================

const fs = require('fs');
const path = require('path');

// ============================================================
// 路径
// ============================================================

const PROJECT_ROOT = process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, '.reasonix', 'state.json');
const WORKFLOW_FILE = path.join(PROJECT_ROOT, '.reasonix', 'workflow.yaml');

// ============================================================
// 读取 stdin（Reasonix Hook 传入的 payload）
// ============================================================

const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    main(payload);
  } catch (e) {
    // 解析失败，放行
    process.exit(0);
  }
});

// ============================================================
// 状态管理
// ============================================================

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {}
  return { stage: 'analyze', mode: 'smart', history: [], approvals: 0, rejections: 0 };
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ============================================================
// 解析 workflow.yaml（简单解析，不依赖 yaml 库）
// ============================================================

function loadWorkflow() {
  try {
    const content = fs.readFileSync(WORKFLOW_FILE, 'utf-8');
    // 简单提取每个 stage 的 name 和 allowed_tools
    const stages = {};
    const stageBlocks = content.split(/^- name:/m).slice(1);

    for (const block of stageBlocks) {
      const nameMatch = block.match(/^(\S+)/);
      if (!nameMatch) continue;
      const name = nameMatch[1];

      const toolsMatch = block.match(/allowed_tools:\s*\n((?:\s+-\s+.+\n?)+)/);
      const tools = [];
      if (toolsMatch) {
        const lines = toolsMatch[1].split('\n');
        for (const line of lines) {
          const m = line.match(/^\s+-\s+(.+)/);
          if (m) tools.push(m[1].trim());
        }
      }

      const autoAdvance = block.includes('auto_advance: true');
      const requireApproval = block.includes('require_approval: true');

      // 提取 next
      const nextMatch = block.match(/next:\s*(\S+)/);
      const next = nextMatch ? nextMatch[1] : null;

      stages[name] = { tools, autoAdvance, requireApproval, next };
    }

    return stages;
  } catch {
    return null;
  }
}

// ============================================================
// 阶段转换
// ============================================================

function advanceStage(state, workflow, targetStage) {
  const current = workflow[state.stage];
  if (!current) return false;

  // 只能转到 next 阶段
  if (current.next === targetStage || targetStage === null) {
    state.stage = current.next || targetStage;
    state.history.push({
      from: state.stage,
      to: current.next || targetStage,
      at: new Date().toISOString()
    });
    saveState(state);
    return true;
  }
  return false;
}

// ============================================================
// 判断工具属于哪个阶段
// ============================================================

const READ_TOOLS = new Set(['read_file', 'list_directory', 'directory_tree', 'glob', 'search_content', 'search_files', 'get_file_info']);
const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit', 'create_directory', 'delete_file', 'move_file', 'copy_file']);
const EXEC_TOOLS = new Set(['run_command', 'run_background']);

function toolCategory(toolName) {
  if (READ_TOOLS.has(toolName)) return 'read';
  if (WRITE_TOOLS.has(toolName)) return 'write';
  if (EXEC_TOOLS.has(toolName)) return 'exec';
  return 'other';
}

function isTestCommand(toolArgs) {
  const cmd = toolArgs?.command || '';
  return /\b(test|jest|pytest|vitest|cargo test|go test|npm run build|npm run lint)\b/.test(cmd);
}

// ============================================================
// 核心逻辑
// ============================================================

function main(payload) {
  const event = payload.event || payload.HOOK_EVENT || '';
  const toolName = payload.toolName || payload.tool_name || '';
  const toolArgs = payload.toolArgs || payload.tool_input || {};

  const state = loadState();
  const workflow = loadWorkflow();

  if (!workflow) {
    // 没有 workflow 文件，放行
    process.exit(0);
    return;
  }

  const currentStage = workflow[state.stage];

  // === PreToolUse：检查工具权限 ===
  if (event === 'PreToolUse') {
    // 读操作总是放行
    if (READ_TOOLS.has(toolName)) {
      process.exit(0);
      return;
    }

    // 写操作：如果还在 analyze 阶段，自动切到 code
    if (WRITE_TOOLS.has(toolName)) {
      if (state.stage === 'analyze') {
        state.stage = 'code';
        state.history.push({ from: 'analyze', to: 'code', at: new Date().toISOString(), trigger: toolName });
        saveState(state);
      }
      // code 阶段允许写
      process.exit(0);
      return;
    }

    // 执行命令：如果在 analyze 或 code，自动切到 verify
    if (EXEC_TOOLS.has(toolName)) {
      if (state.stage === 'analyze') {
        state.stage = 'code';
        state.history.push({ from: 'analyze', to: 'code', at: new Date().toISOString(), trigger: toolName });
        saveState(state);
      }
      // code 阶段跑命令 → 允许（跑测试是 verify 的一部分，但由 PostToolUse 处理确认）
      process.exit(0);
      return;
    }

    // 其他工具，放行
    process.exit(0);
    return;
  }

  // === PostToolUse：处理阶段转换和确认 ===
  if (event === 'PostToolUse') {
    // 测试/构建命令执行后，进入 verify 阶段
    if (EXEC_TOOLS.has(toolName) && isTestCommand(toolArgs)) {
      state.stage = 'verify';
      state.history.push({ from: 'code', to: 'verify', at: new Date().toISOString(), trigger: toolName });
      saveState(state);

      // smart/auto 模式：如果测试通过，自动继续
      if (state.mode === 'auto') {
        // auto 模式：不管通过与否都继续
        state.stage = 'code';
        state.history.push({ from: 'verify', to: 'code', at: new Date().toISOString(), trigger: 'auto_approve' });
        saveState(state);
        process.exit(0);
        return;
      }

      // smart 模式和 manual 模式：要求人工确认
      // 注入消息要求 AI 调用 checkpoint
      process.stderr.write(
        '[Harness] 测试/构建已执行。当前阶段：verify。' +
        '请调用 checkpoint 工具展示结果，等待用户确认。' +
        '用户确认后才能继续。'
      );
      process.exit(2); // 拦截
      return;
    }

    // 写文件后：smart 模式下注入提醒
    if (WRITE_TOOLS.has(toolName) && state.mode !== 'auto') {
      process.stderr.write('[Harness] 文件已修改。完成后请跑测试验证。');
      process.exit(1); // 警告
      return;
    }

    process.exit(0);
    return;
  }

  // 默认放行
  process.exit(0);
}
