// Hook: 写文件后提醒 + test/build 后拦截
// exit 0 = 继续 | exit 1 = 注入警告 | exit 2 = 拦截+注入
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const p = JSON.parse(Buffer.concat(chunks).toString());
    const name = p.toolName || '';
    const args = p.toolArgs || {};

    // 写文件后：exit 1 注入提醒
    if (['write_file', 'edit_file', 'multi_edit'].includes(name)) {
      const f = args.path || '';
      if (f.includes('node_modules') || f.includes('.git')) return process.exit(0);
      process.stderr.write('文件已修改。请调用 checkpoint 工具验证变更后再继续。');
      return process.exit(1);
    }

    // test/build 命令后：exit 2 拦截
    if (name === 'run_command') {
      const cmd = args.command || '';
      if (/\b(test|jest|pytest|vitest|cargo test|go test|npm run build)\b/.test(cmd)) {
        process.stderr.write('测试/构建已执行。请调用 checkpoint 工具展示结果并等待用户确认。');
        return process.exit(2);
      }
    }

    process.exit(0);
  } catch { process.exit(0); }
});
