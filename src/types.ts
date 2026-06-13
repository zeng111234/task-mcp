// ============================================================
// task-mcp 类型定义
// ============================================================

/** 子任务状态 */
export type SubtaskStatus =
  | "pending"      // 未开始
  | "in_progress"  // 执行中
  | "completed"    // 已完成，等待确认
  | "confirmed"    // 用户已确认
  | "redo"         // 用户要求重做
  | "skipped"      // 用户跳过
  | "failed";      // 执行失败

/** 用户动作 */
export type UserAction =
  | "confirm"   // 确认，继续
  | "test"      // 跑测试再决定
  | "redo"      // 重做（附带理由）
  | "auto"      // 自动模式：后续任务无需确认
  | "pause"     // 暂停
  | "abort";    // 终止，回滚

/** 子任务 */
export interface Subtask {
  id: number;
  title: string;
  description: string;
  estimated_lines: number;
  files_to_modify: string[];
  status: SubtaskStatus;
  code?: string;
  diff?: string;
  error?: string;
  redo_reason?: string;
  redo_count: number;
}

/** 任务计划 */
export interface TaskPlan {
  id: string;
  intent: string;
  project_path: string;
  subtasks: Subtask[];
  current_index: number;
  created_at: string;
  validate_commands?: ValidateCommands;
  auto_mode?: boolean;  // 自动模式：后续任务无需确认
}

/** 验证命令 */
export interface ValidateCommands {
  lint?: string;
  test?: string;
  build?: string;
  run?: string;
}

/** 验证结果 */
export interface ValidationResult {
  success: boolean;
  results: {
    name: string;
    command: string;
    passed: boolean;
    stdout: string;
    stderr: string;
  }[];
}

/** diff 结果 */
export interface DiffResult {
  file: string;
  additions: number;
  deletions: number;
  patch: string;
}

/** 任务执行器参数 */
export interface TaskRunnerParams {
  /** 项目路径 */
  project: string;
  /** 任务描述（自然语言） */
  intent: string;
  /** 自动拆分 or 手动指定 */
  subtasks?: "auto" | SubtaskInput[];
  /** 验证命令 */
  validate?: ValidateCommands;
  /** 最大重试次数 */
  max_retries?: number;
}

/** 用户手动指定的子任务输入 */
export interface SubtaskInput {
  title: string;
  description: string;
}

/** ask 工具的选项 */
export interface AskOption {
  label: string;
  value: UserAction;
  description?: string;
}

/** 工具返回的需要用户确认的结果 */
export interface ActionRequiredResult {
  need_user_action: true;
  task_plan_id: string;
  current_subtask: Subtask;
  diff_preview: string;
  progress: string;
  options: AskOption[];
}
