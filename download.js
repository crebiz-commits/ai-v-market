const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/crebiz-commits/ai-v-market/7423bfc5d3c95ecd07eda80d29e0abb211abc698/src/app/components/DiscoveryFeed.tsx';
const dest = 'src/app/components/DiscoveryFeed.tsx';

https.get(url, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed to download: ${res.statusCode}`);
    return;
  }
  const file = fs.createWriteStream(dest);
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    fs.writeFileSync('fetch_success.txt', 'Done');
  });
}).on('error', (err) => {
  fs.writeFileSync('fetch_error.txt', err.toString());
});
