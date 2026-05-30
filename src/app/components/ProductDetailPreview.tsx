// 영상 상세 페이지 개선안 미리보기 (2026-05-28)
// URL: ?preview=product-detail
//
// 옵션 A — 상세 정보 박스 정돈 + 함께 시청된 콘텐츠 (현재 ProductDetail 개선)
// 옵션 B — 시리즈/에피소드 구조 (단일 영상 → 시리즈 묶음 가능)
//
// 사용자가 보고 결정 → 적용
import { Play, Heart, MessageSquare, Send, Bookmark, Flag, Crown, Film, Flame, ShoppingCart, Download, ShieldCheck, Check, AlertTriangle } from "lucide-react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const MOCK_VIDEO = {
  title: "스타본",
  subtitle: "전설의 시작",
  year: 2026,
  rating: "15+",
  duration: "1시간 5분",
  category: "영화",
  genre: "에픽 · 어드벤처",
  aiTool: "KLING AI",
  director: "김창민",
  writer: "이수정",
  composer: "한지윤",
  cast: "AI 김지훈, AI 박서연, AI 정민호",
  views: "24.8만",
  likes: "1.2천",
  description:
    "어느 날 하늘에서 떨어진 별이 한 소년의 운명을 바꾼다. 그는 잃어버린 왕좌를 되찾기 위한 여정에 나서고, 그 길에서 진정한 영웅의 의미를 깨닫는다. AI 가 만든 광활한 판타지 시네마.",
  releaseDate: "2026-05-15",
  language: "한국어 (영어 자막)",
};

const MOCK_EPISODES = [
  { num: 1, title: "별이 떨어진 날", duration: "12분 32초", desc: "운명의 시작. 평범한 소년이 별을 발견하다.", thumbnail: "/landing-posters/09-starborn.jpg" },
  { num: 2, title: "잃어버린 왕좌", duration: "13분 15초", desc: "옛 왕국의 비밀이 드러나고, 모험이 시작된다.", thumbnail: "/landing-posters/03-lost-in-mars.jpg" },
  { num: 3, title: "그림자의 길", duration: "11분 48초", desc: "위험한 숲을 가로질러야 한다. 새로운 동료들과 만남.", thumbnail: "/landing-posters/05-echoes.jpg" },
  { num: 4, title: "왕의 시험", duration: "14분 02초", desc: "용기와 지혜를 시험받는 시간.", thumbnail: "/landing-posters/01-dreamscape.jpg" },
  { num: 5, title: "마지막 전투", duration: "16분 24초", desc: "운명의 결투. 진정한 영웅이 탄생한다.", thumbnail: "/landing-posters/06-the-last-code.jpg" },
];

const MOCK_RELATED = [
  { title: "드림스케이프", creator: "크리에잇 스튜디오", thumbnail: "/landing-posters/01-dreamscape.jpg", duration: "3:42", views: "24.8만", rating: "12+", genre: "SF" },
  { title: "네온 러너",     creator: "아틀란티스 픽처스", thumbnail: "/landing-posters/02-neon-runner.jpg", duration: "4:15", views: "18.3만", rating: "15+", genre: "액션" },
  { title: "로스트 인 마스", creator: "프리즘 미디어",     thumbnail: "/landing-posters/03-lost-in-mars.jpg", duration: "5:28", views: "15.7만", rating: "12+", genre: "어드벤처" },
  { title: "퀀텀 하트",     creator: "노바 필름",        thumbnail: "/landing-posters/04-quantum-heart.jpg", duration: "3:55", views: "12.1만", rating: "전체", genre: "로맨스" },
  { title: "에코스",        creator: "미스틱 웍스",      thumbnail: "/landing-posters/05-echoes.jpg",       duration: "4:32", views: "10.4만", rating: "15+", genre: "미스터리" },
  { title: "오로라",        creator: "엘프 스튜디오",    thumbnail: "/landing-posters/07-aurora.jpg",       duration: "3:48", views: "8.7만",  rating: "전체", genre: "판타지" },
];

function SectionWrapper({ label, badge, badgeColor, hint, children }: {
  label: string; badge?: string; badgeColor?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="px-4 md:px-8 py-10 border-b border-white/5">
      <div className="max-w-6xl mx-auto">
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
// 영상 헤더 + 줄거리 + 액션
// isSubscriber 에 따라 [구독하고 전체 보기] 버튼 노출 분기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VideoHeader({ isSubscriber = false }: { isSubscriber?: boolean }) {
  const v = MOCK_VIDEO;
  return (
    <div className="space-y-6">
      {/* 영상 영역 — 실제 페이지에서는 Bunny iframe 자동재생 (페이지 열면 즉시 재생) */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-card">
        <img src="/landing-posters/09-starborn.jpg" alt={v.title} className="absolute inset-0 w-full h-full object-cover" />
        {/* 자동재생 인디케이터 (정적 시뮬레이션) */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur rounded-full text-[10px] md:text-xs text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          AUTOPLAY
        </div>
        {/* 1분 미리보기 배지 (비구독자만 — 구독자는 표시 X) */}
        {!isSubscriber && (
          <div className="absolute top-3 right-3 px-2.5 py-1 bg-amber-500/80 backdrop-blur rounded-full text-[10px] md:text-xs font-bold text-black">
            🔒 1분 미리보기 중
          </div>
        )}
        {/* 미리보기 안내 (실제는 Bunny iframe) */}
        <div className="absolute bottom-3 left-3 right-3 text-center">
          <p className="text-[10px] text-white/60 italic">
            (실제 페이지에서는 Bunny iframe 으로 자동재생됩니다 — 클릭 불필요)
          </p>
        </div>
      </div>

      {/* 제목 + 메타 + 액션 */}
      <div>
        <h1 className="text-2xl md:text-4xl font-black text-white mb-2">{v.title}</h1>
        <p className="text-sm md:text-base text-gray-400 mb-3">{v.subtitle}</p>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-gray-300">{v.year}</span>
          <span className="px-1.5 py-0.5 border border-white/40 text-white text-xs rounded">{v.rating}</span>
          <span className="text-sm text-gray-300">· {v.duration}</span>
          <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500/40 to-orange-500/40 backdrop-blur text-white text-xs font-bold flex items-center gap-0.5">
            <Crown className="w-3 h-3" /> OTT
          </span>
        </div>
        {/* [구독하고 전체 보기] (비구독자만) + 5개 원형 액션 — 한 줄 정렬 */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {!isSubscriber && (
            <button className="px-5 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold rounded-lg flex items-center gap-2 hover:opacity-90 flex-shrink-0 shadow-[0_0_25px_rgba(99,102,241,0.5)] transition-shadow hover:shadow-[0_0_35px_rgba(139,92,246,0.7)]">
              <Crown className="w-4 h-4" /> 구독하고 전체 보기
            </button>
          )}
          {/* 5개 원형 액션 — 각자 은은한 네온 글로우 */}
          <div className="flex items-center gap-2">
            {[
              { icon: Heart, label: "좋아요", count: "1.2천", glow: "shadow-[0_0_15px_rgba(239,68,68,0.4)]" },
              { icon: MessageSquare, label: "댓글", count: "128", glow: "shadow-[0_0_15px_rgba(139,92,246,0.4)]" },
              { icon: Send, label: "공유", count: null, glow: "shadow-[0_0_15px_rgba(6,182,212,0.4)]" },
              { icon: Bookmark, label: "저장", count: null, glow: "shadow-[0_0_15px_rgba(236,72,153,0.4)]" },
              { icon: Flag, label: "신고", count: null, glow: "shadow-[0_0_15px_rgba(245,158,11,0.35)]" },
            ].map(({ icon: Icon, label, count, glow }) => (
              <button
                key={label}
                className="flex flex-col items-center text-gray-200 hover:text-white transition-colors"
                aria-label={label}
              >
                <span className={`w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center hover:border-white transition-all ${glow}`}>
                  <Icon className="w-4 h-4" strokeWidth={1.8} />
                </span>
                <span className="text-[10px] mt-1 min-h-[12px] leading-none">{count || ""}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm md:text-base text-gray-300 leading-relaxed">{v.description}</p>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 비매품 박스 (₩0 영상 — 현재 ProductDetail 이미 처리됨)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function NoSaleBox() {
  return (
    <div>
      <h3 className="text-lg md:text-xl font-black text-white mb-4">라이선스 구매</h3>
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 md:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-base md:text-lg font-black text-white mb-1">비매품</h4>
            <p className="text-xs md:text-sm text-gray-400">무료 시청</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-gray-500" />
          </div>
        </div>
        <div className="border-t border-white/10 mt-4 pt-4">
          <p className="text-xs md:text-sm text-gray-400">라이선스 없음 · 무료 시청만</p>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 라이선스 + 구매 영역 (가격 있는 영상 — 현재 ProductDetail 핵심)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LicensePurchaseBox() {
  const features = [
    "유튜브·인스타·SNS 게시물 가능",
    "기업 마케팅 가능",
    "광고·캠페인 등 상업 사용 무제한",
    "구매자 명의의 팀·조직 내 자유 사용",
    "편집·변형 후 재배포 가능",
    "구매 후 영구 사용",
    "원본 영상 파일 제공",
    "라이선스 영구 유효 (사용 기간 제한 없음)",
    "가격은 VAT 포함",
  ];
  return (
    <div className="space-y-4">
      {/* 라이선스 구매 헤더 */}
      <h3 className="text-lg md:text-xl font-black text-white">라이선스 구매</h3>

      {/* 라이선스 카드 (체크리스트) */}
      <div className="rounded-2xl bg-gradient-to-br from-[#6366f1]/12 to-[#8b5cf6]/8 border border-[#6366f1]/30 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h4 className="text-base md:text-lg font-black text-white mb-1">All-in-One License</h4>
            <p className="text-xs md:text-sm text-gray-400">유튜브·SNS·기업 마케팅 모두 가능</p>
          </div>
          <p className="text-xl md:text-2xl font-black text-[#a5b4fc] whitespace-nowrap">₩1,000,000</p>
        </div>
        <div className="border-t border-white/10 pt-4 space-y-2.5">
          {features.map((f) => (
            <div key={f} className="flex items-start gap-2.5 text-xs md:text-sm text-gray-200">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{f}</span>
            </div>
          ))}
        </div>
        {/* 장바구니 | 라이선스 구매 — 박스 안 가로 반반 */}
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button className="px-4 py-3 bg-white/5 border-2 border-white/20 text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-white/10 hover:border-white/40 shadow-[0_0_15px_rgba(236,72,153,0.25)] transition-all">
            <ShoppingCart className="w-4 h-4" /> 장바구니
          </button>
          <button className="px-4 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold rounded-lg hover:opacity-90 flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(99,102,241,0.5)] transition-shadow hover:shadow-[0_0_35px_rgba(139,92,246,0.7)]">
            <Download className="w-4 h-4" /> 구매하기
          </button>
        </div>
      </div>

      {/* 구매 전 안내 (주의 박스) */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-bold text-amber-300">구매 전 안내</p>
        </div>
        <ul className="text-xs md:text-sm text-amber-100/90 space-y-1 list-disc pl-5">
          <li>영상 콘텐츠 특성상 구매 후 환불·반품이 불가능합니다</li>
          <li>결제 전 미리보기를 통해 충분히 확인해 주시기 바랍니다</li>
        </ul>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 A — 상세 정보 박스 정돈
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OptionAInfoBox() {
  const v = MOCK_VIDEO;
  const rows: Array<[string, string]> = [
    ["감독", v.director],
    ["작가", v.writer],
    ["작곡", v.composer],
    ["출연", v.cast],
    ["카테고리", v.category],
    ["장르", v.genre],
    ["AI 도구", v.aiTool],
    ["언어", v.language],
    ["공개일", v.releaseDate],
    ["조회수", v.views + " · ♥ " + v.likes],
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 bg-white/[0.03] rounded-2xl p-5 md:p-6 border border-white/10">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3 text-sm py-1 border-b border-white/5 last:border-0">
          <span className="text-gray-500 w-20 flex-shrink-0 font-semibold">{label}</span>
          <span className="text-gray-200 flex-1">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 A — 함께 시청된 콘텐츠 (가로 캐러셀)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OptionARelated() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 md:-mx-8 px-4 md:px-8">
      {MOCK_RELATED.map((v) => (
        <div key={v.title} className="flex-shrink-0 w-[42vw] md:w-[180px] cursor-pointer group">
          <div className="relative aspect-video rounded-lg overflow-hidden bg-card">
            <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/70 rounded text-[10px] font-mono text-white">{v.duration}</span>
          </div>
          <p className="text-xs md:text-base font-semibold text-white mt-2 line-clamp-1">{v.title}</p>
          <p className="text-[10px] md:text-xs text-gray-400 line-clamp-1">{v.creator} · 조회 {v.views}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[9px] md:text-[11px] px-1.5 py-0.5 rounded border border-white/20 text-gray-300 font-semibold">{v.rating}</span>
            <span className="text-[9px] md:text-[11px] px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a5b4fc]">{v.genre}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 옵션 B — 시리즈/에피소드 목록 (회차)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function OptionBEpisodes() {
  return (
    <div className="space-y-3">
      {/* 시즌 선택 (단일 시즌만 있으면 생략 가능) */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-400">총 5화 · 1시간 8분</p>
        <select className="bg-white/10 border border-white/20 text-white text-sm rounded px-3 py-1.5">
          <option>시즌 1</option>
        </select>
      </div>
      {MOCK_EPISODES.map((ep) => (
        <div key={ep.num} className="flex gap-3 md:gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 cursor-pointer group">
          <div className="w-8 md:w-10 flex-shrink-0 flex items-center justify-center text-2xl md:text-3xl font-black text-white/50 group-hover:text-white/80">
            {ep.num}
          </div>
          <div className="relative w-32 md:w-44 aspect-video rounded-lg overflow-hidden flex-shrink-0">
            <img src={ep.thumbnail} alt={ep.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Play className="w-8 h-8 text-white fill-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-sm md:text-base font-bold text-white line-clamp-1">{ep.title}</h3>
              <span className="text-[11px] md:text-xs text-gray-400 flex-shrink-0">{ep.duration}</span>
            </div>
            <p className="text-xs md:text-sm text-gray-400 line-clamp-2 leading-relaxed">{ep.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Preview 페이지 본체
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function ProductDetailPreview() {
  return (
    <div className="h-screen overflow-y-auto bg-[#0a0a0a] text-white">
      {/* 헤더 */}
      <header className="px-4 md:px-8 py-8 border-b border-white/10 bg-gradient-to-br from-[#1a0a2e]/60 to-[#0a0a0a]">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs text-amber-300 font-bold mb-2 flex items-center gap-2">
            <Flame className="w-3.5 h-3.5" /> 미리보기 (개발자 전용)
          </p>
          <h1 className="text-3xl md:text-4xl font-black mb-2">영상 상세 페이지 개선안</h1>
          <p className="text-sm text-gray-400">
            옵션 A (상세 정보 박스 + 함께 시청된 콘텐츠) / 옵션 B (시리즈·에피소드 구조)
            <br className="hidden md:block" />
            마음에 드는 옵션 알려주세요. 우리 방식대로 단순화 가능.
          </p>
        </div>
      </header>

      {/* 영상 헤더 — 비구독자 상태 */}
      <section className="px-4 md:px-8 py-10 border-b border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-black bg-amber-400">비구독자</span>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Film className="w-3.5 h-3.5" /> 자동재생 → 1분 후 차단. [구독하고 전체 보기] CTA 표시
            </p>
          </div>
          <VideoHeader isSubscriber={false} />
        </div>
      </section>

      {/* 영상 헤더 — 구독자 상태 */}
      <section className="px-4 md:px-8 py-10 border-b border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">구독자</span>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Film className="w-3.5 h-3.5" /> 자동재생 → 끝까지 시청. [구독하고 전체 보기] 버튼 숨김 + 1분 미리보기 배지 없음
            </p>
          </div>
          <VideoHeader isSubscriber={true} />
        </div>
      </section>

      {/* 라이선스 박스 — 가격 있는 영상 (₩가격 + 체크리스트 + 구매) */}
      <SectionWrapper
        label="라이선스 박스 — 가격 있는 영상 (예: ₩1,000,000)"
        badge="가격O"
        badgeColor="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
        hint="가격이 설정된 영상에만 표시. 체크리스트 + 장바구니 + 구매하기 버튼."
      >
        <LicensePurchaseBox />
      </SectionWrapper>

      {/* 비매품 박스 — ₩0 영상 (이미 ProductDetail 에 구현됨) */}
      <SectionWrapper
        label="비매품 박스 — ₩0 영상 (현재 시스템 이미 처리)"
        badge="가격X"
        badgeColor="bg-zinc-700"
        hint="가격이 ₩0 인 영상 → 자동으로 비매품 박스로 전환. 라이선스 판매 안 함, 무료 시청만."
      >
        <NoSaleBox />
      </SectionWrapper>

      <SectionWrapper
        label="옵션 A-1 — 상세 정보 박스 (정돈)"
        badge="A-1"
        badgeColor="bg-gradient-to-r from-emerald-500 to-teal-600"
        hint="제작진·출연·카테고리·장르·AI도구·언어·공개일을 표 형태로 명확히. 현재 영상에 흩어진 정보를 한 곳에."
      >
        <OptionAInfoBox />
      </SectionWrapper>

      <SectionWrapper
        label="옵션 A-2 — 함께 시청된 콘텐츠"
        badge="A-2"
        badgeColor="bg-gradient-to-r from-blue-600 to-violet-600"
        hint="같은 크리에이터/카테고리/장르 영상을 가로 캐러셀로 추천 → 시청 시간 ↑. 알고리즘 기반."
      >
        <OptionARelated />
      </SectionWrapper>

      <SectionWrapper
        label="옵션 B — 시리즈/에피소드 구조"
        badge="B"
        badgeColor="bg-gradient-to-r from-amber-500 to-orange-600"
        hint="시리즈물 (예: 5화 드라마)을 한 영상 페이지에서 회차별 시청. DB 마이그레이션 필요 (큰 작업)."
      >
        <OptionBEpisodes />
      </SectionWrapper>

      <footer className="px-4 md:px-8 py-12 text-center">
        <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
          마음에 드는 옵션 번호 알려주세요:
          <br />
          <span className="text-emerald-300 font-bold">A-1</span> (정보 박스) /{" "}
          <span className="text-violet-300 font-bold">A-2</span> (함께 시청) /{" "}
          <span className="text-amber-300 font-bold">B</span> (시리즈/에피소드)
          <br />
          또는 <span className="text-white font-bold">A 전체</span> (A-1 + A-2) / 모두 / 일부.
        </p>
      </footer>
    </div>
  );
}
