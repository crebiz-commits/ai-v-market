import { motion } from "motion/react";
import { CreaiteText } from "./CreaiteText";

// 그라디언트 정의 (재사용)
function GradientDefs() {
  return (
    <defs>
      <linearGradient id="aurora" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="50%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
      <linearGradient id="purple" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
      <linearGradient id="pink" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
      <linearGradient id="cyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
      <linearGradient id="rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="20%" stopColor="#f59e0b" />
        <stop offset="40%" stopColor="#10b981" />
        <stop offset="60%" stopColor="#06b6d4" />
        <stop offset="80%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
    </defs>
  );
}

// =============================================
// 디자인 1: 미니멀 톱니 + C + 플레이 (현재 로고 단순화)
// =============================================
function Design1() {
  // 톱니 8개를 가진 외곽 + 가운데 C + 안에 play
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {/* 톱니 외곽 */}
      <g fill="url(#aurora)">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <rect
            key={angle}
            x="46"
            y="2"
            width="8"
            height="14"
            rx="2"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
      </g>
      {/* C (도넛 형태에서 오른쪽 일부 잘림) */}
      <path
        d="M 50 18 A 32 32 0 1 0 78 65 L 70 60 A 24 24 0 1 1 50 26 Z"
        fill="url(#aurora)"
      />
      {/* 플레이 삼각형 */}
      <polygon points="42,38 42,62 62,50" fill="white" />
    </svg>
  );
}

// =============================================
// 디자인 2: C가 곧 플레이 버튼 (자연스러운 융합)
// =============================================
function Design2() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {/* C 모양 */}
      <path
        d="M 75 25 A 30 30 0 1 0 75 75"
        stroke="url(#aurora)"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      {/* 안쪽 플레이 */}
      <polygon points="40,38 40,62 60,50" fill="url(#pink)" />
    </svg>
  );
}

// =============================================
// 디자인 3: 픽셀화된 C (디지털/AI 느낌)
// =============================================
function Design3() {
  // 5x5 그리드로 C 그리기
  const grid = [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
  ];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {grid.map((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect
              key={`${x}-${y}`}
              x={10 + x * 16}
              y={10 + y * 16}
              width="14"
              height="14"
              rx="2"
              fill="url(#aurora)"
            />
          ) : null
        )
      )}
    </svg>
  );
}

// =============================================
// 디자인 4: 회전 링 + 중앙 플레이 (minimal)
// =============================================
function Design4() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <motion.g animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "50px 50px" }}>
        <circle cx="50" cy="50" r="40" stroke="url(#aurora)" strokeWidth="3" fill="none" strokeDasharray="20 8" />
      </motion.g>
      <circle cx="50" cy="50" r="28" fill="url(#purple)" />
      <polygon points="44,40 44,60 60,50" fill="white" />
    </svg>
  );
}

// =============================================
// 디자인 5: 필름 스트립 C
// =============================================
function Design5() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {/* C 본체 */}
      <path
        d="M 78 28 A 30 30 0 1 0 78 72"
        stroke="url(#aurora)"
        strokeWidth="14"
        fill="none"
        strokeLinecap="butt"
      />
      {/* 필름 구멍 */}
      {[20, 35, 50, 65, 80].map((y) => (
        <rect key={`l-${y}`} x="14" y={y - 2} width="4" height="4" rx="1" fill="#0a0a0a" />
      ))}
      <polygon points="42,40 42,60 60,50" fill="white" />
    </svg>
  );
}

// =============================================
// 디자인 6: 이중 C (하나는 외곽, 하나는 안쪽)
// =============================================
function Design6() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <path d="M 78 25 A 32 32 0 1 0 78 75" stroke="url(#purple)" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M 65 40 A 16 16 0 1 0 65 60" stroke="url(#pink)" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="50" r="3" fill="url(#cyan)" />
    </svg>
  );
}

// =============================================
// 디자인 7: 미니멀 모노그램 C + AI dot
// =============================================
function Design7() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {/* C */}
      <path
        d="M 80 25 A 32 32 0 1 0 80 75"
        stroke="url(#aurora)"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
      />
      {/* AI 강조 점 */}
      <motion.circle
        cx="78"
        cy="38"
        r="5"
        fill="#06b6d4"
        animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.3, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.circle
        cx="78"
        cy="62"
        r="5"
        fill="#ec4899"
        animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.3, 1] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />
    </svg>
  );
}

// =============================================
// 디자인 8: 사각형 베이스 + 플레이 (앱 아이콘 스타일)
// =============================================
function Design8() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <rect x="10" y="10" width="80" height="80" rx="22" fill="url(#aurora)" />
      <path d="M 70 30 A 25 25 0 1 0 70 70" stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" />
      <polygon points="42,42 42,58 56,50" fill="white" />
    </svg>
  );
}

// =============================================
// 디자인 9: 동심원 + C 슬라이스 (모던)
// =============================================
function Design9() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <circle cx="50" cy="50" r="42" stroke="url(#purple)" strokeWidth="2" fill="none" opacity="0.3" />
      <circle cx="50" cy="50" r="34" stroke="url(#aurora)" strokeWidth="2" fill="none" opacity="0.6" />
      <path
        d="M 75 30 A 26 26 0 1 0 75 70"
        stroke="url(#aurora)"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />
      <polygon points="45,42 45,58 58,50" fill="url(#pink)" />
    </svg>
  );
}

// =============================================
// 디자인 10: 글리치 C (사이버펑크)
// =============================================
function Design10() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {/* 살짝 어긋난 두 C 레이어 */}
      <path d="M 76 28 A 30 30 0 1 0 76 72" stroke="#06b6d4" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.7" transform="translate(-2, 0)" />
      <path d="M 76 28 A 30 30 0 1 0 76 72" stroke="#ec4899" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.7" transform="translate(2, 0)" />
      <path d="M 76 28 A 30 30 0 1 0 76 72" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
      <polygon points="44,40 44,60 60,50" fill="white" />
    </svg>
  );
}

// =============================================
// 디자인 0: 현재 (비교용)
// =============================================
function DesignCurrent() {
  return <img src="/logo-new.png" alt="current" className="w-full h-full object-contain" />;
}

function DesignOld() {
  return <img src="/logo.png" alt="old" className="w-full h-full object-contain" />;
}

// =============================================
// 미리보기 카드
// =============================================
function PreviewCard({ name, desc, Component }: { name: string; desc: string; Component: React.ComponentType }) {
  return (
    <div className="bg-[#111] rounded-2xl p-5 border border-white/10">
      <h3 className="font-bold mb-1 text-white text-sm">{name}</h3>
      <p className="text-xs text-gray-400 mb-4 h-8">{desc}</p>

      {/* 큰 사이즈 */}
      <div className="bg-[#1a1a1a] rounded-xl p-6 mb-3 flex items-center justify-center">
        <div className="w-24 h-24">
          <Component />
        </div>
      </div>

      {/* 헤더에 들어간 모습 */}
      <div className="bg-background border border-white/5 rounded-lg px-3 h-12 flex items-center gap-2">
        <div className="w-9 h-9 flex-shrink-0">
          <Component />
        </div>
        <CreaiteText className="text-[15px] font-extrabold" />
      </div>
    </div>
  );
}

export function LogoDesigns() {
  const designs = [
    { name: "기존 logo.png", desc: "원래 사이트에 있던 로고", Component: DesignOld },
    { name: "★ 새로 받은 로고 (logo-new.png)", desc: "방금 추가한 무지개 톱니 C", Component: DesignCurrent },
    { name: "디자인 1: 미니멀 톱니 + C + ▶", desc: "현재 로고를 단순화한 SVG 버전", Component: Design1 },
    { name: "디자인 2: C = 플레이 (융합형)", desc: "C 안에 플레이 삼각형이 자연스럽게", Component: Design2 },
    { name: "디자인 3: 픽셀 C (AI/디지털)", desc: "픽셀 그리드로 C 구성", Component: Design3 },
    { name: "디자인 4: 회전 링 + 플레이", desc: "외곽 링이 천천히 회전 + 중앙 플레이", Component: Design4 },
    { name: "디자인 5: 필름 스트립 C", desc: "왼쪽에 필름 구멍, 영상 마켓 강조", Component: Design5 },
    { name: "디자인 6: 이중 C", desc: "큰 C + 작은 C 중첩 (모노그램)", Component: Design6 },
    { name: "디자인 7: 미니멀 + AI 점", desc: "조합 D와 통일감 (점 펄스)", Component: Design7 },
    { name: "디자인 8: 앱 아이콘 스타일", desc: "iOS 앱 아이콘처럼 둥근 사각형 + 그라디언트", Component: Design8 },
    { name: "디자인 9: 동심원 + C", desc: "오디오/원형 반응 느낌", Component: Design9 },
    { name: "디자인 10: 글리치 C", desc: "사이버펑크 색수차 효과", Component: Design10 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">로고 디자인 비교 (SVG 기반)</h1>
        <p className="text-gray-400 mb-8">
          현재 로고 컨셉(톱니 + C + ▶)을 변형한 10가지 SVG 디자인.
          큰 사이즈와 헤더 적용 모습을 함께 보여줍니다.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {designs.map(({ name, desc, Component }) => (
            <PreviewCard key={name} name={name} desc={desc} Component={Component} />
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">선택 후 알려주세요</h2>
          <p className="text-gray-400 text-sm">
            번호로 선택하시면 됩니다. SVG 기반이라 색상/크기/획 굵기 조정 자유롭습니다.
            <br />
            "디자인 7 좋은데 점 색깔만 바꿔줘" 같은 세밀한 요청도 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
