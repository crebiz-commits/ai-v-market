// 랜딩 페이지 포스터 일괄 압축 스크립트
// - 원본은 _original/ 폴더에 백업
// - 800 × 1200 (2:3 cover) / JPEG quality 80 / progressive
// 실행: node scripts/compress-landing-posters.mjs
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

const DIR = path.resolve("public/landing-posters");
const BACKUP = path.join(DIR, "_original");

const files = (await fs.readdir(DIR)).filter((f) => /^\d{2}-.+\.jpg$/i.test(f));

await fs.mkdir(BACKUP, { recursive: true });

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  const src = path.join(DIR, file);
  const backup = path.join(BACKUP, file);
  const tmp = path.join(DIR, file + ".tmp");

  const beforeStat = await fs.stat(src);
  totalBefore += beforeStat.size;

  // 백업 (이미 있으면 건너뜀)
  try {
    await fs.access(backup);
  } catch {
    await fs.copyFile(src, backup);
  }

  await sharp(src)
    .resize(800, 1200, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toFile(tmp);

  await fs.unlink(src);
  await fs.rename(tmp, src);

  const afterStat = await fs.stat(src);
  totalAfter += afterStat.size;
  const pct = ((1 - afterStat.size / beforeStat.size) * 100).toFixed(0);
  console.log(
    `${file}: ${(beforeStat.size / 1024).toFixed(0)}KB → ${(afterStat.size / 1024).toFixed(0)}KB (-${pct}%)`,
  );
}

console.log(
  `\nTotal: ${(totalBefore / 1024 / 1024).toFixed(2)}MB → ${(totalAfter / 1024 / 1024).toFixed(2)}MB (-${(
    (1 - totalAfter / totalBefore) *
    100
  ).toFixed(0)}%)`,
);
