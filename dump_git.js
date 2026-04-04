const { execSync } = require('child_process');
const fs = require('fs');

try {
  const result = execSync('git show 7423bfc5d3c95ecd07eda80d29e0abb211abc698:src/app/components/DiscoveryFeed.tsx', { encoding: 'utf8' });
  fs.writeFileSync('e:\\ai_market\\extracted.txt', result);
} catch (e) {
  fs.writeFileSync('e:\\ai_market\\extracted.txt', "ERROR CATCHED: " + e.toString());
}
