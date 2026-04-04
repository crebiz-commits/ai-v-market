import subprocess
import os

commit_hash = "7423bfc5d3c95ecd07eda80d29e0abb211abc698"
file_path = "src/app/components/DiscoveryFeed.tsx"
out_path = r"C:\Users\nomad\.gemini\antigravity\brain\2b1e3cae-c469-4a2e-be03-aebf7e25d136\v111_source.tsx"

os.chdir(r"e:\ai_market")

try:
    # Use utf-8 decoding
    output = subprocess.check_output(
        ['git', 'show', f'{commit_hash}:{file_path}'],
        stderr=subprocess.STDOUT
    ).decode('utf-8', errors='replace')
    
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)
    print("Success")
except Exception as e:
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(str(e))
    print("Error written")
