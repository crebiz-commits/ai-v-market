const cp = require('child_process');
const fs = require('fs');

try {
  const commit = '7423bfc5d3c95ecd07eda80d29e0abb211abc698';
  // Read file from that commit
  const fileContent = cp.execSync(`git show ${commit}:src/app/components/DiscoveryFeed.tsx`);
  
  // Write the file directly to the working directory, overwriting whatever is there
  fs.writeFileSync('src/app/components/DiscoveryFeed.tsx', fileContent);
  
  console.log('Successfully extracted and overwrote DiscoveryFeed.tsx');
  fs.writeFileSync('extract_success.txt', 'Done');
} catch (err) {
  console.error(err);
  fs.writeFileSync('extract_error.txt', err.toString());
}
