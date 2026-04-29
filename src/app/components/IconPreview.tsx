import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Heart,
  MessageSquare,
  MessageCircle,
  MessageCircleHeart,
  Share2,
  Send,
  Sparkles,
} from "lucide-react";

interface OptionProps {
  videoBg?: string;
}

// =============================================
// 옵션 1: 말랑 젤리 버블
// =============================================
function Option1({ videoBg }: OptionProps) {
  const [liked, setLiked] = useState(false);
  return (
    <div className="relative w-full aspect-[9/16] max-w-[280px] mx-auto rounded-2xl overflow-hidden" style={{ background: videoBg }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
      <div className="absolute right-3 bottom-20 flex flex-col gap-3 items-center">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => setLiked(!liked)}
          className="flex flex-col items-center"
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${liked ? "bg-gradient-to-br from-pink-400 to-red-500" : "bg-gradient-to-br from-pink-300/60 to-red-400/60"}`}>
            <Heart className="w-6 h-6 text-white fill-white" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-bold text-white mt-1 drop-shadow">1.2K</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-purple-500 flex items-center justify-center shadow-lg">
            <MessageCircle className="w-6 h-6 text-white fill-white" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-bold text-white mt-1 drop-shadow">23</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg">
            <Send className="w-6 h-6 text-white fill-white -rotate-12" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-bold text-white mt-1 drop-shadow">공유</span>
        </motion.button>
      </div>
    </div>
  );
}

// =============================================
// 옵션 2: 글래스 + 글로우
// =============================================
function Option2({ videoBg }: OptionProps) {
  const [liked, setLiked] = useState(false);
  const [showRipple, setShowRipple] = useState(false);
  const handleLike = () => {
    setLiked(!liked);
    setShowRipple(true);
    setTimeout(() => setShowRipple(false), 600);
  };
  return (
    <div className="relative w-full aspect-[9/16] max-w-[280px] mx-auto rounded-2xl overflow-hidden" style={{ background: videoBg }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
      <div className="absolute right-3 bottom-20 flex flex-col gap-3 items-center">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={handleLike}
          className="flex flex-col items-center relative"
        >
          <AnimatePresence>
            {showRipple && (
              <motion.div
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 2.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-red-500"
              />
            )}
          </AnimatePresence>
          <div className={`relative w-12 h-12 rounded-full backdrop-blur-xl flex items-center justify-center border-2 transition-all ${liked ? "bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)]" : "bg-white/10 border-white/30"}`}>
            <Heart className={`w-6 h-6 ${liked ? "fill-red-400 text-red-400" : "text-white"}`} strokeWidth={1.8} />
          </div>
          <span className="text-[11px] font-bold text-white mt-1 drop-shadow">1.2K</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.85 }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex flex-col items-center"
        >
          <div className="w-12 h-12 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.4)]">
            <MessageCircle className="w-6 h-6 text-white" strokeWidth={1.8} />
          </div>
          <span className="text-[11px] font-bold text-white mt-1 drop-shadow">23</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} whileHover={{ rotate: 15 }} className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <Send className="w-6 h-6 text-white -rotate-12" strokeWidth={1.8} />
          </div>
          <span className="text-[11px] font-bold text-white mt-1 drop-shadow">공유</span>
        </motion.button>
      </div>
    </div>
  );
}

// =============================================
// 옵션 3: 이모지 풍 솔리드 (심쿵 애니메이션)
// =============================================
function Option3({ videoBg }: OptionProps) {
  const [liked, setLiked] = useState(false);
  return (
    <div className="relative w-full aspect-[9/16] max-w-[280px] mx-auto rounded-2xl overflow-hidden" style={{ background: videoBg }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
      <div className="absolute right-3 bottom-20 flex flex-col gap-2 items-center">
        <motion.button
          onClick={() => setLiked(!liked)}
          className="flex flex-col items-center py-1"
        >
          <motion.div
            animate={liked ? { scale: [1, 1.4, 0.9, 1.1, 1] } : {}}
            transition={{ duration: 0.5 }}
          >
            <Heart
              className={`w-9 h-9 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] ${liked ? "fill-pink-500 text-pink-500" : "fill-white/30 text-white"}`}
              strokeWidth={2}
            />
          </motion.div>
          <span className="text-[11px] font-bold text-white mt-0.5 drop-shadow">1.2K</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} className="flex flex-col items-center py-1">
          <MessageCircleHeart
            className="w-9 h-9 fill-white/30 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            strokeWidth={2}
          />
          <span className="text-[11px] font-bold text-white mt-0.5 drop-shadow">23</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} className="flex flex-col items-center py-1">
          <Send
            className="w-9 h-9 fill-white/30 text-white -rotate-12 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
            strokeWidth={2}
          />
          <span className="text-[11px] font-bold text-white mt-0.5 drop-shadow">공유</span>
        </motion.button>
      </div>
    </div>
  );
}

// =============================================
// 옵션 4: 인스타+TikTok 합성 (튀어오르는 하트)
// =============================================
function Option4({ videoBg }: OptionProps) {
  const [liked, setLiked] = useState(false);
  const [hearts, setHearts] = useState<number[]>([]);
  const handleLike = () => {
    setLiked(!liked);
    if (!liked) {
      const newHearts = [Date.now(), Date.now() + 1, Date.now() + 2];
      setHearts((p) => [...p, ...newHearts]);
      setTimeout(() => {
        setHearts((p) => p.filter((h) => !newHearts.includes(h)));
      }, 1000);
    }
  };
  return (
    <div className="relative w-full aspect-[9/16] max-w-[280px] mx-auto rounded-2xl overflow-hidden" style={{ background: videoBg }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
      <div className="absolute right-3 bottom-20 flex flex-col gap-2 items-center">
        <motion.button
          onClick={handleLike}
          className="flex flex-col items-center py-1 relative"
        >
          {/* 튀어오르는 하트 파티클 */}
          <AnimatePresence>
            {hearts.map((id, i) => (
              <motion.div
                key={id}
                initial={{ y: 0, x: 0, opacity: 1, scale: 0.5 }}
                animate={{
                  y: -60 - i * 10,
                  x: (i - 1) * 15,
                  opacity: 0,
                  scale: 1.5,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="absolute inset-0 m-auto w-fit h-fit pointer-events-none"
              >
                <Heart className="w-5 h-5 fill-pink-500 text-pink-500" />
              </motion.div>
            ))}
          </AnimatePresence>
          <motion.div
            animate={liked ? { scale: [1, 1.5, 0.9, 1.15, 1] } : {}}
            transition={{ duration: 0.4 }}
          >
            <Heart
              className={`w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] ${liked ? "fill-red-500 text-red-500" : "text-white fill-white/10"}`}
              strokeWidth={1.8}
            />
          </motion.div>
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">1.2K</span>
        </motion.button>
        <motion.button
          whileTap={{ rotate: [0, -10, 10, -5, 5, 0] }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center py-1"
        >
          <MessageSquare
            className="w-8 h-8 text-white fill-white/10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
            strokeWidth={1.8}
          />
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">23</span>
        </motion.button>
        <motion.button
          whileTap={{ y: -30, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center py-1"
        >
          <Send
            className="w-8 h-8 text-white -rotate-12 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
            strokeWidth={1.8}
          />
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">공유</span>
        </motion.button>
      </div>
    </div>
  );
}

// =============================================
// 옵션 5: 현재 (비교용)
// =============================================
function OptionCurrent({ videoBg }: OptionProps) {
  return (
    <div className="relative w-full aspect-[9/16] max-w-[280px] mx-auto rounded-2xl overflow-hidden" style={{ background: videoBg }}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
      <div className="absolute right-2 bottom-[60px] flex flex-col items-center">
        <button className="flex flex-col items-center py-1">
          <Heart className="w-7 h-7 text-white fill-white/10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" strokeWidth={1.5} />
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">1.2K</span>
        </button>
        <button className="flex flex-col items-center py-1">
          <MessageSquare className="w-7 h-7 text-white fill-white/10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" strokeWidth={1.5} />
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">23</span>
        </button>
        <button className="flex flex-col items-center py-1">
          <Share2 className="w-7 h-7 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" strokeWidth={1.5} />
          <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow">공유</span>
        </button>
      </div>
    </div>
  );
}

// =============================================
// 메인 프리뷰 페이지
// =============================================
export function IconPreview() {
  const videoBg = "linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #831843 100%)";

  const options = [
    { name: "현재 (Before)", desc: "기본 stroke 아이콘", Component: OptionCurrent },
    { name: "옵션 1: 말랑 젤리 버블", desc: "둥근 사각형 + 파스텔 그라디언트", Component: Option1 },
    { name: "옵션 2: 글래스 + 글로우", desc: "유리 효과 + 컬러 글로우 + ripple", Component: Option2 },
    { name: "옵션 3: 이모지 풍 솔리드", desc: "꽉 찬 아이콘 + 심쿵 애니메이션", Component: Option3 },
    { name: "옵션 4: 인스타+TikTok 합성", desc: "튀어오르는 하트 파티클 + 흔들림", Component: Option4 },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">아이콘 스타일 미리보기</h1>
        <p className="text-gray-400 mb-8">하트는 탭해서 인터랙션 확인 가능. 각 옵션 직접 클릭해보세요.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {options.map(({ name, desc, Component }) => (
            <div key={name} className="bg-[#111] rounded-2xl p-4 border border-white/10">
              <h3 className="font-bold mb-1">{name}</h3>
              <p className="text-xs text-gray-400 mb-4 h-8">{desc}</p>
              <Component videoBg={videoBg} />
            </div>
          ))}
        </div>

        <div className="mt-12 p-6 bg-[#111] rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <h2 className="text-xl font-bold">선택 후 알려주세요</h2>
          </div>
          <p className="text-gray-400 text-sm">
            마음에 드는 옵션 번호를 알려주시면 실제 탐색피드에 적용하겠습니다.
            <br />
            "옵션 3 좋아요 + 옵션 4의 하트 파티클"처럼 섞어도 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
