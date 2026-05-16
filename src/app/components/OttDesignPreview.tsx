// ════════════════════════════════════════════════════════════════════════════
// OTT 페이지 디자인 미리보기 — 4가지 옵션 비교
// 접근: ?preview=ott-design
//
// 각 옵션을 정적 와이어프레임으로 표시 → 채택 후 실제 OTT 페이지 작업
// Mock 데이터 사용 (showcaseVideos.ts 재활용)
// ════════════════════════════════════════════════════════════════════════════
import { useState, useRef } from "react";
import { Play, Info, Heart, Sparkles, Wand2, Film, Tv, Moon, Zap, Heart as HeartIcon, Rocket, ChevronRight, ChevronLeft } from "lucide-react";
import { motion } from "motion/react";
import { SHOWCASE_VIDEOS } from "../data/showcaseVideos";

const TOP = SHOWCASE_VIDEOS.slice(0, 1)[0];
const FEATURED = SHOWCASE_VIDEOS.slice(0, 5);
const CINEMA_VIDEOS = SHOWCASE_VIDEOS.filter(v => v.durationSeconds >= 600).slice(0, 12);
const SORA_VIDEOS = SHOWCASE_VIDEOS.filter(v => v.tool === "Sora").slice(0, 6);
const RUNWAY_VIDEOS = SHOWCASE_VIDEOS.filter(v => v.tool === "Runway").slice(0, 6);
const VEO_VIDEOS = SHOWCASE_VIDEOS.filter(v => v.tool === "Veo").slice(0, 6);

export function OttDesignPreview() {
  const [active, setActive] = useState<"FINAL" | "A" | "B" | "C" | "D">("FINAL");

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] text-white overflow-y-auto z-[60]">
      {/* 상단 옵션 셀렉터 (sticky) */}
      <div className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black bg-gradient-to-r from-[#6366f1] to-[#ec4899] bg-clip-text text-transparent">
              OTT 디자인 옵션 미리보기
            </h1>
            <p className="text-xs text-gray-500 mt-1">최종안 채택 / 다른 옵션과 비교 가능</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setActive("FINAL");
                document.getElementById(`option-FINAL`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${
                active === "FINAL"
                  ? "bg-gradient-to-r from-amber-500 to-pink-500 text-white shadow-lg shadow-pink-500/30"
                  : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40"
              }`}
            >
              ⭐ 최종안 (A+D)
            </button>
            {(["A", "B", "C", "D"] as const).map(k => (
              <button
                key={k}
                onClick={() => {
                  setActive(k);
                  document.getElementById(`option-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  active === k
                    ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-lg"
                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                옵션 {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ⭐ 최종안 — A 메인 + D 하부 (캐러셀) */}
      <section id="option-FINAL" className="border-b-4 border-pink-500/30">
        <FinalRecommended />
      </section>

      {/* 옵션 A — 시네마틱 매거진 */}
      <section id="option-A" className="border-b border-white/10">
        <OptionHeader letter="A" title="시네마틱 매거진" subtitle="Apple TV+ + Letterboxd 영감 — 풀블리드 히어로 + 매거진 큐레이션" />
        <CinematicMagazine />
      </section>

      {/* 옵션 B — 무드 갤러리 */}
      <section id="option-B" className="border-b border-white/10">
        <OptionHeader letter="B" title="무드 갤러리" subtitle="Spotify Mood 영감 — 무드별 컬러 그라데이션 컬렉션" />
        <MoodGallery />
      </section>

      {/* 옵션 C — 시네마 룸 (가상 영화관) */}
      <section id="option-C" className="border-b border-white/10">
        <OptionHeader letter="C" title="시네마 룸 (가상 영화관)" subtitle="3D 영화관 시각화 + 장르 룸 진입 — 차별성 최강" />
        <CinemaRoom />
      </section>

      {/* 옵션 D — AI 시네마 큐레이션 */}
      <section id="option-D">
        <OptionHeader letter="D" title="AI 시네마 큐레이션" subtitle="CREAITE 정체성 직접 — AI 도구별 큐레이션 + 제작 메타데이터 강조" />
        <AiCuration />
      </section>

      {/* 하단 결정 안내 */}
      <div className="bg-gradient-to-r from-[#6366f1]/20 to-[#ec4899]/20 border-t border-white/10 py-8 px-6 text-center">
        <p className="text-sm text-gray-400 mb-2">디자인 결정 후 알려주세요</p>
        <p className="text-2xl font-black bg-gradient-to-r from-[#6366f1] to-[#ec4899] bg-clip-text text-transparent">
          "옵션 A로 가자" / "B + D 결합" 등
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ⭐ 최종안 — A 메인 (시네마틱 매거진) + D 하부 (AI 도구별 캐러셀)
// ────────────────────────────────────────────────────────────────────────────
function FinalRecommended() {
  return (
    <div className="bg-black pb-12">
      {/* 최종안 라벨 */}
      <div className="bg-gradient-to-r from-amber-500/20 via-pink-500/20 to-purple-500/20 border-b border-amber-500/30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">⭐</span>
            <span className="text-sm font-black text-amber-300">최종 추천안</span>
            <span className="text-xs text-gray-400">— 시네마틱 매거진(A) + AI 도구 캐러셀(D)</span>
          </div>
          <span className="text-[10px] text-gray-500">아래로 스크롤하여 확인 →</span>
        </div>
      </div>

      {/* ━━━ A 영역: 풀블리드 히어로 ━━━ */}
      <div className="relative h-[70vh] overflow-hidden">
        <img src={TOP.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-12 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-[#6366f1]/30 to-[#ec4899]/30 border border-[#a78bfa]/40 rounded-full mb-3">
            <Wand2 className="w-3 h-3 text-[#a78bfa]" />
            <span className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">CREAITE 오리지널</span>
          </div>
          <h3 className="text-5xl md:text-6xl font-black mb-4 leading-tight drop-shadow-lg">{TOP.title}</h3>
          <p className="text-base text-gray-300 mb-6 line-clamp-3">
            AI가 만든 새로운 차원의 시네마. {TOP.creator}의 신작이 도착했습니다.
            관객들이 만난 적 없는 영상미와 서사를 경험하세요.
          </p>
          <div className="flex gap-3">
            <button className="px-8 py-3 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-gray-200 transition-colors">
              <Play className="w-5 h-5 fill-black" /> 지금 보기
            </button>
            <button className="px-8 py-3 bg-white/20 backdrop-blur-md text-white font-bold rounded-lg flex items-center gap-2 hover:bg-white/30 transition-colors border border-white/30">
              <Info className="w-5 h-5" /> 작품 정보
            </button>
          </div>
        </div>
      </div>

      {/* ━━━ A 영역: 매거진 컬렉션 (1 큰 + 4 작은) ━━━ */}
      <div className="max-w-7xl mx-auto px-6 mt-12">
        <h3 className="text-xs font-bold text-[#a78bfa] uppercase tracking-widest mb-4">EDITOR'S PICK · 이번 주의 시네마</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 md:row-span-2 relative h-[400px] rounded-2xl overflow-hidden group cursor-pointer">
            <img src={FEATURED[0].thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <span className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">시네마틱 단편</span>
              <h4 className="text-2xl font-black mt-1 mb-1">{FEATURED[0].title}</h4>
              <p className="text-sm text-gray-300">{FEATURED[0].creator}</p>
            </div>
          </div>
          {FEATURED.slice(1, 5).map(v => (
            <div key={v.id} className="relative h-[195px] rounded-2xl overflow-hidden group cursor-pointer">
              <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h4 className="text-sm font-bold line-clamp-1">{v.title}</h4>
                <p className="text-[11px] text-gray-400">{v.creator}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ━━━ D 영역: AI 도구별 캐러셀 (좌우 배너 이동) ━━━ */}
      <div className="max-w-7xl mx-auto px-6 mt-16 mb-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-[#6366f1]/20 to-[#ec4899]/20 border border-[#a78bfa]/30 rounded-full mb-3">
          <Wand2 className="w-4 h-4 text-[#a78bfa]" />
          <span className="text-xs font-bold text-[#a78bfa]">세계 최초 AI 시네마 OTT</span>
        </div>
        <h3 className="text-3xl font-black mb-2 bg-gradient-to-r from-[#a78bfa] via-[#ec4899] to-[#f59e0b] bg-clip-text text-transparent">
          AI가 만든 영화의 시대
        </h3>
        <p className="text-sm text-gray-500">도구별 큐레이션으로 만나는 차세대 시네마</p>
      </div>

      <ToolCarousel title="Sora 시네마" subtitle="OpenAI Sora로 만든 작품" gradient="from-emerald-700 to-teal-900" videos={SORA_VIDEOS} />
      <ToolCarousel title="Runway 컬렉션" subtitle="Runway Gen-3의 시네마틱" gradient="from-rose-700 to-pink-900" videos={RUNWAY_VIDEOS} />
      <ToolCarousel title="Veo 오리지널" subtitle="Google Veo의 차세대 영상" gradient="from-blue-700 to-indigo-900" videos={VEO_VIDEOS} />
    </div>
  );
}

// 좌우 배너 이동 캐러셀 (D 영역용)
function ToolCarousel({ title, subtitle, gradient, videos }: { title: string; subtitle: string; gradient: string; videos: typeof SHOWCASE_VIDEOS }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 mb-8">
      {/* 섹션 헤더 (그라데이션 배경) */}
      <div className={`bg-gradient-to-r ${gradient} rounded-2xl p-5 mb-3 relative overflow-hidden`}>
        <div className="flex items-center justify-between relative z-10">
          <div>
            <h4 className="text-xl font-black flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> {title}
            </h4>
            <p className="text-xs text-white/70 mt-1">{subtitle}</p>
          </div>
          {/* 캐러셀 좌우 버튼 */}
          <div className="flex gap-2">
            <button
              onClick={() => scrollBy("left")}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 flex items-center justify-center transition-colors"
              aria-label="이전"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollBy("right")}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 flex items-center justify-center transition-colors"
              aria-label="다음"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* 배경 효과 */}
        <div className="absolute -right-10 -bottom-10 opacity-20">
          <Sparkles className="w-32 h-32" />
        </div>
      </div>

      {/* 캐러셀 (좌우 스크롤 + snap) */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {videos.map(v => (
          <div
            key={v.id}
            className="flex-shrink-0 w-[200px] md:w-[240px] cursor-pointer group snap-start"
          >
            <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2 relative">
              <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[9px] font-bold flex items-center gap-1">
                <Wand2 className="w-2.5 h-2.5" /> {v.tool}
              </div>
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-bold">
                {v.duration}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                <div>
                  <p className="text-xs text-gray-300 mb-1 flex items-center gap-1">
                    <Heart className="w-3 h-3 fill-pink-500 text-pink-500" /> {v.likes.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm font-bold line-clamp-1">{v.title}</p>
            <p className="text-[11px] text-gray-500">{v.creator}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptionHeader({ letter, title, subtitle }: { letter: string; title: string; subtitle: string }) {
  return (
    <div className="max-w-7xl mx-auto px-6 pt-12 pb-6">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-5xl font-black bg-gradient-to-br from-[#6366f1] to-[#ec4899] bg-clip-text text-transparent">
          {letter}
        </span>
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 옵션 A — 시네마틱 매거진
// ────────────────────────────────────────────────────────────────────────────
function CinematicMagazine() {
  return (
    <div className="bg-black pb-12">
      {/* 풀블리드 히어로 */}
      <div className="relative h-[70vh] overflow-hidden">
        <img src={TOP.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-12 max-w-2xl">
          <div className="text-xs font-bold text-[#a78bfa] uppercase tracking-widest mb-2">CREAITE 오리지널</div>
          <h3 className="text-5xl md:text-6xl font-black mb-4 leading-tight drop-shadow-lg">{TOP.title}</h3>
          <p className="text-base text-gray-300 mb-6 line-clamp-3">
            AI가 만든 새로운 차원의 시네마. {TOP.creator}의 신작이 도착했습니다.
            관객들이 만난 적 없는 영상미와 서사를 경험하세요.
          </p>
          <div className="flex gap-3">
            <button className="px-8 py-3 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-gray-200 transition-colors">
              <Play className="w-5 h-5 fill-black" /> 지금 보기
            </button>
            <button className="px-8 py-3 bg-white/20 backdrop-blur-md text-white font-bold rounded-lg flex items-center gap-2 hover:bg-white/30 transition-colors border border-white/30">
              <Info className="w-5 h-5" /> 작품 정보
            </button>
          </div>
        </div>
      </div>

      {/* 매거진 컬렉션 — 1 큰 + 4 작은 */}
      <div className="max-w-7xl mx-auto px-6 mt-12">
        <h3 className="text-xs font-bold text-[#a78bfa] uppercase tracking-widest mb-4">EDITOR'S PICK · 이번 주의 시네마</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 큰 매거진 카드 */}
          <div className="md:col-span-2 md:row-span-2 relative h-[400px] rounded-2xl overflow-hidden group cursor-pointer">
            <img src={FEATURED[0].thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <span className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">시네마틱 단편</span>
              <h4 className="text-2xl font-black mt-1 mb-1">{FEATURED[0].title}</h4>
              <p className="text-sm text-gray-300">{FEATURED[0].creator}</p>
            </div>
          </div>
          {/* 작은 카드 4개 */}
          {FEATURED.slice(1, 5).map(v => (
            <div key={v.id} className="relative h-[195px] rounded-2xl overflow-hidden group cursor-pointer">
              <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h4 className="text-sm font-bold line-clamp-1">{v.title}</h4>
                <p className="text-[11px] text-gray-400">{v.creator}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 캐러셀 */}
      <div className="max-w-7xl mx-auto px-6 mt-12">
        <h3 className="text-lg font-bold mb-3">지금 뜨는 작품</h3>
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide">
          {CINEMA_VIDEOS.slice(0, 8).map(v => (
            <div key={v.id} className="flex-shrink-0 w-48 cursor-pointer group">
              <div className="aspect-video rounded-lg overflow-hidden mb-2">
                <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </div>
              <p className="text-xs font-bold line-clamp-1">{v.title}</p>
              <p className="text-[10px] text-gray-500">{v.duration}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 옵션 B — 무드 갤러리
// ────────────────────────────────────────────────────────────────────────────
function MoodGallery() {
  const moods = [
    { name: "조용한 밤", icon: Moon, gradient: "from-indigo-900 via-purple-900 to-blue-900", count: 24 },
    { name: "긴장감 폭발", icon: Zap, gradient: "from-orange-700 via-red-700 to-rose-900", count: 18 },
    { name: "감동의 순간", icon: HeartIcon, gradient: "from-pink-700 via-rose-600 to-amber-600", count: 31 },
    { name: "우주의 여정", icon: Rocket, gradient: "from-purple-900 via-violet-700 to-indigo-900", count: 12 },
    { name: "달콤한 로맨스", icon: HeartIcon, gradient: "from-rose-700 via-pink-600 to-fuchsia-700", count: 27 },
    { name: "심야 스릴러", icon: Moon, gradient: "from-gray-900 via-slate-800 to-zinc-900", count: 15 },
  ];

  return (
    <div className="bg-[#0a0a0a] pb-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-8">
          <p className="text-xs font-bold text-[#a78bfa] uppercase tracking-widest mb-2">오늘의 무드</p>
          <h3 className="text-3xl font-black mb-2">지금 분위기에 어울리는 영화</h3>
          <p className="text-sm text-gray-500">AI가 큐레이션한 무드별 작품을 만나보세요</p>
        </div>

        {/* 무드 카드 그리드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-12">
          {moods.map(mood => {
            const Icon = mood.icon;
            return (
              <motion.div
                key={mood.name}
                whileHover={{ scale: 1.03 }}
                className={`relative h-48 rounded-2xl overflow-hidden cursor-pointer bg-gradient-to-br ${mood.gradient} p-6 flex flex-col justify-between`}
              >
                <Icon className="w-8 h-8 text-white/60" />
                <div>
                  <h4 className="text-2xl font-black mb-1">{mood.name}</h4>
                  <p className="text-xs text-white/70">{mood.count}편 큐레이션</p>
                </div>
                <div className="absolute top-3 right-3 opacity-30">
                  <Icon className="w-20 h-20" />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* 선택한 무드 컬렉션 */}
        <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-2xl p-6 border border-indigo-500/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold text-[#a78bfa] uppercase mb-1">선택한 무드</p>
              <h4 className="text-2xl font-black flex items-center gap-2"><Moon className="w-6 h-6" /> 조용한 밤</h4>
            </div>
            <button className="text-xs text-gray-400 flex items-center gap-1 hover:text-white">전체 보기 <ChevronRight className="w-3 h-3" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CINEMA_VIDEOS.slice(0, 4).map(v => (
              <div key={v.id} className="aspect-video rounded-lg overflow-hidden cursor-pointer group relative">
                <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <p className="absolute bottom-2 left-2 right-2 text-xs font-bold line-clamp-1">{v.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 옵션 C — 시네마 룸 (가상 영화관)
// ────────────────────────────────────────────────────────────────────────────
function CinemaRoom() {
  const rooms = [
    { name: "SF 룸", color: "from-cyan-600 to-blue-800", description: "우주, 미래, 사이파이" },
    { name: "스릴러 룸", color: "from-red-700 to-rose-900", description: "긴장감 가득한 작품" },
    { name: "드라마 룸", color: "from-amber-700 to-orange-900", description: "삶의 이야기" },
    { name: "판타지 룸", color: "from-violet-700 to-purple-900", description: "마법과 환상" },
    { name: "코미디 룸", color: "from-yellow-500 to-amber-700", description: "유쾌한 시간" },
  ];

  return (
    <div className="bg-[#050505] pb-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* 가상 영화관 입장 */}
        <div className="mb-12 text-center py-12 relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#1a0a2e] to-[#000]">
          {/* 3D 영화관 효과 */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <div className="w-[600px] h-[400px] bg-gradient-radial from-yellow-400/30 to-transparent rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <Tv className="w-16 h-16 mx-auto mb-4 text-[#a78bfa]" />
            <h3 className="text-4xl font-black mb-2">CREAITE 시네마 입장</h3>
            <p className="text-sm text-gray-400 mb-6">원하는 장르의 시네마 룸을 선택하세요</p>
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20">
              <Play className="w-4 h-4" />
              <span className="text-sm font-bold">현재 상영 중: 24편</span>
            </div>
          </div>
          {/* 좌석 라인 (시각적 효과) */}
          <div className="absolute bottom-0 left-0 right-0 h-16 flex items-end justify-center gap-1 opacity-20">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="w-3 h-8 bg-white rounded-t-md" style={{ height: `${20 + Math.random() * 20}px` }} />
            ))}
          </div>
        </div>

        {/* 장르 룸 진입 카드 */}
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Film className="w-5 h-5" /> 장르별 시네마 룸
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {rooms.map((room, idx) => (
            <motion.div
              key={room.name}
              whileHover={{ y: -4, scale: 1.02 }}
              className="relative h-56 rounded-2xl overflow-hidden cursor-pointer group"
              style={{ perspective: "1000px" }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${room.color}`} />
              {/* 영화관 스크린 시뮬레이션 */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-white/20 rounded-md flex items-center justify-center backdrop-blur-sm border border-white/30">
                <img src={CINEMA_VIDEOS[idx % CINEMA_VIDEOS.length].thumbnail} alt="" className="w-full h-full object-cover rounded-md opacity-80" />
              </div>
              {/* 좌석 라인 */}
              <div className="absolute bottom-12 left-0 right-0 flex items-end justify-center gap-1 opacity-40">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-2 h-4 bg-black rounded-t-sm" />
                ))}
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h4 className="text-lg font-black">{room.name}</h4>
                <p className="text-[11px] text-white/80">{room.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 선택한 룸의 콘텐츠 */}
        <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 rounded-2xl p-6 border border-cyan-500/20">
          <h4 className="text-lg font-black mb-4 flex items-center gap-2"><Rocket className="w-5 h-5" /> SF 룸 — 현재 상영작</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CINEMA_VIDEOS.slice(0, 4).map(v => (
              <div key={v.id} className="aspect-video rounded-lg overflow-hidden cursor-pointer group relative">
                <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-bold">{v.duration}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 옵션 D — AI 시네마 큐레이션
// ────────────────────────────────────────────────────────────────────────────
function AiCuration() {
  return (
    <div className="bg-gradient-to-b from-[#0a0a0a] to-[#1a0a2e] pb-12">
      <div className="max-w-7xl mx-auto px-6">
        {/* 헤더 */}
        <div className="text-center py-8 mb-8 relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-[#6366f1]/20 to-[#ec4899]/20 border border-[#a78bfa]/30 rounded-full mb-4">
            <Wand2 className="w-4 h-4 text-[#a78bfa]" />
            <span className="text-xs font-bold text-[#a78bfa]">세계 최초 AI 시네마 OTT</span>
          </div>
          <h3 className="text-4xl font-black mb-2 bg-gradient-to-r from-[#a78bfa] via-[#ec4899] to-[#f59e0b] bg-clip-text text-transparent">
            AI가 만든 영화의 시대
          </h3>
          <p className="text-sm text-gray-400 max-w-xl mx-auto">
            인간이 상상한 모든 것을 AI가 시네마로 빚어냅니다. 도구별 큐레이션으로 만나보세요.
          </p>
        </div>

        {/* 이번 주 AI 시네마 (큰 카드 + 메타데이터) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 bg-[#121212] rounded-2xl p-6 border border-[#a78bfa]/20">
          <div className="aspect-video rounded-xl overflow-hidden">
            <img src={TOP.thumbnail} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">이번 주 AI 시네마</span>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold">FEATURED</span>
              </div>
              <h4 className="text-2xl font-black mb-2">{TOP.title}</h4>
              <p className="text-sm text-gray-400 mb-4">{TOP.creator} · {TOP.duration}</p>
              <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                {TOP.tool}로 제작된 시네마틱 단편. 새로운 영상미의 가능성을 보여주는 작품.
              </p>
            </div>
            {/* AI 제작 메타데이터 — CREAITE 차별점 */}
            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">🎬 이 영화는 어떻게 만들어졌나</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-[10px] text-gray-500">AI 도구</p>
                  <p className="font-bold text-[#a78bfa]">{TOP.tool}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">해상도</p>
                  <p className="font-bold">{TOP.resolution}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">제작 기간</p>
                  <p className="font-bold">14일</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI 도구별 큐레이션 */}
        <ToolSection title="Sora 시네마" subtitle="OpenAI Sora로 만든 작품" gradient="from-emerald-700 to-teal-900" videos={SORA_VIDEOS} />
        <ToolSection title="Runway 컬렉션" subtitle="Runway Gen-3의 시네마틱" gradient="from-rose-700 to-pink-900" videos={RUNWAY_VIDEOS} />
        <ToolSection title="Veo 오리지널" subtitle="Google Veo의 차세대 영상" gradient="from-blue-700 to-indigo-900" videos={VEO_VIDEOS} />
      </div>
    </div>
  );
}

function ToolSection({ title, subtitle, gradient, videos }: { title: string; subtitle: string; gradient: string; videos: typeof SHOWCASE_VIDEOS }) {
  return (
    <div className="mb-8">
      <div className={`bg-gradient-to-r ${gradient} rounded-2xl p-6 mb-3`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xl font-black flex items-center gap-2"><Sparkles className="w-5 h-5" /> {title}</h4>
            <p className="text-xs text-white/70 mt-1">{subtitle}</p>
          </div>
          <button className="text-xs flex items-center gap-1 px-3 py-1.5 bg-white/20 rounded-lg hover:bg-white/30">
            전체 보기 <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {videos.map(v => (
          <div key={v.id} className="cursor-pointer group">
            <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2 relative">
              <img src={v.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[9px] font-bold flex items-center gap-1">
                <Wand2 className="w-2.5 h-2.5" /> {v.tool}
              </div>
            </div>
            <p className="text-xs font-bold line-clamp-1">{v.title}</p>
            <p className="text-[10px] text-gray-500">{v.creator}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
