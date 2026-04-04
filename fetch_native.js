const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/crebiz-commits/ai-v-market/7423bfc5d3c95ecd07eda80d29e0abb211abc698/src/app/components/DiscoveryFeed.tsx';
const dest = 'e:\\ai_market\\github_source.txt';
const log = 'e:\\ai_market\\github_source_log.txt';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      fs.writeFileSync(dest, data, 'utf8');
      fs.writeFileSync(log, 'SUCCESS');
    } catch(err) {
      fs.writeFileSync(log, err.toString());
    }
  });
}).on('error', (err) => {
  fs.writeFileSync(log, err.toString());
});
