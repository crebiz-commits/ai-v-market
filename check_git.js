const cp = require('child_process');
const fs = require('fs');
try {
  const remote = cp.execSync('git remote -v', { encoding: 'utf-8' });
  const status = cp.execSync('git status', { encoding: 'utf-8' });
  const log = cp.execSync('git log -n 1 --oneline', { encoding: 'utf-8' });
  fs.writeFileSync('git_check_report.txt', `REMOTE:\n${remote}\n\nSTATUS:\n${status}\n\nLOG:\n${log}`);
} catch (e) {
  fs.writeFileSync('git_check_report.txt', 'ERROR:\n' + e.stdout + '\n' + e.stderr);
}
