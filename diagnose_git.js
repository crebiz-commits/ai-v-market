const fs = require('fs');
const path = require('path');

const commonPaths = [
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\bin\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  process.env.LOCALAPPDATA + '\\Programs\\Git\\cmd\\git.exe'
];

console.log('--- Checking for Git Lock File ---');
const lockPath = 'e:\\ai_market\\.git\\index.lock';
if (fs.existsSync(lockPath)) {
  console.log('!!! Found Git Lock File: ' + lockPath);
  console.log('This is likely why commits are failing.');
} else {
  console.log('No Git Lock File found.');
}

console.log('\n--- Searching for git.exe ---');
commonPaths.forEach(p => {
  if (fs.existsSync(p)) {
    console.log('Found git at: ' + p);
  }
});

try {
  const { execSync } = require('child_process');
  const pathEnv = execSync('echo %PATH%', { encoding: 'utf-8' });
  console.log('\n--- Current PATH ---');
  console.log(pathEnv.substring(0, 500) + '...');
} catch (e) {}
