import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

// 가짜 헤더 형태로 보여주는 래퍼
function HeaderWrap({ children, label, desc }: { children: React.ReactNode; label: string; desc: string }) {
  return (
    <div className="bg-[#111] rounded-2xl p-5 border border-white/10">
      <h3 className="font-bold mb-1 text-white">{label}</h3>
      <p className="text-xs text-gray-400 mb-4 h-8">{desc}</p>
      <div className="bg-background/80 backdrop-blur-xl border border-white/5 rounded-xl px-4 h-14 flex items-center">
        {children}
      </div>
    </div>
  );
}

// =============================================
// 옵션 1: Modern Gradient — 기본 그라디언트
// =============================================
function Option1() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] via-[#8b5cf6] to-[#ec4899] flex items-center justify-center font-black text-white text-sm shadow-lg">
        C
      </div>
      <span className="text-xl font-black bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent tracking-tight">
        CREAITE
      </span>
    </div>
  );
}

// =============================================
// 옵션 2: Liquid Aurora Text (살아있는 텍스트)
// =============================================
function Option2() {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-2xl font-black tracking-tight"
        style={{
          background: "linear-gradient(110deg, #6366f1 0%, #ec4899 50%, #06b6d4 100%)",
          backgroundSize: "200% 200%",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          animation: "aurora-text 4s ease infinite",
        }}
      >
        CREAITE
      </span>
      <style>{`
        @keyframes aurora-text {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}

// =============================================
// 옵션 3: Cre + AI 강조 (AI만 다른 색)
// =============================================
function Option3() {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="text-xl font-black text-white tracking-tight">CRE</span>
      <span className="text-xl font-black bg-gradient-to-r from-[#06b6d4] to-[#8b5cf6] bg-clip-text text-transparent tracking-tight">AI</span>
      <span className="text-xl font-black text-white tracking-tight">TE</span>
    </div>
  );
}

// =============================================
// 옵션 4: Minimal + Dot (미니멀 + 액센트 점)
// =============================================
function Option4() {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xl font-black text-white tracking-[0.15em] uppercase">creaite</span>
      <motion.span
        className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#6366f1] to-[#ec4899]"
        animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    </div>
  );
}

// =============================================
// 옵션 5: Sparkle Logo (반짝이는 로고)
// =============================================
function Option5() {
  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      >
        <Sparkles className="w-5 h-5 text-[#a78bfa]" />
      </motion.div>
      <span className="text-xl font-extrabold text-white tracking-tight" style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        CREAITE
      </span>
    </div>
  );
}

// =============================================
// 옵션 6: Brackets [ ] — 코드 스타일
// =============================================
function Option6() {
  return (
    <div className="flex items-center gap-0.5 font-mono">
      <span className="text-xl font-bold text-[#6366f1]">[</span>
      <span className="text-lg font-bold text-white tracking-tight">CREAITE</span>
      <span className="text-xl font-bold text-[#ec4899]">]</span>
    </div>
  );
}

// =============================================
// 옵션 7: Glow + Underline Bar
// =============================================
function Option7() {
  return (
    <div className="relative">
      <span
        className="text-xl font-black text-white tracking-tight"
        style={{ textShadow: "0 0 20px rgba(139, 92, 246, 0.6)" }}
      >
        CREAITE
      </span>
      <div className="absolute -bottom-1 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#8b5cf6] to-transparent" />
    </div>
  );
}

// =============================================
// 옵션 8: 3D Outlined (테두리만)
// =============================================
function Option8() {
  return (
    <span
      className="text-2xl font-black tracking-tight"
      style={{
        WebkitTextStroke: "1.5px transparent",
        background: "linear-gradient(135deg, #6366f1, #ec4899)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        filter: "drop-shadow(2px 2px 0 rgba(99,102,241,0.3))",
      }}
    >
      CREAITE
    </span>
  );
}

// =============================================
// 옵션 9: Bold Mono + Caret (터미널 스타일)
// =============================================
function Option9() {
  return (
    <div className="flex items-center gap-1 font-mono">
      <span className="text-[#10b981] text-sm font-bold">{">"}</span>
      <span className="text-lg font-bold text-white tracking-tighter">CREAITE</span>
      <motion.span
        className="w-1.5 h-4 bg-[#10b981]"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    </div>
  );
}

// =============================================
// 옵션 10: Stacked AI Badge
// =============================================
function Option10() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xl font-black text-white tracking-tight">CREATE</span>
      <span className="px-1.5 py-0.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded text-[9px] font-black text-white tracking-widest">
        WITH AI
      </span>
    </div>
  );
}

// =============================================
// 옵션 11: Diamond Mark (다이아몬드 마크)
// =============================================
function Option11() {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-7 h-7">
        <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1] to-[#ec4899] rotate-45 rounded-md" />
        <div className="absolute inset-0 flex items-center justify-center font-black text-white text-xs">C</div>
      </div>
      <span className="text-xl font-black text-white tracking-tight">CREAITE</span>
    </div>
  );
}

// =============================================
// 옵션 12: 두 단어로 분리 (CREAT.E)
// =============================================
function Option12() {
  return (
    <div className="flex items-baseline gap-0">
      <span className="text-xl font-black text-white tracking-tight">CREAT</span>
      <span className="text-xl font-black bg-gradient-to-r from-[#a78bfa] to-[#ec4899] bg-clip-text text-transparent tracking-tight italic">.</span>
      <span className="text-xl font-black bg-gradient-to-r from-[#a78bfa] to-[#ec4899] bg-clip-text text-transparent tracking-tight">E</span>
    </div>
  );
}

// =============================================
// 옵션 0: 현재 (비교용)
// =============================================
function OptionCurrent() {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.png" alt="CREAITE Logo" className="w-7 h-7 rounded-lg" />
      <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
        CREAITE
      </span>
    </div>
  );
}

export function LogoPreview() {
  const options = [
    { name: "현재 (Before)", desc: "logo.png + 보라 그라디언트 텍스트", Component: OptionCurrent },
    { name: "옵션 1: Modern Gradient", desc: "C 뱃지 + 그라디언트 텍스트", Component: Option1 },
    { name: "옵션 2: Liquid Aurora", desc: "텍스트 자체가 살아있는 그라디언트", Component: Option2 },
    { name: "옵션 3: AI 강조", desc: "CRE + AI(컬러) + TE 분리", Component: Option3 },
    { name: "옵션 4: Minimal Dot", desc: "넓은 자간 + 펄스 점 액센트", Component: Option4 },
    { name: "옵션 5: Sparkle", desc: "✨ 회전 + 이탤릭 세리프", Component: Option5 },
    { name: "옵션 6: Code Brackets", desc: "[ CREAITE ] 코드 스타일", Component: Option6 },
    { name: "옵션 7: Glow Underline", desc: "텍스트 글로우 + 아래 그라디언트 바", Component: Option7 },
    { name: "옵션 8: Outline 3D", desc: "그라디언트 텍스트 + 그림자 깊이", Component: Option8 },
    { name: "옵션 9: Terminal", desc: "> CREAITE | 깜박이는 커서", Component: Option9 },
    { name: "옵션 10: WITH AI Badge", desc: "CREATE + 'WITH AI' 뱃지", Component: Option10 },
    { name: "옵션 11: Diamond Mark", desc: "회전 다이아몬드 + C 마크", Component: Option11 },
    { name: "옵션 12: CREAT.E", desc: "CREAT + 컬러 닷 + E 분리", Component: Option12 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">CREAITE 로고 스타일 미리보기</h1>
        <p className="text-gray-400 mb-8">실제 헤더에 들어갔을 때의 모습. 마음에 드는 옵션 번호 알려주세요.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {options.map(({ name, desc, Component }) => (
            <HeaderWrap key={name} label={name} desc={desc}>
              <Component />
            </HeaderWrap>
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-3">선택 후 알려주세요</h2>
          <p className="text-gray-400 text-sm">
            번호로 선택하시면 됩니다. "옵션 2 + 옵션 11의 다이아몬드 마크" 처럼 섞기도 가능합니다.
            <br />
            폰트, 색상, 크기 추가 조정 요청도 환영합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
