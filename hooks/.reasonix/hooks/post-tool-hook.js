// Hook: test/build 命令后拦截，要求调用 checkpoint
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    const cmd = payload.toolArgs?.command || '';
    if (/\b(test|jest|pytest|vitest|cargo test|go test|npm run build)\b/.test(cmd)) {
      process.stderr.write('测试/构建已执行，请调用 checkpoint 工具验证');
      process.exit(2);
    }
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
