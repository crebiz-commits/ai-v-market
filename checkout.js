const cp = require('child_process');
try {
  cp.execSync('git checkout 7423bfc5d3c95ecd07eda80d29e0abb211abc698 -- src/app/components/DiscoveryFeed.tsx', { stdio: 'inherit' });
  console.log('Successfully checked out the exact file from v1.1.1 commit.');
} catch (e) {
  console.error('Error checking out file:', e.message);
}
