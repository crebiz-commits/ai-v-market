// 시네마/OTT 카드 디자인 미리보기 — 넷플릭스 스타일 (2026-05-28)
// URL: ?preview=netflix-card
//
// 3가지 변형 비교:
//   A. 호버 확장 카드 (넷플릭스 데스크탑 패턴) — hover 시 카드 확대 + 아래로 정보 패널 슬라이드
//   B. 모달 팝업 (사용자 참고 스크린샷 스타일) — hover/탭 시 카드 위치에 큰 모달 표시
//   C. 인라인 미니 정보 — 카드 아래 메타 정보 항상 표시 + hover 시 액션 버튼
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, Plus, ThumbsUp, ChevronDown, Info, Flame, Star } from "lucide-react";

interface MockVideo {
  id: string;
  title: string;
  creator: string;
  thumbnail: string;
  description: string;
  duration: string;
  views: string;
  likes: string;
  rating: string;
  genres: string[];
  category: string;
  aiTool: string;
}

const MOCK_VIDEOS: MockVideo[] = [
  {
    id: "1",
    title: "드림스케이프",
    creator: "크리에잇 스튜디오",
    thumbnail: "/landing-posters/01-dreamscape.jpg",
    description: "꿈과 현실의 경계에서 펼쳐지는 환상 여행. AI가 만든 새로운 시네마.",
    duration: "5:28",
    views: "24.8만",
    likes: "1.2천",
    rating: "12+",
    genres: ["SF", "환상"],
    category: "영화",
    aiTool: "KLING AI",
  },
  {
    id: "2",
    title: "네온 러너",
    creator: "아틀란티스 픽처스",
    thumbnail: "/landing-posters/02-neon-runner.jpg",
    description: "사이버펑크 도시의 추격전. 비 내리는 네온 거리를 달리는 한 사람.",
    duration: "4:15",
    views: "18.3만",
    likes: "9.8백",
    rating: "15+",
    genres: ["액션", "스릴러"],
    category: "영화",
    aiTool: "Runway",
  },
  {
    id: "3",
    title: "로스트 인 마스",
    creator: "프리즘 미디어",
    thumbnail: "/landing-posters/03-lost-in-mars.jpg",
    description: "화성에 홀로 남겨진 한 우주인의 사투. 광활한 붉은 사막의 비주얼.",
    duration: "6:42",
    views: "15.7만",
    likes: "1.1천",
    rating: "12+",
    genres: ["SF", "어드벤처"],
    category: "영화",
    aiTool: "Sora",
  },
  {
    id: "4",
    title: "퀀텀 하트",
    creator: "노바 필름",
    thumbnail: "/landing-posters/04-quantum-heart.jpg",
    description: "양자역학으로 연결된 두 사람의 시공간을 초월한 사랑 이야기.",
    duration: "5:55",
    views: "12.1만",
    likes: "8.3백",
    rating: "전체",
    genres: ["로맨스", "드라마"],
    category: "드라마",
    aiTool: "KLING AI",
  },
  {
    id: "5",
    title: "에코스",
    creator: "미스틱 웍스",
    thumbnail: "/landing-posters/05-echoes.jpg",
    description: "끝없이 반복되는 복도, 거울 속 그림자. 미스터리 미니 시리즈.",
    duration: "4:32",
    views: "10.4만",
    likes: "7.5백",
    rating: "15+",
    genres: ["미스터리", "스릴러"],
    category: "드라마",
    aiTool: "Veo",
  },
  {
    id: "6",
    title: "오로라",
    creator: "엘프 스튜디오",
    thumbnail: "/landing-posters/07-aurora.jpg",
    description: "마법의 숲에서 펼쳐지는 빛의 향연. 판타지 단편 명작.",
    duration: "3:48",
    views: "8.7만",
    likes: "6.2백",
    rating: "전체",
    genres: ["판타지", "어드벤처"],
    category: "애니메이션",
    aiTool: "Pika",
  },
];

function SectionWrapper({ label, badge, badgeColor, hint, children }: {
  label: string;
  badge?: string;
  badgeColor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 md:px-8 py-10 border-b border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          {badge && (
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold text-white ${badgeColor || "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"}`}>
              {badge}
            </span>
          )}
          <h2 className="text-lg md:text-2xl font-black text-white">{label}</h2>
        </div>
        {hint && <p className="text-xs md:text-sm text-gray-400 mb-6">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기준점 — 현재 카드 (작은 세로 카드, 텍스트 1-2줄)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CurrentCard() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {MOCK_VIDEOS.map((v) => (
        <div key={v.id} className="flex-shrink-0 w-[160px] md:w-[200px] cursor-pointer group">
          <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
            <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/80 rounded text-[10px] font-semibold text-white">{v.duration}</span>
          </div>
          <p className="text-sm font-bold text-white mt-2 line-clamp-1">{v.title}</p>
          <p className="text-xs text-gray-400 line-clamp-1">{v.creator} · 조회 {v.views}</p>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A. 호버 확장 카드 (넷플릭스 데스크탑) — hover 시 카드 1.4배 + 정보 슬라이드 다운
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OptionAHoverExpand() {
  return (
    <div className="flex gap-3 overflow-visible pb-32 md:pb-40 -mx-4 md:-mx-8 px-4 md:px-8 pt-6">
      {MOCK_VIDEOS.map((v) => (
        <motion.div
          key={v.id}
          whileHover={{ scale: 1.4, zIndex: 50, y: -20 }}
          transition={{ delay: 0.3, duration: 0.25, ease: "easeOut" }}
          className="flex-shrink-0 w-[160px] md:w-[200px] cursor-pointer group origin-center hover:shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-lg"
        >
          <div className="relative aspect-video rounded-t-lg overflow-hidden bg-card">
            <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/80 rounded text-[10px] font-semibold text-white">{v.duration}</span>
          </div>
          {/* 확장 시 보이는 정보 패널 */}
          <div className="bg-zinc-900 rounded-b-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity delay-200">
            <div className="flex items-center gap-1.5 mb-2">
              <button className="w-7 h-7 rounded-full bg-white flex items-center justify-center hover:bg-white/90">
                <Play className="w-3.5 h-3.5 text-black fill-black" />
              </button>
              <button className="w-7 h-7 rounded-full bg-white/10 border border-white/40 flex items-center justify-center hover:border-white">
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
              <button className="w-7 h-7 rounded-full bg-white/10 border border-white/40 flex items-center justify-center hover:border-white">
                <ThumbsUp className="w-3.5 h-3.5 text-white" />
              </button>
              <button className="ml-auto w-7 h-7 rounded-full bg-white/10 border border-white/40 flex items-center justify-center hover:border-white">
                <ChevronDown className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] mb-1">
              <span className="px-1 border border-white/40 text-white rounded">{v.rating}</span>
              <span className="text-gray-300">{v.duration}</span>
              <span className="px-1 border border-white/30 text-gray-300 rounded text-[8px]">HD</span>
            </div>
            <p className="text-[9px] text-gray-300 line-clamp-1">{v.genres.join(" · ")}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// B. 모달 팝업 (합성안) — hover/탭 시 카드 부근에 큰 모달
//   + 모바일: ⓘ 아이콘 펄스 글로우 애니메이션으로 탭 유도
//   + 카드 본체: 조회수·좋아요 메타 표시 (C 옵션에서 합성)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OptionBModal() {
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
        {MOCK_VIDEOS.map((v) => (
          <div
            key={v.id}
            className="relative flex-shrink-0 w-[160px] md:w-[200px] cursor-pointer group"
            onMouseEnter={() => setActiveId(v.id)}
            onMouseLeave={() => setActiveId(null)}
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
              <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
              <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/80 rounded text-[10px] font-semibold text-white">{v.duration}</span>
              {/* 모바일 ⓘ 아이콘 — 펄스 글로우 (좌상단, 살짝 투명 + backdrop-blur) */}
              <motion.button
                onClick={(e) => { e.stopPropagation(); setActiveId(activeId === v.id ? null : v.id); }}
                animate={{
                  scale: [1, 1.15, 1],
                  boxShadow: [
                    "0 0 0 0 rgba(139, 92, 246, 0.6)",
                    "0 0 0 10px rgba(139, 92, 246, 0)",
                    "0 0 0 0 rgba(139, 92, 246, 0)",
                  ],
                }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="md:hidden absolute top-1.5 left-1.5 w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1]/35 to-[#8b5cf6]/35 backdrop-blur-sm border border-white/15 flex items-center justify-center"
                aria-label="영상 정보 보기"
              >
                <Info className="w-4 h-4 text-white" />
              </motion.button>
              {/* OTT 배지 미리보기 (실제 카드에서 자동 표시, 살짝 투명) */}
              {v.duration === "5:28" || v.duration === "6:42" ? (
                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500/40 to-orange-500/40 backdrop-blur-sm text-white text-[9px] font-bold">
                  👑 OTT
                </div>
              ) : null}
            </div>
            <p className="text-sm font-bold text-white mt-2 line-clamp-1">{v.title}</p>
            <p className="text-xs text-gray-400 line-clamp-1">{v.creator}</p>
            {/* 조회수·좋아요 메타 (C 옵션에서 합성) */}
            <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
              <span>👁 {v.views}</span>
              <span>♥ {v.likes}</span>
            </div>

            {/* 모달 팝업 */}
            <AnimatePresence>
              {activeId === v.id && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute z-50 top-0 left-1/2 -translate-x-1/2 w-[280px] md:w-[340px] bg-zinc-900 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden border border-white/10"
                >
                  <div className="relative aspect-video bg-card">
                    <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <h3 className="absolute bottom-3 left-3 right-3 text-lg font-black text-white drop-shadow">{v.title}</h3>
                    <button
                      onClick={(e) => { e.stopPropagation(); setActiveId(null); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center md:hidden"
                    >
                      <ChevronDown className="w-4 h-4 text-white" />
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <button className="w-9 h-9 rounded-full bg-white flex items-center justify-center hover:bg-white/90">
                        <Play className="w-4 h-4 text-black fill-black" />
                      </button>
                      <button className="w-9 h-9 rounded-full bg-white/10 border border-white/40 flex items-center justify-center hover:border-white">
                        <Plus className="w-4 h-4 text-white" />
                      </button>
                      <button className="w-9 h-9 rounded-full bg-white/10 border border-white/40 flex items-center justify-center hover:border-white">
                        <ThumbsUp className="w-4 h-4 text-white" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] mb-2 flex-wrap">
                      <span className="px-1.5 py-0.5 border border-white/40 text-white rounded">{v.rating}</span>
                      <span className="text-gray-300">{v.duration}</span>
                      <span className="px-1.5 py-0.5 border border-white/30 text-gray-300 rounded text-[9px]">HD</span>
                    </div>
                    <p className="text-xs text-gray-300 mb-2">{v.genres.map((g) => "· " + g).join(" ")}</p>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{v.description}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// C. 인라인 미니 정보 — 카드 아래 항상 메타 표시 + hover 시 액션 버튼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OptionCInline() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {MOCK_VIDEOS.map((v) => (
        <div key={v.id} className="flex-shrink-0 w-[160px] md:w-[200px] cursor-pointer group">
          <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
            <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/80 rounded text-[10px] font-semibold text-white">{v.duration}</span>
            {/* hover 시 액션 버튼 — 썸네일 하단 오버레이 */}
            <div className="absolute inset-x-0 bottom-0 p-2 flex items-center gap-1.5 bg-gradient-to-t from-black/95 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
                <Play className="w-3.5 h-3.5 text-black fill-black" />
              </button>
              <button className="w-7 h-7 rounded-full bg-white/15 border border-white/40 flex items-center justify-center">
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
              <button className="w-7 h-7 rounded-full bg-white/15 border border-white/40 flex items-center justify-center">
                <ThumbsUp className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
          <p className="text-sm font-bold text-white mt-2 line-clamp-1">{v.title}</p>
          {/* 메타 정보 - 항상 표시 */}
          <div className="flex items-center gap-1 mt-1 text-[10px] flex-wrap">
            <span className="px-1 border border-white/30 text-gray-300 rounded">{v.rating}</span>
            <span className="text-gray-500">{v.genres.join(" · ")}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
            <span>👁 {v.views}</span>
            <span>♥ {v.likes}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Preview 페이지 본체
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function NetflixCardPreview() {
  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0a] text-white">
      {/* 헤더 */}
      <header className="px-4 md:px-8 py-8 border-b border-white/10 bg-gradient-to-br from-[#1a0a2e]/60 to-[#0a0a0a]">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs text-amber-300 font-bold mb-2 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5" /> 미리보기 (개발자 전용)
          </p>
          <h1 className="text-3xl md:text-4xl font-black mb-2">시네마/OTT 카드 디자인 비교</h1>
          <p className="text-sm text-gray-400">
            3가지 옵션 중 마음에 드는 디자인을 골라 VideoRowCarousel 의 카드 영역에 적용합니다.
            <br className="hidden md:block" />
            데스크탑은 마우스 hover, 모바일은 ⓘ 아이콘 탭으로 인터랙션 확인.
          </p>
        </div>
      </header>

      <SectionWrapper label="기준점 — 현재 카드 (작은 세로 카드)" badge="원본" badgeColor="bg-zinc-700" hint="제목·크리에이터·조회수만 표시. 정보 부족하면 ProductDetail 진입 필요.">
        <CurrentCard />
      </SectionWrapper>

      <SectionWrapper
        label="A. 호버 확장 카드 — 넷플릭스 데스크탑 패턴"
        badge="A"
        badgeColor="bg-gradient-to-r from-red-600 to-red-700"
        hint="hover → 카드 1.4배 확대 + 아래로 정보 패널 슬라이드. 액션 버튼·등급·장르 한 번에 보임."
      >
        <OptionAHoverExpand />
      </SectionWrapper>

      <SectionWrapper
        label="B. 모달 팝업 + 메타 합성안 (최종 후보)"
        badge="B"
        badgeColor="bg-gradient-to-r from-blue-600 to-violet-600"
        hint="hover/탭 → 카드 위에 큰 모달. 모바일은 ⓘ 아이콘이 펄스 글로우로 탭 유도. 카드 본체에 조회수·좋아요 상시 표시."
      >
        <OptionBModal />
      </SectionWrapper>

      <SectionWrapper
        label="C. 인라인 미니 정보 — 항상 표시 + hover 액션"
        badge="C"
        badgeColor="bg-gradient-to-r from-emerald-500 to-teal-600"
        hint="카드 아래 메타 정보(등급·장르·조회·좋아요) 항상 표시. hover 시 썸네일 하단에 액션 버튼 오버레이."
      >
        <OptionCInline />
      </SectionWrapper>

      <footer className="px-4 md:px-8 py-12 text-center">
        <Star className="w-6 h-6 text-amber-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400 max-w-xl mx-auto">
          마음에 드는 옵션을 알려주세요 (A / B / C).
          <br />
          VideoRowCarousel 의 카드 영역만 선택한 디자인으로 교체합니다.
        </p>
      </footer>
    </div>
  );
}
