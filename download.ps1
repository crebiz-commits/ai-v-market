$response = Invoke-WebRequest -Uri "https://raw.githubusercontent.com/crebiz-commits/ai-v-market/7423bfc5d3c95ecd07eda80d29e0abb211abc698/src/app/components/DiscoveryFeed.tsx"
Set-Content -Path "src\app\components\DiscoveryFeed.tsx" -Value $response.Content -Encoding UTF8
Write-Output "Successfully downloaded."
