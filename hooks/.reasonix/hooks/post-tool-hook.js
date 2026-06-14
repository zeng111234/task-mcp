// Hook: 检测写文件操作，提醒调用 checkpoint
// exit 0 = 继续 | exit 1 = 注入警告 | exit 2 = 拦截

const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    const toolName = payload.toolName || '';
    const toolArgs = payload.toolArgs || {};

    // 写文件操作
    if (['write_file', 'edit_file', 'multi_edit'].includes(toolName)) {
      const filePath = toolArgs.path || toolArgs.file || '';
      // 跳过系统文件
      if (filePath.includes('.task-mcp') || filePath.includes('node_modules') || filePath.includes('.git')) {
        process.exit(0);
      }
      process.stderr.write('文件已修改，建议调用 checkpoint 工具验证变更');
      process.exit(1);
    }

    // 测试/构建命令
    if (toolName === 'run_command') {
      const cmd = toolArgs.command || '';
      if (/\b(test|jest|pytest|vitest|cargo test|go test|npm run build)\b/.test(cmd)) {
        process.stderr.write('测试/构建命令已执行，请调用 checkpoint 工具进行人工验证');
        process.exit(2);
      }
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
