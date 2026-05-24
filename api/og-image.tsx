// ════════════════════════════════════════════════════════════════════════════
// 동적 OG 기본 이미지 (Vercel Edge Function)
//
// URL: https://www.creaite.net/api/og-image
//
// 동작:
//   - 1200x630 PNG 즉석 생성 (다크 시네마틱 배경 + 그라데이션 로고/CREAITE + 카피)
//   - api/og.ts 의 fallback OG 이미지로 사용
//   - index.html 의 기본 og:image / twitter:image 로도 사용
//
// 디자인 검증: src/app/components/OgPreview.tsx 의 VariantB 와 동일
// ════════════════════════════════════════════════════════════════════════════

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const PRETENDARD_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/Pretendard-Bold.otf";
const PRETENDARD_BLACK_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/static/Pretendard-Black.otf";

async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// 로고를 인라인 SVG data URL로 — satori가 그대로 비트맵 렌더
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="50%" stop-color="#ec4899"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect x="12" y="35" width="8" height="30" rx="4" fill="url(#g)"/>
  <rect x="26" y="20" width="8" height="60" rx="4" fill="url(#g)"/>
  <rect x="40" y="10" width="8" height="80" rx="4" fill="url(#g)"/>
  <rect x="54" y="25" width="8" height="50" rx="4" fill="url(#g)"/>
  <rect x="68" y="15" width="8" height="70" rx="4" fill="url(#g)"/>
  <path d="M 82 28 L 82 72 L 96 50 Z" fill="url(#g)"/>
</svg>`;
const LOGO_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`;

export default async function handler(_req: Request): Promise<Response> {
  const [boldData, blackData] = await Promise.all([
    loadFont(PRETENDARD_BOLD_URL),
    loadFont(PRETENDARD_BLACK_URL),
  ]);

  const fonts: any[] = [];
  if (boldData) fonts.push({ name: "Pretendard", data: boldData, weight: 700, style: "normal" });
  if (blackData) fonts.push({ name: "Pretendard", data: blackData, weight: 900, style: "normal" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0a 100%)",
          fontFamily: "Pretendard, sans-serif",
          position: "relative",
        }}
      >
        {/* 좌상단 보라 글로우 */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -120,
            width: 480,
            height: 480,
            borderRadius: 240,
            background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 60%)",
            display: "flex",
          }}
        />
        {/* 우하단 황색 글로우 */}
        <div
          style={{
            position: "absolute",
            bottom: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: 240,
            background: "radial-gradient(circle, rgba(245,158,11,0.28) 0%, transparent 60%)",
            display: "flex",
          }}
        />

        {/* [그룹 1] 로고 + CREAITE */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
          <img src={LOGO_DATA_URL} width={120} height={120} style={{ marginBottom: 28 }} />
          <div
            style={{
              fontSize: 132,
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1,
              backgroundImage: "linear-gradient(135deg, #a78bfa 0%, #ec4899 50%, #f59e0b 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            CREAITE
          </div>
        </div>

        {/* [그룹 2] 카피 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 42, zIndex: 1 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.01em" }}>
            세계 최초 AI 시네마 OTT
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginTop: 12, letterSpacing: "0.05em" }}>
            World's First AI Cinema OTT
          </div>
        </div>

        {/* [그룹 3] 도메인 */}
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.4em", marginTop: 32, zIndex: 1 }}>
          WWW.CREAITE.NET
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length > 0 ? fonts : undefined,
      headers: {
        "cache-control": "public, s-maxage=3600, max-age=600",
      },
    },
  );
}
