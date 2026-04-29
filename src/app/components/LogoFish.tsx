import { motion } from "motion/react";
import { CreaiteText } from "./CreaiteText";

function GradientDefs() {
  return (
    <defs>
      <linearGradient id="aurora-fish" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="50%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
  );
}

// =============================================
// 0. 현재 (참고용)
// =============================================
function FishCurrent() {
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
          fill="url(#aurora-fish)"
          animate={{ y: [50 - h / 2, 50 - (h + 15) / 2, 50 - h / 2], height: [h, h + 15, h] }}
          transition={{ duration: 1.2 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
        />
      ))}
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora-fish)"
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
    </svg>
  );
}

// =============================================
// 1. 단순 대칭형 — 양쪽 삼각형
// =============================================
function FishA() {
  // 왼쪽 꼬리 추가, 막대 4개로 줄여서 균형 잡음
  const bars = [60, 80, 50, 70];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {/* 왼쪽 꼬리 (◀) */}
      <motion.polygon
        points="18,50 32,28 32,72"
        fill="url(#aurora-fish)"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "25px 50px" }}
      />
      {/* 가운데 막대 (4개) */}
      {bars.map((h, i) => (
        <motion.rect
          key={i}
          x={36 + i * 11}
          width="7"
          rx="3.5"
          fill="url(#aurora-fish)"
          animate={{ y: [50 - h / 2, 50 - (h + 12) / 2, 50 - h / 2], height: [h, h + 12, h] }}
          transition={{ duration: 1.2 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
        />
      ))}
      {/* 오른쪽 머리/▶ */}
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora-fish)"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
    </svg>
  );
}

// =============================================
// 2. 진짜 물고기 꼬리 (V형 fork)
// =============================================
function FishB() {
  const bars = [60, 80, 50, 70];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      {/* V형 꼬리 (위/아래 두 갈래) */}
      <motion.path
        d="M 8 30 L 30 50 L 8 70 L 18 50 Z"
        fill="url(#aurora-fish)"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "18px 50px" }}
      />
      {/* 막대 */}
      {bars.map((h, i) => (
        <motion.rect
          key={i}
          x={36 + i * 11}
          width="7"
          rx="3.5"
          fill="url(#aurora-fish)"
          animate={{ y: [50 - h / 2, 50 - (h + 12) / 2, 50 - h / 2], height: [h, h + 12, h] }}
          transition={{ duration: 1.2 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
        />
      ))}
      {/* 머리 */}
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora-fish)"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
    </svg>
  );
}

// =============================================
// 3. 눈 추가 (확실한 물고기)
// =============================================
function FishC() {
  const bars = [60, 80, 50, 70];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <motion.polygon
        points="18,50 32,28 32,72"
        fill="url(#aurora-fish)"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "25px 50px" }}
      />
      {bars.map((h, i) => (
        <motion.rect
          key={i}
          x={36 + i * 11}
          width="7"
          rx="3.5"
          fill="url(#aurora-fish)"
          animate={{ y: [50 - h / 2, 50 - (h + 12) / 2, 50 - h / 2], height: [h, h + 12, h] }}
          transition={{ duration: 1.2 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
        />
      ))}
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora-fish)"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
      {/* 눈 (머리쪽 살짝 위) — 흰자 + 검은자 */}
      <circle cx="84" cy="42" r="3" fill="white" />
      <motion.circle
        cx="84"
        cy="42"
        r="1.5"
        fill="#0a0a0a"
        animate={{ cy: [42, 42, 41, 42, 42] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", times: [0, 0.4, 0.5, 0.6, 1] }}
      />
    </svg>
  );
}

// =============================================
// 4. 헤엄치는 모션 (전체가 좌우로 살짝 움직임)
// =============================================
function FishD() {
  const bars = [60, 80, 50, 70];
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <motion.g
        animate={{ x: [0, 3, 0, -3, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.polygon
          points="18,50 32,28 32,72"
          fill="url(#aurora-fish)"
          animate={{ rotate: [-8, 8, -8] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "30px 50px" }}
        />
        {bars.map((h, i) => (
          <rect
            key={i}
            x={36 + i * 11}
            y={50 - h / 2}
            width="7"
            height={h}
            rx="3.5"
            fill="url(#aurora-fish)"
          />
        ))}
        <polygon points="82,28 82,72 96,50" fill="url(#aurora-fish)" />
        <circle cx="84" cy="42" r="3" fill="white" />
        <circle cx="84" cy="42" r="1.5" fill="#0a0a0a" />
      </motion.g>
    </svg>
  );
}

function PreviewCard({ name, desc, Component, recommend }: { name: string; desc: string; Component: React.ComponentType; recommend?: boolean }) {
  return (
    <div className={`bg-[#111] rounded-2xl p-5 border ${recommend ? "border-yellow-500/50" : "border-white/10"}`}>
      <h3 className="font-bold mb-1 text-white text-sm flex items-center gap-2">
        {name}
        {recommend && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">추천</span>}
      </h3>
      <p className="text-xs text-gray-400 mb-4 h-8">{desc}</p>
      <div className="bg-[#1a1a1a] rounded-xl p-6 mb-3 flex items-center justify-center">
        <div className="w-32 h-32">
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

export function LogoFish() {
  const designs = [
    { name: "현재 (Before)", desc: "막대 5개 + ▶ — 이퀄라이저 + 플레이", Component: FishCurrent },
    { name: "변형 A: 단순 대칭", desc: "왼쪽에 ◀ 추가, 막대 4개로 균형", Component: FishA },
    { name: "변형 B: V형 꼬리", desc: "진짜 물고기 꼬리 같은 V 갈래", Component: FishB, recommend: true },
    { name: "변형 C: 눈 추가", desc: "B + 머리에 눈 → 명확한 물고기", Component: FishC },
    { name: "변형 D: 헤엄치는 모션", desc: "C + 좌우 흔들림 + 꼬리 흔들기", Component: FishD },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🐟 물고기 컨셉 로고 변형</h1>
        <p className="text-gray-400 mb-8">
          왼쪽에 꼬리 삼각형 추가 → 물고기 같은 형태. 4가지 단계별 변형.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {designs.map(({ name, desc, Component, recommend }) => (
            <PreviewCard key={name} name={name} desc={desc} Component={Component} recommend={recommend} />
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">결정 가이드</h2>
          <ul className="text-gray-400 text-sm space-y-2 leading-relaxed">
            <li>· <strong className="text-white">현재 유지</strong> — "이퀄라이저+▶" 의미가 명확. AI 영상 마켓 직관적</li>
            <li>· <strong className="text-yellow-300">변형 B (V형 꼬리)</strong> — 물고기 느낌 살리되 추상적 → 가장 균형 잡힘</li>
            <li>· <strong className="text-white">변형 C/D</strong> — 명확한 물고기 캐릭터. 친근하지만 "비디오 마켓" 의미는 약화</li>
          </ul>
          <p className="mt-4 text-sm text-gray-300">번호 알려주시면 적용하거나 추가 변형 만들어드립니다.</p>
        </div>
      </div>
    </div>
  );
}
