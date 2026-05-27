// 급상승랭킹 카드 디자인 미리보기 (2026-05-27)
// URL: ?preview=trending-card
//
// 옵션 A (히어로 + 캐러셀) 확정 후, 2~10위 랭킹 강조 디자인 4가지 variant 비교.
import { Crown, Play, Eye, Flame, Trophy, Sparkles } from "lucide-react";

interface MockVideo {
  id: string;
  rank: number;
  title: string;
  creator: string;
  thumbnail: string;
  duration: string;
  views: string;
  category: string;
}

// 랜딩 포스터 활용 — 영화 포스터처럼 보이는 mock
const MOCK_VIDEOS: MockVideo[] = [
  { id: "1",  rank: 1,  title: "드림스케이프",        creator: "크리에잇 스튜디오",  thumbnail: "/landing-posters/01-dreamscape.jpg",      duration: "3:42", views: "24.8만", category: "SF" },
  { id: "2",  rank: 2,  title: "네온 러너",           creator: "아틀란티스 픽처스",  thumbnail: "/landing-posters/02-neon-runner.jpg",     duration: "4:15", views: "18.3만", category: "액션" },
  { id: "3",  rank: 3,  title: "로스트 인 마스",      creator: "프리즘 미디어",      thumbnail: "/landing-posters/03-lost-in-mars.jpg",    duration: "5:28", views: "15.7만", category: "어드벤처" },
  { id: "4",  rank: 4,  title: "퀀텀 하트",           creator: "노바 필름",          thumbnail: "/landing-posters/04-quantum-heart.jpg",   duration: "3:55", views: "12.1만", category: "로맨스" },
  { id: "5",  rank: 5,  title: "에코스",              creator: "미스틱 웍스",        thumbnail: "/landing-posters/05-echoes.jpg",          duration: "4:32", views: "10.4만", category: "미스터리" },
  { id: "6",  rank: 6,  title: "더 라스트 코드",      creator: "사이파이 랩",        thumbnail: "/landing-posters/06-the-last-code.jpg",   duration: "5:11", views: "9.2만",  category: "스릴러" },
  { id: "7",  rank: 7,  title: "오로라",              creator: "엘프 스튜디오",      thumbnail: "/landing-posters/07-aurora.jpg",          duration: "3:48", views: "8.7만",  category: "판타지" },
  { id: "8",  rank: 8,  title: "섀도우 프로토콜",     creator: "다크 시그널",        thumbnail: "/landing-posters/08-shadow-protocol.jpg", duration: "4:50", views: "7.3만",  category: "스파이" },
  { id: "9",  rank: 9,  title: "스타본",              creator: "에픽 비전",          thumbnail: "/landing-posters/09-starborn.jpg",        duration: "6:02", views: "6.5만",  category: "에픽" },
  { id: "10", rank: 10, title: "사일런트 시티",       creator: "느와르 필름",        thumbnail: "/landing-posters/10-silent-city.jpg",     duration: "4:20", views: "5.8만",  category: "느와르" },
];

const REST_VIDEOS = MOCK_VIDEOS.slice(1);  // 2~10위
const HERO_VIDEO = MOCK_VIDEOS[0];          // 1위

function SectionWrapper({ label, badge, badgeColor, children }: { label: string; badge?: string; badgeColor?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 md:px-8 py-10 border-b border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          {badge && (
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold text-white ${badgeColor || "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"}`}>
              {badge}
            </span>
          )}
          <h2 className="text-lg md:text-2xl font-black text-white">{label}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1위 히어로 카드 (모든 variant 공통)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HeroCard() {
  return (
    <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-2xl overflow-hidden cursor-pointer group">
      <img src={HERO_VIDEO.thumbnail} alt={HERO_VIDEO.title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2.5 py-1 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 text-black text-xs font-black flex items-center gap-1">
            <Crown className="w-3 h-3" /> 1위
          </span>
          <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-white">{HERO_VIDEO.category}</span>
        </div>
        <h3 className="text-2xl md:text-4xl font-black text-white mb-2 max-w-2xl">{HERO_VIDEO.title}</h3>
        <p className="text-sm md:text-base text-gray-300 mb-4">
          {HERO_VIDEO.creator} · <Eye className="w-3 h-3 inline mb-0.5" /> {HERO_VIDEO.views} · {HERO_VIDEO.duration}
        </p>
        <button className="px-5 py-2.5 bg-white text-black rounded-lg font-bold text-sm flex items-center gap-2 hover:scale-105 transition-transform">
          <Play className="w-4 h-4 fill-black" /> 재생
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 원본 (옵션 A) — 작은 검정 배지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VariantOriginal() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {REST_VIDEOS.map((v) => (
        <div key={v.id} className="flex-shrink-0 w-[120px] md:w-[160px] cursor-pointer group">
          <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
            <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-black/80 flex items-center justify-center text-xs font-black">
              {v.rank}
            </span>
          </div>
          <p className="text-xs font-bold text-white mt-2 line-clamp-1">{v.title}</p>
          <p className="text-[11px] text-gray-400 line-clamp-1">조회 {v.views}</p>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A-1: Netflix Top 10 시그니처 — 외곽선 거대 숫자가 포스터 옆에 겹침
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VariantNetflix() {
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {REST_VIDEOS.map((v) => (
        <div key={v.id} className="flex-shrink-0 flex items-end cursor-pointer group">
          <span
            className="text-[80px] md:text-[120px] font-black leading-[0.8] -mr-3 md:-mr-5 select-none pointer-events-none"
            style={{
              WebkitTextStroke: "2.5px white",
              color: "transparent",
              textShadow: "0 0 1px rgba(255,255,255,0.4)",
            }}
          >
            {v.rank}
          </span>
          <div className="relative w-[90px] md:w-[130px] aspect-[2/3] rounded-md overflow-hidden flex-shrink-0">
            <img src={v.thumbnail} alt={v.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A-2: 다이아몬드 그라데이션 코너 — 포스터 좌상단 삼각형 배지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VariantDiamondCorner() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {REST_VIDEOS.map((v) => (
        <div key={v.id} className="flex-shrink-0 w-[120px] md:w-[160px] cursor-pointer group">
          <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
            <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            {/* 좌상단 삼각형 그라데이션 */}
            <div
              className={`absolute top-0 left-0 w-16 h-16 md:w-20 md:h-20 ${
                v.rank <= 3
                  ? "bg-gradient-to-br from-amber-300 via-orange-500 to-red-700"
                  : "bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-900"
              }`}
              style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
            />
            {/* 숫자 */}
            <span className="absolute top-1 left-1.5 md:top-1.5 md:left-2 text-xl md:text-2xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">
              {v.rank}
            </span>
          </div>
          <p className="text-xs font-bold text-white mt-2 line-clamp-1">{v.title}</p>
          <p className="text-[11px] text-gray-400 line-clamp-1">조회 {v.views}</p>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A-3: 메달 — 1~3위 금/은/동, 4~10위 다크 메탈릭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VariantMedal() {
  const medalStyle = (rank: number) => {
    if (rank === 2) return { bg: "bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500", ring: "ring-2 ring-slate-200/60", text: "text-slate-900" };
    if (rank === 3) return { bg: "bg-gradient-to-br from-orange-300 via-orange-500 to-orange-700", ring: "ring-2 ring-orange-300/60", text: "text-orange-950" };
    return { bg: "bg-gradient-to-br from-zinc-700 via-zinc-800 to-black", ring: "ring-1 ring-white/20", text: "text-white" };
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {REST_VIDEOS.map((v) => {
        const m = medalStyle(v.rank);
        return (
          <div key={v.id} className="flex-shrink-0 w-[120px] md:w-[160px] cursor-pointer group">
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
              <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              {/* 좌상단 메달 */}
              <div className={`absolute top-2 left-2 w-10 h-10 md:w-12 md:h-12 rounded-full ${m.bg} ${m.ring} flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.5)]`}>
                <span className={`text-base md:text-lg font-black ${m.text} drop-shadow`}>{v.rank}</span>
              </div>
              {/* 2/3위에만 trophy 아이콘 */}
              {v.rank <= 3 && (
                <Trophy className="absolute top-2.5 right-2 w-4 h-4 text-amber-300 drop-shadow" />
              )}
            </div>
            <p className="text-xs font-bold text-white mt-2 line-clamp-1">{v.title}</p>
            <p className="text-[11px] text-gray-400 line-clamp-1">조회 {v.views}</p>
          </div>
        );
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A-4: 네온 글로우 — LED 사인 스타일 거대 숫자
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VariantNeon() {
  const neon = (rank: number) => {
    if (rank === 2) return { color: "#fbbf24", glow: "0 0 8px #fbbf24, 0 0 16px #fbbf24, 0 0 32px #fbbf24" };  // amber
    if (rank === 3) return { color: "#22d3ee", glow: "0 0 8px #22d3ee, 0 0 16px #22d3ee, 0 0 32px #22d3ee" };  // cyan
    if (rank === 4) return { color: "#f472b6", glow: "0 0 8px #f472b6, 0 0 16px #f472b6, 0 0 32px #f472b6" };  // pink
    return { color: "#a78bfa", glow: "0 0 6px #a78bfa, 0 0 14px #a78bfa, 0 0 24px #a78bfa" };                   // violet
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {REST_VIDEOS.map((v) => {
        const n = neon(v.rank);
        return (
          <div key={v.id} className="flex-shrink-0 w-[120px] md:w-[160px] cursor-pointer group">
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
              <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              {/* 좌하단 네온 숫자 */}
              <div className="absolute bottom-2 left-2">
                <span
                  className="text-4xl md:text-5xl font-black leading-none italic"
                  style={{ color: n.color, textShadow: n.glow }}
                >
                  {v.rank}
                </span>
              </div>
            </div>
            <p className="text-xs font-bold text-white mt-2 line-clamp-1">{v.title}</p>
            <p className="text-[11px] text-gray-400 line-clamp-1">조회 {v.views}</p>
          </div>
        );
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Preview 페이지 본체
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function TrendingCardPreview() {
  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0a] text-white">
      {/* 헤더 */}
      <header className="px-4 md:px-8 py-8 border-b border-white/10 bg-gradient-to-br from-[#1a0a2e]/60 to-[#0a0a0a]">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs text-amber-300 font-bold mb-2 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5" /> 미리보기 (개발자 전용)
          </p>
          <h1 className="text-3xl md:text-4xl font-black mb-2">옵션 A — 2~10위 랭킹 강조 비교</h1>
          <p className="text-sm text-gray-400">
            1위 히어로 카드는 동일하게 두고, 2~10위 가로 캐러셀의 랭킹 표시만 4가지 디자인으로 비교합니다.
            <br className="hidden md:block" />
            모바일 화면도 함께 확인하세요 (F12 → Ctrl+Shift+M).
          </p>
        </div>
      </header>

      {/* 1위 히어로 카드 (한 번만 표시) */}
      <SectionWrapper label="1위 — 히어로 카드 (모든 variant 공통)">
        <HeroCard />
      </SectionWrapper>

      {/* 원본 — 작은 검정 배지 (참고용) */}
      <SectionWrapper label="원본 — 작은 검정 배지 (현재)" badge="원본" badgeColor="bg-zinc-700">
        <VariantOriginal />
      </SectionWrapper>

      {/* 강조 variant 4가지 */}
      <SectionWrapper label="A-1 — Netflix Top 10 시그니처" badge="A-1" badgeColor="bg-gradient-to-r from-red-600 to-red-700">
        <VariantNetflix />
      </SectionWrapper>

      <SectionWrapper label="A-2 — 다이아몬드 그라데이션 코너" badge="A-2" badgeColor="bg-gradient-to-r from-amber-500 to-orange-600">
        <VariantDiamondCorner />
      </SectionWrapper>

      <SectionWrapper label="A-3 — 금/은/동 메달" badge="A-3" badgeColor="bg-gradient-to-r from-yellow-500 to-amber-600">
        <VariantMedal />
      </SectionWrapper>

      <SectionWrapper label="A-4 — 네온 글로우 (LED 사인)" badge="A-4" badgeColor="bg-gradient-to-r from-cyan-500 to-violet-600">
        <VariantNeon />
      </SectionWrapper>

      {/* 푸터 */}
      <footer className="px-4 md:px-8 py-12 text-center">
        <Sparkles className="w-6 h-6 text-amber-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400 max-w-xl mx-auto">
          마음에 드는 강조 디자인을 알려주세요 (A-1 / A-2 / A-3 / A-4 / 원본).
          <br />
          Cinema.tsx 의 trending 행에 1위 히어로 + 선택한 강조 디자인이 적용됩니다.
        </p>
      </footer>
    </div>
  );
}
