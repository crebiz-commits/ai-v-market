const cp = require('child_process');
const fs = require('fs');

try {
  const result = cp.execSync('git show 7423bfc5d3c95ecd07eda80d29e0abb211abc698:src/app/components/DiscoveryFeed.tsx', { encoding: 'utf8' });
  fs.writeFileSync('e:\\ai_market\\src\\app\\components\\DiscoveryFeed.tsx', result);
  fs.writeFileSync('e:\\ai_market\\checkout_result.txt', 'SUCCESS');
} catch (e) {
  fs.writeFileSync('e:\\ai_market\\checkout_result.txt', e.toString() + '\\n' + (e.stdout ? e.stdout.toString() : '') + '\\n' + (e.stderr ? e.stderr.toString() : ''));
}
