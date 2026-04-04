const cp = require('child_process');
const fs = require('fs');
try {
  const result = cp.execSync('git log --oneline -n 25');
  fs.writeFileSync('git_history.txt', result);
} catch (e) {
  fs.writeFileSync('git_history.txt', e.toString());
}
