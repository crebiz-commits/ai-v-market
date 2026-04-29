import { ChevronRight, ArrowRight, Play, Film, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

// 가짜 영상 카드 배경 (실제 카드와 비슷하게 보이려고)
function CardWrap({ children, label, desc }: { children: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="bg-[#111] rounded-2xl p-5 border border-white/10">
      <h3 className="font-bold mb-1 text-white">{label}</h3>
      <p className="text-xs text-gray-400 mb-5 h-8">{desc}</p>
      <div
        className="relative h-32 rounded-xl overflow-hidden flex items-end p-3"
        style={{
          backgroundImage: "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #831843 100%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="relative w-full flex items-center justify-between">
          <div>
            <p className="text-[10px] text-white/60">다운로드 (소장 · 상업적 사용)</p>
            <p className="text-sm font-black text-[#f87171]">₩1,000</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// =============================================
// 옵션 1: Glass + Arrow Slide (글래스 + 화살표 슬라이드)
// =============================================
function Option1() {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="group relative px-4 h-9 rounded-full bg-white/10 backdrop-blur-xl border border-white/30 text-white font-bold text-xs flex items-center gap-1.5 overflow-hidden hover:bg-white/20 transition-colors"
    >
      <span>영화 상세</span>
      <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
        <ChevronRight className="w-3.5 h-3.5" />
      </motion.span>
    </motion.button>
  );
}

// =============================================
// 옵션 2: Neon Border Trail (네온 흐르는 테두리)
// =============================================
function Option2() {
  return (
    <button className="relative px-4 h-9 rounded-full bg-black/80 text-white font-bold text-xs flex items-center gap-1.5 overflow-hidden">
      {/* 흐르는 네온 보더 */}
      <span className="absolute inset-0 rounded-full p-[1.5px] [mask:linear-gradient(black,black)_content-box,linear-gradient(black,black)] [mask-composite:exclude]"
        style={{
          background: "conic-gradient(from 0deg, #6366f1, #8b5cf6, #ec4899, #06b6d4, #6366f1)",
          animation: "spin 3s linear infinite",
        }}
      />
      <span className="relative z-10">영화 상세</span>
      <ChevronRight className="relative z-10 w-3.5 h-3.5" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

// =============================================
// 옵션 3: Magnetic Lift (자석 부상)
// =============================================
function Option3() {
  return (
    <motion.button
      whileHover={{ y: -2, boxShadow: "0 12px 30px -8px rgba(99, 102, 241, 0.7)" }}
      whileTap={{ y: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400 }}
      className="px-4 h-9 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#6366f1]/30"
    >
      영화 상세 <ChevronRight className="w-3.5 h-3.5" />
    </motion.button>
  );
}

// =============================================
// 옵션 4: Liquid Aurora (살아있는 오로라)
// =============================================
function Option4() {
  return (
    <button
      className="relative px-4 h-9 rounded-full text-white font-bold text-xs flex items-center gap-1.5 overflow-hidden border border-white/20"
      style={{
        background: "linear-gradient(110deg, #6366f1 0%, #ec4899 50%, #06b6d4 100%)",
        backgroundSize: "200% 200%",
        animation: "aurora 4s ease infinite",
      }}
    >
      <span>영화 상세</span>
      <ChevronRight className="w-3.5 h-3.5" />
      <style>{`
        @keyframes aurora {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </button>
  );
}

// =============================================
// 옵션 5: Cinema Marquee (시네마 마키)
// =============================================
function Option5() {
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className="relative px-4 h-9 rounded-md bg-gradient-to-b from-amber-500 to-amber-700 text-black font-black text-xs flex items-center gap-1.5 border-2 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5)]"
      style={{ fontFamily: "Georgia, serif" }}
    >
      <Film className="w-3.5 h-3.5" />
      <span className="tracking-wider">FILM DETAIL</span>
    </motion.button>
  );
}

// =============================================
// 옵션 6: Cut Corner Tech (사이버펑크 잘린 모서리)
// =============================================
function Option6() {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="relative px-5 h-9 bg-gradient-to-r from-[#6366f1] to-[#06b6d4] text-white font-bold text-xs flex items-center gap-1.5 shadow-lg"
      style={{
        clipPath: "polygon(8% 0%, 100% 0%, 92% 100%, 0% 100%)",
      }}
    >
      <Play className="w-3 h-3 fill-white" />
      <span className="tracking-wider">DETAIL</span>
    </motion.button>
  );
}

// =============================================
// 옵션 7: Frosted Glass + Sparkle
// =============================================
function Option7() {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="group relative px-4 h-9 rounded-full bg-white/10 backdrop-blur-2xl border border-white/40 text-white font-bold text-xs flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] hover:bg-white/20 transition-colors"
    >
      <Sparkles className="w-3 h-3 text-yellow-300 group-hover:rotate-12 transition-transform" />
      <span>영화 상세</span>
      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
    </motion.button>
  );
}

// =============================================
// 옵션 8: Outline → Fill (Hover 채워짐)
// =============================================
function Option8() {
  const [hover, setHover] = useState(false);
  return (
    <motion.button
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      whileTap={{ scale: 0.97 }}
      className="relative px-4 h-9 rounded-full text-white font-bold text-xs flex items-center gap-1.5 overflow-hidden border-2 border-[#8b5cf6]"
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: hover ? "100%" : 0 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] origin-left"
      />
      <span className="relative z-10">영화 상세</span>
      <ArrowRight className="relative z-10 w-3.5 h-3.5" />
    </motion.button>
  );
}

// =============================================
// 옵션 9: Pulse Ring (펄스 링)
// =============================================
function Option9() {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className="relative px-4 h-9 rounded-full bg-gradient-to-r from-[#ec4899] to-[#8b5cf6] text-white font-bold text-xs flex items-center gap-1.5 shadow-lg"
    >
      <motion.span
        className="absolute inset-0 rounded-full border-2 border-pink-400"
        animate={{ scale: [1, 1.3, 1], opacity: [0.7, 0, 0.7] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <span className="relative z-10">영화 상세</span>
      <ChevronRight className="relative z-10 w-3.5 h-3.5" />
    </motion.button>
  );
}

// =============================================
// 옵션 10: Minimalist Underline (미니멀 언더라인)
// =============================================
function Option10() {
  return (
    <motion.button
      whileHover={{ x: 3 }}
      whileTap={{ scale: 0.97 }}
      className="group flex items-center gap-1.5 text-white font-bold text-xs px-2 h-9"
    >
      <span className="relative">
        영화 상세
        <span className="absolute left-0 right-0 bottom-0 h-[1.5px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] origin-left scale-x-0 group-hover:scale-x-100 transition-transform" />
      </span>
      <ChevronRight className="w-3.5 h-3.5 text-[#a78bfa]" />
    </motion.button>
  );
}

// =============================================
// 옵션 0: 현재 (비교용)
// =============================================
function OptionCurrent() {
  return (
    <button className="h-7 px-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white font-bold rounded-full text-[10px] transition-all shadow-lg border border-white/10 flex items-center gap-1">
      영화 상세 <ChevronRight className="w-2.5 h-2.5" />
    </button>
  );
}

// =============================================
// 메인 페이지
// =============================================
export function ButtonPreview() {
  const options = [
    { name: "현재 (Before)", desc: "기본 그라디언트 알약", Component: OptionCurrent },
    { name: "옵션 1: Glass Slide", desc: "글래스 + 화살표 자동 슬라이드", Component: Option1 },
    { name: "옵션 2: Neon Trail", desc: "네온이 테두리를 회전", Component: Option2 },
    { name: "옵션 3: Magnetic Lift", desc: "호버 시 떠오름 + 글로우", Component: Option3 },
    { name: "옵션 4: Liquid Aurora", desc: "살아 움직이는 오로라 그라디언트", Component: Option4 },
    { name: "옵션 5: Cinema Marquee", desc: "영화관 스타일 (FILM 컨셉)", Component: Option5 },
    { name: "옵션 6: Cut Corner", desc: "사이버펑크 평행사변형 모서리", Component: Option6 },
    { name: "옵션 7: Frosted + Sparkle", desc: "유리 + ✨ 반짝이 + 화살표", Component: Option7 },
    { name: "옵션 8: Outline Fill", desc: "테두리만 → 호버 시 채워짐", Component: Option8 },
    { name: "옵션 9: Pulse Ring", desc: "둘레가 펄스로 퍼짐", Component: Option9 },
    { name: "옵션 10: Minimalist", desc: "텍스트만 + 호버 언더라인", Component: Option10 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">영화 상세 버튼 스타일 미리보기</h1>
        <p className="text-gray-400 mb-8">호버 또는 탭으로 인터랙션 확인하세요. 마음에 드는 옵션 번호 알려주시면 적용합니다.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {options.map(({ name, desc, Component }) => (
            <CardWrap key={name} label={name} desc={desc}>
              <Component />
            </CardWrap>
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">선택 후 알려주세요</h2>
          <p className="text-gray-400 text-sm">
            번호로 선택하면 됩니다. "옵션 3 + 7의 sparkle" 처럼 섞어도 됩니다.
            <br />
            텍스트도 "영화 상세" / "FILM DETAIL" / "DETAIL" / "자세히 보기" 등 변경 요청 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
