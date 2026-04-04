const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/crebiz-commits/ai-v-market/7423bfc5d3c95ecd07eda80d29e0abb211abc698/src/app/components/DiscoveryFeed.tsx';
const dest = 'e:\\ai_market\\src\\app\\components\\DiscoveryFeed.tsx';

https.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Status Code: ${res.statusCode}`);
    return;
  }

  const file = fs.createWriteStream(dest);
  res.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log('Download Completed to ' + dest);
  });
}).on('error', (err) => {
  console.error('Error: ', err.message);
});
