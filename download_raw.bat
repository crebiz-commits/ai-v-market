@echo off
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/crebiz-commits/ai-v-market/7423bfc5d3c95ecd07eda80d29e0abb211abc698/src/app/components/DiscoveryFeed.tsx' -OutFile 'src\app\components\DiscoveryFeed.tsx'"
echo Done.
