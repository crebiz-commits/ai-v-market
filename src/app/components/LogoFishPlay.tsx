import { motion } from "motion/react";
import { CreaiteText } from "./CreaiteText";

function GradientDefs() {
  return (
    <defs>
      <linearGradient id="aurora-fp" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="50%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
  );
}

// 공통: V 꼬리 + 막대 4개
function FishBody() {
  const bars = [60, 80, 50, 70];
  return (
    <>
      {/* V형 꼬리 */}
      <motion.path
        d="M 8 30 L 30 50 L 8 70 L 18 50 Z"
        fill="url(#aurora-fp)"
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
          fill="url(#aurora-fp)"
          animate={{
            y: [50 - h / 2, 50 - (h + 12) / 2, 50 - h / 2],
            height: [h, h + 12, h],
          }}
          transition={{ duration: 1.2 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
        />
      ))}
    </>
  );
}

// =============================================
// 변형 B (기준 — 비교용)
// =============================================
function FishB() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <FishBody />
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora-fp)"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
    </svg>
  );
}

// =============================================
// B-1: 원형 테두리 + 작은 ▶ (가장 보편적 플레이 버튼)
// =============================================
function FishB1() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <FishBody />
      {/* 원형 테두리 (머리/버튼 윤곽) */}
      <motion.circle
        cx="86"
        cy="50"
        r="11"
        fill="none"
        stroke="url(#aurora-fp)"
        strokeWidth="2.5"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "86px 50px" }}
      />
      {/* 안쪽 작은 ▶ */}
      <polygon points="83,44 83,56 92,50" fill="url(#aurora-fp)" />
    </svg>
  );
}

// =============================================
// B-2: 꽉 찬 원 + 흰색 ▶ (가장 명확한 플레이 버튼)
// =============================================
function FishB2() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <FishBody />
      <motion.circle
        cx="86"
        cy="50"
        r="11"
        fill="url(#aurora-fp)"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "86px 50px" }}
      />
      <polygon points="83,44 83,56 92,50" fill="white" />
    </svg>
  );
}

// =============================================
// B-3: 미세 글로우 링 + 원래 ▶ (subtle, 양쪽 해석)
// =============================================
function FishB3() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <FishBody />
      {/* 외곽 글로우 링 (펄스) */}
      <motion.circle
        cx="89"
        cy="50"
        r="13"
        fill="none"
        stroke="url(#aurora-fp)"
        strokeWidth="1.5"
        opacity="0.5"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora-fp)"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
    </svg>
  );
}

// =============================================
// B-4: ▶에 흰 인디케이터 점 (UI 버튼 컨트롤 느낌)
// =============================================
function FishB4() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <FishBody />
      <motion.polygon
        points="82,28 82,72 96,50"
        fill="url(#aurora-fp)"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
      {/* 안쪽 작은 흰색 ▶ (이중 플레이 = 버튼 느낌 강조) */}
      <polygon points="83,44 83,56 91,50" fill="white" opacity="0.85" />
    </svg>
  );
}

// =============================================
// B-5: 알약 배경 + 흰 ▶ (YouTube 스타일)
// =============================================
function FishB5() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <GradientDefs />
      <FishBody />
      <motion.rect
        x="76"
        y="42"
        width="22"
        height="16"
        rx="8"
        fill="url(#aurora-fp)"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "87px 50px" }}
      />
      <polygon points="84,46 84,54 92,50" fill="white" />
    </svg>
  );
}

function PreviewCard({
  name,
  desc,
  Component,
  recommend,
}: {
  name: string;
  desc: string;
  Component: React.ComponentType;
  recommend?: boolean;
}) {
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

export function LogoFishPlay() {
  const designs = [
    { name: "B (기본)", desc: "변형 B 원본 — 비교용", Component: FishB },
    { name: "B-1: 원형 테두리", desc: "▶ 둘러싼 원 윤곽선 → 머리도 둥글고, 플레이 버튼 느낌도", Component: FishB1, recommend: true },
    { name: "B-2: 꽉 찬 원", desc: "원 안에 흰 ▶ — 가장 명확한 플레이 버튼", Component: FishB2 },
    { name: "B-3: 펄스 글로우", desc: "외곽 링이 퍼져나감 → subtle 플레이 가능 표시", Component: FishB3 },
    { name: "B-4: 이중 ▶", desc: "큰 ▶ 안에 작은 흰 ▶ — UI 컨트롤 느낌", Component: FishB4 },
    { name: "B-5: 알약 배경", desc: "YouTube 스타일 — 가로 알약에 ▶", Component: FishB5 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🐟 + ▶ — 머리를 플레이 버튼처럼</h1>
        <p className="text-gray-400 mb-8">
          변형 B를 기반으로, 오른쪽 ▶에 다양한 "플레이 버튼" 처리. 물고기 + 영상 마켓 양쪽 의미 살리기.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {designs.map(({ name, desc, Component, recommend }) => (
            <PreviewCard key={name} name={name} desc={desc} Component={Component} recommend={recommend} />
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">제 추천</h2>
          <ul className="text-gray-400 text-sm space-y-2 leading-relaxed">
            <li>· <strong className="text-yellow-300">B-1 (원형 테두리)</strong> — 가장 균형. 원이 둥근 머리 같기도, 플레이 버튼 같기도</li>
            <li>· <strong className="text-white">B-2</strong> — 플레이 버튼이 가장 명확. 다만 머리가 단순 원 = 캐릭터 느낌 약함</li>
            <li>· <strong className="text-white">B-3</strong> — 가장 절제됨. 미니멀 선호 시</li>
            <li>· <strong className="text-white">B-4</strong> — 작은 흰 ▶ 추가만으로 "이중 플레이" 효과. 변화 적음</li>
            <li>· <strong className="text-white">B-5</strong> — YouTube 직관적이지만 알약이 머리 형태 깨뜨림</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
