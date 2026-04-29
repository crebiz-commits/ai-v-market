// PWA 아이콘 생성 스크립트
// public/icon.svg → 다양한 크기의 PNG로 렌더링
// 실행: node scripts/generate-icons.mjs

import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public/icon.svg");
const svg = readFileSync(svgPath);

const targets = [
  { out: "public/icon-192.png", size: 192 },
  { out: "public/icon-512.png", size: 512 },
  { out: "public/apple-touch-icon.png", size: 180 },
  { out: "public/icon-64.png", size: 64 },
  { out: "public/icon-32.png", size: 32 },
  { out: "public/icon-16.png", size: 16 },
];

for (const { out, size } of targets) {
  await sharp(svg)
    .resize(size, size)
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(join(root, out));
  console.log(`✓ ${out} (${size}x${size})`);
}

console.log("\n완료. 이제 manifest.json은 정확한 사이즈와 일치하는 PNG를 사용합니다.");
