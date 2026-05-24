// ════════════════════════════════════════════════════════════════════════════
// OG 이미지 디자인 미리보기 (?preview=og)
//
// 3가지 디자인 시안 비교. 사용자가 선택한 시안을 api/og-image.tsx에 적용.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";

type Variant = "A" | "B" | "C";

const variants: { key: Variant; name: string; desc: string }[] = [
  { key: "A", name: "A안 · 그라데이션 + 로고 상단", desc: "현재 디자인에 로고 추가 — 가장 밝고 친근" },
  { key: "B", name: "B안 · 다크 + 시네마틱", desc: "어두운 배경 + 그라데이션 로고 — OTT 영화관 느낌" },
  { key: "C", name: "C안 · 가로 분할 (로고 좌·텍스트 우)", desc: "모던 / 미니멀 — 로고가 메인" },
];

// 공통 로고 컴포넌트 — creaite-logo.svg와 동일 디자인을 인라인 SVG로
function CreaiteLogo({ size = 140, useBrandGradient = true }: { size?: number; useBrandGradient?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`og-grad-${useBrandGradient ? "brand" : "aurora"}`} x1="0%" y1="0%" x2="100%" y2="100%">
          {useBrandGradient ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#f59e0b" />
            </>
          )}
        </linearGradient>
      </defs>
      <rect x="12" y="35" width="8" height="30" rx="4" fill={`url(#og-grad-${useBrandGradient ? "brand" : "aurora"})`} />
      <rect x="26" y="20" width="8" height="60" rx="4" fill={`url(#og-grad-${useBrandGradient ? "brand" : "aurora"})`} />
      <rect x="40" y="10" width="8" height="80" rx="4" fill={`url(#og-grad-${useBrandGradient ? "brand" : "aurora"})`} />
      <rect x="54" y="25" width="8" height="50" rx="4" fill={`url(#og-grad-${useBrandGradient ? "brand" : "aurora"})`} />
      <rect x="68" y="15" width="8" height="70" rx="4" fill={`url(#og-grad-${useBrandGradient ? "brand" : "aurora"})`} />
      <polygon points="82,28 82,72 96,50" fill={`url(#og-grad-${useBrandGradient ? "brand" : "aurora"})`} />
    </svg>
  );
}

// 시안 A — 그라데이션 배경 + 로고 상단 + 텍스트
function VariantA() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #a78bfa 0%, #ec4899 50%, #f59e0b 100%)",
        fontFamily: "Pretendard, 'Apple SD Gothic Neo', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.25) 100%)" }} />
      <div style={{ zIndex: 1, marginBottom: 20 }}>
        <CreaiteLogo size={140} useBrandGradient={true} />
      </div>
      <div style={{ fontSize: 160, fontWeight: 900, color: "white", letterSpacing: "-0.04em", lineHeight: 1, textShadow: "0 6px 28px rgba(0,0,0,0.35)", zIndex: 1 }}>CREAITE</div>
      <div style={{ fontSize: 42, fontWeight: 700, color: "rgba(255,255,255,0.98)", marginTop: 22, letterSpacing: "-0.01em", textShadow: "0 2px 12px rgba(0,0,0,0.25)", zIndex: 1 }}>세계 최초 AI 시네마 OTT</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.75)", marginTop: 10, letterSpacing: "0.04em", zIndex: 1 }}>World's First AI Cinema OTT</div>
      <div style={{ position: "absolute", bottom: 40, fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.25em", zIndex: 1 }}>WWW.CREAITE.NET</div>
    </div>
  );
}

// 시안 B — 다크 시네마틱
function VariantB() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0a 100%)",
        fontFamily: "Pretendard, 'Apple SD Gothic Neo', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 좌상단 글로우 */}
      <div style={{ position: "absolute", top: -120, left: -120, width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 60%)", filter: "blur(20px)" }} />
      {/* 우하단 글로우 */}
      <div style={{ position: "absolute", bottom: -120, right: -120, width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(245,158,11,0.28) 0%, transparent 60%)", filter: "blur(20px)" }} />

      {/* [그룹 1] 로고 + CREAITE — 타이틀 (시각 중심) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1 }}>
        <div style={{ marginBottom: 28 }}>
          <CreaiteLogo size={120} useBrandGradient={false} />
        </div>
        <div style={{
          fontSize: 132,
          fontWeight: 900,
          letterSpacing: "-0.045em",
          lineHeight: 1,
          backgroundImage: "linear-gradient(135deg, #a78bfa 0%, #ec4899 50%, #f59e0b 100%)",
          backgroundClip: "text",
          color: "transparent",
        }}>CREAITE</div>
      </div>

      {/* [그룹 2] 카피 — 한국어 + 영문 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 42, zIndex: 1 }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.01em" }}>세계 최초 AI 시네마 OTT</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginTop: 12, letterSpacing: "0.05em" }}>World's First AI Cinema OTT</div>
      </div>

      {/* [그룹 3] 도메인 — 카피와 가까이 묶고 박스 하단에서 멀어짐 */}
      <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.4em", marginTop: 32, zIndex: 1 }}>WWW.CREAITE.NET</div>
    </div>
  );
}

// 시안 C — 가로 분할 (로고 좌·텍스트 우)
function VariantC() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        background: "linear-gradient(135deg, #a78bfa 0%, #ec4899 50%, #f59e0b 100%)",
        fontFamily: "Pretendard, 'Apple SD Gothic Neo', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.25) 100%)" }} />

      {/* 좌측 로고 영역 */}
      <div style={{ width: "42%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
        <CreaiteLogo size={260} useBrandGradient={true} />
      </div>
      {/* 우측 텍스트 영역 */}
      <div style={{ width: "58%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 60, zIndex: 1 }}>
        <div style={{ fontSize: 110, fontWeight: 900, color: "white", letterSpacing: "-0.04em", lineHeight: 1, textShadow: "0 6px 28px rgba(0,0,0,0.35)" }}>CREAITE</div>
        <div style={{ fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,0.98)", marginTop: 18, letterSpacing: "-0.01em", textShadow: "0 2px 12px rgba(0,0,0,0.25)" }}>세계 최초 AI 시네마 OTT</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.75)", marginTop: 8, letterSpacing: "0.04em" }}>World's First AI Cinema OTT</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.65)", marginTop: 32, letterSpacing: "0.25em" }}>WWW.CREAITE.NET</div>
      </div>
    </div>
  );
}

export function OgPreview() {
  const [selected, setSelected] = useState<Variant>("A");

  const VariantComponent = selected === "A" ? VariantA : selected === "B" ? VariantB : VariantC;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-black mb-2">OG 이미지 디자인 미리보기</h1>
        <p className="text-sm text-gray-400 mb-6">
          1200×630 — 카카오톡 / 페이스북 / 트위터 공유 시 표시되는 이미지. 3개 시안 비교.
        </p>

        {/* 시안 선택 탭 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {variants.map((v) => (
            <button
              key={v.key}
              onClick={() => setSelected(v.key)}
              className={`px-4 py-2.5 rounded-xl text-left transition-all ${
                selected === v.key
                  ? "bg-gradient-to-r from-[#a78bfa] to-[#ec4899] text-white shadow-lg"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              <p className="text-sm font-bold">{v.name}</p>
              <p className="text-xs opacity-80 mt-0.5">{v.desc}</p>
            </button>
          ))}
        </div>

        {/* 메인 미리보기 — 실제 1200×630 비율 */}
        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            aspectRatio: "1200 / 630",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}
        >
          <VariantComponent />
        </div>

        {/* 실제 공유 미리보기 시뮬레이션 */}
        <div className="mt-10 grid md:grid-cols-2 gap-6">
          {/* 카톡 모바일 (1:1) */}
          <div>
            <h3 className="text-sm font-bold mb-2 text-gray-300">카카오톡 모바일 (정사각형 잘림)</h3>
            <div
              className="rounded-xl overflow-hidden border border-white/10"
              style={{ aspectRatio: "1 / 1", maxWidth: 320 }}
            >
              <VariantComponent />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              ※ 모바일 카톡은 가운데 정사각형으로 자릅니다. 양옆은 잘림.
            </p>
          </div>

          {/* 페북 / 카톡PC (1.91:1) */}
          <div>
            <h3 className="text-sm font-bold mb-2 text-gray-300">페이스북 / 카톡 PC (1.91:1)</h3>
            <div
              className="rounded-xl overflow-hidden border border-white/10"
              style={{ aspectRatio: "1200 / 630", maxWidth: 480 }}
            >
              <VariantComponent />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              ※ 페북·PC 카톡은 1200×630 그대로 표시 (가장 깔끔).
            </p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-sm">
          <p className="font-bold mb-1">💡 안내</p>
          <ul className="text-amber-200/80 space-y-1 text-xs">
            <li>• 로고는 <code className="px-1 bg-white/10 rounded">creaite-logo.svg</code>의 이퀄라이저+플레이 모티프 (시그니처).</li>
            <li>• 선택한 시안을 알려주시면 <code className="px-1 bg-white/10 rounded">api/og-image.tsx</code>에 동일 디자인으로 적용합니다.</li>
            <li>• 실제 ImageResponse 렌더는 미세하게 차이날 수 있음 (폰트·SVG 미세 차이).</li>
            <li>• 다른 안 요청도 자유롭게 (로고 색·배치·카피·배경 변경 등).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
