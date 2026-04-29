import { motion } from "motion/react";
import { CreaiteText } from "./CreaiteText";

function GradientDefs() {
  return (
    <defs>
      <linearGradient id="aurora2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="50%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
      <linearGradient id="purple2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a78bfa" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
      <linearGradient id="warm2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
      <linearGradient id="cool2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
      <radialGradient id="orb2" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.9" />
        <stop offset="40%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#6366f1" />
      </radialGradient>
      <linearGradient id="meta2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="50%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
    </defs>
  );
}

// =============================================
// 1. Aurora Orb — Apple Intelligence 같은 발광 구체
// =============================================
function D1_Orb() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <circle cx="50" cy="50" r="40" fill="url(#orb2)" />
      <ellipse cx="38" cy="38" rx="14" ry="8" fill="white" opacity="0.4" />
    </svg>
  );
}

// =============================================
// 2. Liquid Drop — 모피하는 액체 방울
// =============================================
function D2_Drop() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <motion.path
        d="M 50 10 Q 80 30, 78 55 Q 75 85, 50 90 Q 25 85, 22 55 Q 20 30, 50 10 Z"
        fill="url(#aurora2)"
        animate={{
          d: [
            "M 50 10 Q 80 30, 78 55 Q 75 85, 50 90 Q 25 85, 22 55 Q 20 30, 50 10 Z",
            "M 50 12 Q 82 32, 76 58 Q 78 86, 50 88 Q 22 86, 24 58 Q 18 32, 50 12 Z",
            "M 50 10 Q 80 30, 78 55 Q 75 85, 50 90 Q 25 85, 22 55 Q 20 30, 50 10 Z",
          ],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

// =============================================
// 3. Wave Bars + Play — 이퀄라이저 + 플레이 (오른쪽 끝)
// =============================================
function D3_Wave() {
  const bars = [30, 60, 80, 50, 70];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {bars.map((h, i) => (
        <motion.rect
          key={i}
          x={12 + i * 14}
          width="8"
          rx="4"
          fill="url(#aurora2)"
          animate={{ y: [50 - h / 2, 50 - (h + 15) / 2, 50 - h / 2], height: [h, h + 15, h] }}
          transition={{ duration: 1.2 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
        />
      ))}
      {/* 마지막 위치 — 플레이 삼각형 */}
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora2)"
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
    </svg>
  );
}

// =============================================
// 4. Geometric Star — 4꼭지 별 (스파클)
// =============================================
function D4_Sparkle() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <motion.path
        d="M 50 10 Q 55 45, 90 50 Q 55 55, 50 90 Q 45 55, 10 50 Q 45 45, 50 10 Z"
        fill="url(#aurora2)"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "50px 50px" }}
      />
    </svg>
  );
}

// =============================================
// 5. Lens Aperture — 카메라 조리개
// =============================================
function D5_Aperture() {
  // 6개 블레이드를 가진 조리개
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <circle cx="50" cy="50" r="40" fill="#0a0a0a" stroke="url(#aurora2)" strokeWidth="2" />
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <path
          key={i}
          d="M 50 50 L 75 30 A 30 30 0 0 1 80 60 Z"
          fill={i % 2 === 0 ? "url(#purple2)" : "url(#warm2)"}
          opacity="0.85"
          transform={`rotate(${angle} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="6" fill="white" />
    </svg>
  );
}

// =============================================
// 6. Bold Letter C (notched) — Vercel 같은 미니멀
// =============================================
function D6_LetterC() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <rect x="10" y="10" width="80" height="80" rx="20" fill="url(#meta2)" />
      <path d="M 70 32 L 70 22 A 30 30 0 1 0 70 78 L 70 68 A 22 22 0 1 1 70 32 Z" fill="white" />
    </svg>
  );
}

// =============================================
// 7. Hexagon Prism — 다이아몬드 굴절
// =============================================
function D7_Prism() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <polygon points="50,10 85,30 85,70 50,90 15,70 15,30" fill="url(#aurora2)" />
      <polygon points="50,10 85,30 50,50" fill="white" opacity="0.25" />
      <polygon points="50,10 15,30 50,50" fill="white" opacity="0.1" />
      <polygon points="50,90 85,70 50,50" fill="black" opacity="0.15" />
    </svg>
  );
}

// =============================================
// 8. Triangle Stack — 추상적 ▶ 무한
// =============================================
function D8_TriStack() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <polygon points="20,30 20,70 50,50" fill="url(#cool2)" opacity="0.5" />
      <polygon points="35,25 35,75 70,50" fill="url(#aurora2)" opacity="0.8" />
      <polygon points="50,20 50,80 90,50" fill="url(#warm2)" />
    </svg>
  );
}

// =============================================
// 9. AI Eye — 동공이 그라디언트인 눈
// =============================================
function D9_Eye() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <ellipse cx="50" cy="50" rx="42" ry="28" fill="white" />
      <circle cx="50" cy="50" r="22" fill="url(#aurora2)" />
      <circle cx="50" cy="50" r="9" fill="black" />
      <circle cx="56" cy="44" r="4" fill="white" />
    </svg>
  );
}

// =============================================
// 10. Spiral — 생성/진화
// =============================================
function D10_Spiral() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <motion.path
        d="M 50 50 m -30 0 a 30 30 0 1 1 60 0 a 22 22 0 1 1 -44 0 a 14 14 0 1 1 28 0 a 6 6 0 1 1 -12 0"
        stroke="url(#aurora2)"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "50px 50px" }}
      />
    </svg>
  );
}

// =============================================
// 11. Plus + (구글 Gemini 별 비슷한 4갈래)
// =============================================
function D11_Plus() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <motion.g
        animate={{ rotate: [0, 90, 180, 270, 360] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "50px 50px" }}
      >
        <path d="M 50 5 Q 55 45, 95 50 Q 55 55, 50 95 Q 45 55, 5 50 Q 45 45, 50 5 Z" fill="url(#aurora2)" />
        <circle cx="50" cy="50" r="6" fill="white" />
      </motion.g>
    </svg>
  );
}

// =============================================
// 12. Frame — 영상 프레임 (필름 + 미니멀)
// =============================================
function D12_Frame() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <rect x="14" y="20" width="72" height="60" rx="8" fill="none" stroke="url(#aurora2)" strokeWidth="6" />
      <polygon points="40,38 40,62 62,50" fill="url(#warm2)" />
      <circle cx="78" cy="22" r="5" fill="#06b6d4" />
    </svg>
  );
}

function DesignOld() {
  return <img src="/logo.png" alt="old" className="w-full h-full object-contain" />;
}
function DesignNew() {
  return <img src="/logo-new.png" alt="new" className="w-full h-full object-contain" />;
}

function PreviewCard({ name, desc, Component }: { name: string; desc: string; Component: React.ComponentType }) {
  return (
    <div className="bg-[#111] rounded-2xl p-5 border border-white/10">
      <h3 className="font-bold mb-1 text-white text-sm">{name}</h3>
      <p className="text-xs text-gray-400 mb-4 h-8">{desc}</p>
      <div className="bg-[#1a1a1a] rounded-xl p-6 mb-3 flex items-center justify-center">
        <div className="w-24 h-24">
          <Component />
        </div>
      </div>
      <div className="bg-background border border-white/5 rounded-lg px-3 h-12 flex items-center gap-2">
        <div className="w-9 h-9 flex-shrink-0">
          <Component />
        </div>
        <CreaiteText className="text-[15px] font-extrabold" />
      </div>
    </div>
  );
}

export function LogoDesignsV2() {
  const designs = [
    { name: "기존 logo.png", desc: "원래 사이트 로고", Component: DesignOld },
    { name: "방금 추가한 logo-new.png", desc: "무지개 톱니 C", Component: DesignNew },
    { name: "★ 디자인 1: Aurora Orb", desc: "Apple Intelligence 풍 발광 구체", Component: D1_Orb },
    { name: "★ 디자인 2: Liquid Drop", desc: "살아 움직이는 액체 방울", Component: D2_Drop },
    { name: "★ 디자인 3: Wave Bars + Play", desc: "이퀄라이저 5개 막대 + 오른쪽 끝 플레이 ▶", Component: D3_Wave },
    { name: "★ 디자인 4: Sparkle Star", desc: "회전하는 4꼭지 별 (Gemini 풍)", Component: D4_Sparkle },
    { name: "★ 디자인 5: Aperture", desc: "카메라 조리개 (영상 컨셉)", Component: D5_Aperture },
    { name: "★ 디자인 6: Letter C", desc: "Vercel 같은 미니멀 타이포 마크", Component: D6_LetterC },
    { name: "★ 디자인 7: Hexagon Prism", desc: "3D 입체 다이아몬드 굴절", Component: D7_Prism },
    { name: "★ 디자인 8: Triangle Stack", desc: "겹쳐진 3개 ▶ (반복/무한)", Component: D8_TriStack },
    { name: "★ 디자인 9: AI Eye", desc: "AI의 시각 — 동공이 오로라", Component: D9_Eye },
    { name: "★ 디자인 10: Spiral", desc: "회전하는 나선 (생성/진화)", Component: D10_Spiral },
    { name: "★ 디자인 11: Plus Star", desc: "Gemini/Apple Sparkle 풍 4갈래 별", Component: D11_Plus },
    { name: "★ 디자인 12: Video Frame", desc: "영상 프레임 + ▶ (마켓 직관적)", Component: D12_Frame },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">로고 디자인 V2 — 새로운 컨셉</h1>
        <p className="text-gray-400 mb-8">
          톱니/플레이 컨셉을 벗어난 12가지 SVG 디자인.
          Apple/Stripe/Linear 같은 모던 브랜드 감성으로 제작.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {designs.map(({ name, desc, Component }) => (
            <PreviewCard key={name} name={name} desc={desc} Component={Component} />
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">선택 후 알려주세요</h2>
          <p className="text-gray-400 text-sm">
            번호 선택 + 색상/크기/형태 미세 조정 가능합니다.
            <br />
            "디자인 5 좋은데 더 작게" / "디자인 4 + 9 섞어줘" 같은 요청 환영.
          </p>
        </div>
      </div>
    </div>
  );
}
