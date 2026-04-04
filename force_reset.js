const cp = require('child_process');
const fs = require('fs');

try {
  // Use exact commit hash
  const commit = '7423bfc5d3c95ecd07eda80d29e0abb211abc698';
  console.log(`Resetting to ${commit}...`);
  
  // Hard reset
  cp.execSync(`git reset --hard ${commit}`, { stdio: 'inherit' });
  
  // Clean untracked files
  cp.execSync('git clean -fd', { stdio: 'inherit' });
  
  fs.writeFileSync('reset_success.txt', 'Successfully reset and cleaned repository.');
} catch (error) {
  console.error(error);
  fs.writeFileSync('reset_error.txt', error.toString());
}
