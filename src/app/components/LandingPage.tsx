// 비로그인 사용자용 Landing 페이지 (2026-05-27 신설)
// 넷플릭스 패턴 — 히어로 → 가치 제안 4개 → 포스터 월 → FAQ → 하단 CTA
// 로그인 사용자는 DiscoveryFeed 가 첫 화면이라 이 페이지 안 봄.
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Play, Crown, Film, Wand2, ShieldCheck, Smartphone, ChevronDown, Sparkles } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

interface LandingPageProps {
  onLogin: () => void;
  onExplore: () => void;             // "콘텐츠 둘러보기" → DiscoveryFeed 진입
  onSubscribe?: () => void;           // 가격 프로모의 "구독 시작"
  onNavigate?: (tab: string) => void; // 정책·약관 페이지 이동
  isAuthenticated?: boolean;          // 로그인 사용자: "지금 시작하기" → 로그인 모달 대신 바로 입장
}

// 포스터 슬롯 — 실제 영상 또는 mock 시네마 포스터 (public/landing-posters/*.jpg)
type PosterSlot =
  | { kind: "video"; id: string; thumbnail: string }
  | { kind: "mock"; title: string; image: string };

// 포스터 월 슬롯 수 (5열 × 3행 = 15)
const POSTER_SLOTS = 15;
// 실제 영상으로 전환하는 임계값 (영상이 이만큼 모이기 전엔 mock 사용)
const VIDEO_THRESHOLD = 10;

// Mock 시네마 포스터 15장 — public/landing-posters/ 의 AI 생성 포스터.
// 실제 영상 10개 이상 업로드되면 자동으로 실제 썸네일로 교체됨.
const MOCK_POSTERS: Extract<PosterSlot, { kind: "mock" }>[] = [
  { kind: "mock", title: "DREAMSCAPE",      image: "/landing-posters/01-dreamscape.jpg" },
  { kind: "mock", title: "NEON RUNNER",     image: "/landing-posters/02-neon-runner.jpg" },
  { kind: "mock", title: "LOST IN MARS",    image: "/landing-posters/03-lost-in-mars.jpg" },
  { kind: "mock", title: "QUANTUM HEART",   image: "/landing-posters/04-quantum-heart.jpg" },
  { kind: "mock", title: "ECHOES",          image: "/landing-posters/05-echoes.jpg" },
  { kind: "mock", title: "THE LAST CODE",   image: "/landing-posters/06-the-last-code.jpg" },
  { kind: "mock", title: "AURORA",          image: "/landing-posters/07-aurora.jpg" },
  { kind: "mock", title: "SHADOW PROTOCOL", image: "/landing-posters/08-shadow-protocol.jpg" },
  { kind: "mock", title: "STARBORN",        image: "/landing-posters/09-starborn.jpg" },
  { kind: "mock", title: "SILENT CITY",     image: "/landing-posters/10-silent-city.jpg" },
  { kind: "mock", title: "PROJECT VENUS",   image: "/landing-posters/11-project-venus.jpg" },
  { kind: "mock", title: "PARALLEL",        image: "/landing-posters/12-parallel.jpg" },
  { kind: "mock", title: "WILDFIRE",        image: "/landing-posters/13-wildfire.jpg" },
  { kind: "mock", title: "CRYSTAL VALLEY",  image: "/landing-posters/14-crystal-valley.jpg" },
  { kind: "mock", title: "THE OBSERVER",    image: "/landing-posters/15-the-observer.jpg" },
];

const VALUE_CARDS = [
  {
    icon: Film,
    title: "무제한 AI 시네마",
    desc: "AI로 제작된 영화·드라마·애니메이션·다큐멘터리를 한곳에서 무제한 시청.",
    color: "from-cyan-500/20 to-cyan-500/5",
    borderColor: "border-cyan-500/30",
    iconColor: "text-cyan-300",
  },
  {
    icon: Wand2,
    title: "광고 없는 깔끔 시청",
    desc: "프리미엄 구독 시 모든 광고 제거. 영화관처럼 몰입.",
    color: "from-purple-500/20 to-purple-500/5",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-300",
  },
  {
    icon: ShieldCheck,
    title: "올인원 라이선스",
    desc: "구매한 영상은 유튜브·SNS·기업 마케팅까지 광범위 활용 가능. 저작권 검증·에스크로 보장.",
    color: "from-emerald-500/20 to-emerald-500/5",
    borderColor: "border-emerald-500/30",
    iconColor: "text-emerald-300",
  },
  {
    icon: Smartphone,
    title: "모든 기기에서 시청",
    desc: "데스크탑·모바일·태블릿 어디서나. 앱 설치 없이 브라우저로 바로 시청.",
    color: "from-amber-500/20 to-amber-500/5",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-300",
  },
];

const FAQ_ITEMS = [
  {
    q: "CREAITE 는 무엇인가요?",
    a: "AI 가 만든 영화·드라마·다큐멘터리를 모은 세계 최초의 AI 시네마 OTT 입니다. 시청과 동시에 크리에이터의 영상 라이선스를 구매해 본인의 콘텐츠로도 활용할 수 있습니다.",
  },
  {
    q: "구독료는 얼마인가요?",
    a: "월 ₩4,900 으로 모든 영상 무제한 시청 + 광고 제거. 비구독자도 모든 영상을 1분까지 미리보기 가능합니다.",
  },
  {
    q: "AI 영상은 저작권이 어떻게 되나요?",
    a: "업로드 시 크리에이터가 저작권 침해 없음을 보증합니다. CREAITE 는 Google Vision 자동 검사로 선정·폭력·유명인 도용 등을 차단하며, 위반 시 즉시 차단·법적 조치합니다.",
  },
  {
    q: "라이선스 구매란 무엇인가요?",
    a: "유료 영상을 구매하면 원본 파일 다운로드 + 유튜브·SNS·기업 마케팅 등 광범위한 상업 사용권을 얻습니다. 사용 기간 제한 없는 영구 라이선스입니다.",
  },
  {
    q: "크리에이터는 어떻게 수익을 얻나요?",
    a: "라이선스 판매 (80%) + 영상 광고 (영상 길이에 따라 50~60%) + OTT 구독료 풀 분배 (50%) 3가지 수익원이 있습니다. 자세한 정책은 푸터의 \"크리에이터 수익 정책\" 에서 확인 가능합니다.",
  },
  {
    q: "환불은 가능한가요?",
    a: "구독은 다음 결제일까지 자유롭게 해지 가능합니다. 영상 라이선스는 다운로드 가능한 디지털 상품 특성상 구매 후 환불이 제한됩니다 (전자상거래법상 청약 철회 예외).",
  },
  {
    q: "비로그인으로도 영상을 볼 수 있나요?",
    a: "네. 비로그인 사용자도 모든 영상을 1분까지 미리보기 가능합니다. 1분 이후 시청 + 라이선스 구매 + 댓글 등은 회원가입이 필요합니다.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group bg-white/[0.03] hover:bg-white/[0.05] rounded-xl border border-white/10 transition-colors">
      <summary className="cursor-pointer select-none px-5 py-4 flex items-center justify-between gap-4">
        <span className="text-base md:text-lg font-semibold text-white text-left">{q}</span>
        <ChevronDown className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform shrink-0" />
      </summary>
      <div className="px-5 pb-5 text-sm md:text-base text-gray-400 leading-relaxed border-t border-white/5 pt-3">
        {a}
      </div>
    </details>
  );
}

export function LandingPage({ onLogin, onExplore, onSubscribe, onNavigate, isAuthenticated }: LandingPageProps) {
  const { t } = useTranslation();
  // 초기값은 mock 포스터 — fetch 중에도 화면이 비어 보이지 않음
  const [posterSlots, setPosterSlots] = useState<PosterSlot[]>(MOCK_POSTERS);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_trending_videos", {
          p_tier: "all",
          p_hours: 168,  // 7일
          p_limit: POSTER_SLOTS,
        });
        if (error) return;
        const validVideos = (data ?? []).filter((v: any) => v.thumbnail);
        // 임계값 이상 모였을 때만 실제 영상으로 전환 (테스트 영상 노출 방지)
        if (validVideos.length >= VIDEO_THRESHOLD) {
          const slots: PosterSlot[] = validVideos
            .slice(0, POSTER_SLOTS)
            .map((v: any) => ({ kind: "video" as const, id: v.id, thumbnail: v.thumbnail }));
          // 영상이 POSTER_SLOTS 미만이면 나머지는 mock 으로 보완
          while (slots.length < POSTER_SLOTS) {
            slots.push(MOCK_POSTERS[slots.length]);
          }
          setPosterSlots(slots);
        }
      } catch (err) {
        console.warn("[LandingPage] poster fetch failed:", err);
      }
    })();
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      {/* ━━━ 1. 히어로 섹션 — 다음 섹션("왜 CREAITE") 상단이 살짝 보이게.
           모바일은 58vh 로 더 낮춰 데스크탑 좁은 화면처럼 peek 노출 (2026-06-11) ━━━ */}
      <section className="relative min-h-[58vh] md:min-h-[70vh] flex items-center justify-center overflow-hidden">
        {/* 배경 그라데이션 + 그리드 패턴 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#1a0a2e] to-[#0a0a0a]" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.3) 0%, transparent 40%),
                              radial-gradient(circle at 80% 70%, rgba(236, 72, 153, 0.25) 0%, transparent 40%),
                              radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.2) 0%, transparent 50%)`,
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center py-10 md:py-20 -translate-y-6 md:-translate-y-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md mb-6"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span className="text-xs font-bold text-amber-100">세계 최초 AI 시네마 OTT</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-black mb-4 md:mb-6 leading-tight"
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#a78bfa] via-[#ec4899] to-[#f59e0b]">
              AI 가 만든 영화
            </span>
            <br />
            <span className="text-white">무제한으로 즐기세요.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg md:text-xl text-gray-300 mb-6 md:mb-10 max-w-2xl mx-auto leading-relaxed"
          >
            월 ₩4,900 으로 무제한 시청. 비회원도 모든 영상 1분 미리보기 가능.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Button
              onClick={isAuthenticated ? onExplore : onLogin}
              className="w-full sm:w-auto px-8 py-6 text-base font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white rounded-xl shadow-[0_10px_40px_-10px_rgba(99,102,241,0.6)] border border-white/10 gap-2"
            >
              <Crown className="w-5 h-5" />
              {isAuthenticated ? "지금 시청하기" : "지금 시작하기"}
            </Button>
            <Button
              onClick={onExplore}
              variant="outline"
              className="w-full sm:w-auto px-8 py-6 text-base font-bold bg-white/5 border-white/20 hover:bg-white/10 text-white rounded-xl gap-2"
            >
              <Play className="w-5 h-5" />
              콘텐츠 둘러보기
            </Button>
          </motion.div>
        </div>

        {/* 하단 스크롤 안내 — 강조 (클릭 시 다음 섹션 스크롤) */}
        <motion.button
          type="button"
          onClick={() => {
            const next = document.querySelector("section:nth-of-type(2)");
            next?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 text-white hover:scale-110 transition-transform cursor-pointer"
          aria-label="다음 섹션으로 스크롤"
        >
          <span className="text-sm md:text-base font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            스크롤하여 더 보기
          </span>
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="w-11 h-11 rounded-full bg-gradient-to-br from-[#6366f1]/40 to-[#8b5cf6]/40 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-[0_4px_20px_rgba(99,102,241,0.4)]"
          >
            <ChevronDown className="w-6 h-6 text-white" />
          </motion.div>
        </motion.button>
      </section>

      {/* ━━━ 2. 가치 제안 4개 카드 — 모바일은 위 여백 줄여 "왜 CREAITE" 가 히어로 아래로 살짝 보이게 ━━━ */}
      <section className="pt-8 md:pt-20 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-5xl font-black text-white text-center mb-4"
          >
            왜 CREAITE 인가요?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-base md:text-lg text-gray-400 text-center mb-12 max-w-2xl mx-auto"
          >
            AI 가 만든 영화를 보는 것을 넘어, 활용하고 수익까지 얻는 새로운 플랫폼.
          </motion.p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {VALUE_CARDS.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`bg-gradient-to-br ${card.color} border ${card.borderColor} rounded-2xl p-6 hover:scale-[1.02] transition-transform`}
              >
                <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 ${card.iconColor}`}>
                  <card.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-white mb-2">{card.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 3. 포스터 월 (수억편의 AI 시네마) — 5열 × 3행 = 15장 ━━━ */}
      <section className="relative py-20 md:py-28 overflow-hidden">
        {/* 포스터 그리드 (배경) */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 md:gap-2 max-w-6xl mx-auto px-3 md:px-6">
          {posterSlots.map((p, i) => (
            <motion.button
              key={p.kind === "video" ? p.id : `mock-${i}`}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: (i % 6) * 0.04 }}
              onClick={onExplore}
              className="group relative aspect-[2/3] rounded-md md:rounded-lg overflow-hidden border border-white/5 hover:border-white/20 transition-all"
            >
              <img
                src={p.kind === "video" ? p.thumbnail : p.image}
                alt={p.kind === "mock" ? p.title : ""}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </motion.button>
          ))}
        </div>

        {/* 중앙 텍스트 오버레이 (그라데이션 + 카피) */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/80 via-[#0a0a0a]/40 to-[#0a0a0a]/80 pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center max-w-3xl"
          >
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-black text-white mb-3 md:mb-4 leading-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#a78bfa] via-[#ec4899] to-[#f59e0b]">
                수많은
              </span>
              <br />
              AI 시네마를 소장·시청하세요
            </h2>
            <p className="text-sm md:text-lg text-gray-200 leading-relaxed drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              영화, 드라마, 애니메이션, 다큐멘터리
              <br />
              무제한 시청, 마음에 든 영상은 라이선스 구매로 평생 소장.
            </p>
          </motion.div>
        </div>
      </section>


      {/* ━━━ 4. FAQ 아코디언 ━━━ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-5xl font-black text-white text-center mb-4"
          >
            자주 묻는 질문
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-base text-gray-400 text-center mb-10"
          >
            궁금하신 점이 있나요? 답변을 확인해 보세요.
          </motion.p>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>

          {/* 추가 안내 */}
          <p className="text-center text-sm text-gray-500 mt-8">
            더 많은 정보는{" "}
            <button
              onClick={() => onNavigate?.("about")}
              className="text-[#a78bfa] hover:underline font-semibold"
            >
              회사 소개
            </button>
            {" 또는 "}
            <a
              href="?info=creator-revenue"
              className="text-[#a78bfa] hover:underline font-semibold"
            >
              크리에이터 수익 정책
            </a>
            {" 에서 확인 가능합니다."}
          </p>
        </div>
      </section>

      {/* ━━━ 5. 하단 CTA 재호출 ━━━ */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-gradient-to-br from-[#6366f1]/15 via-[#a78bfa]/10 to-[#ec4899]/10 border border-[#a78bfa]/30 rounded-3xl p-8 md:p-12 backdrop-blur-md"
          >
            <h2 className="text-3xl md:text-5xl font-black text-white mb-4">
              지금 바로 시작하세요
            </h2>
            <p className="text-base md:text-lg text-gray-300 mb-8 leading-relaxed">
              월 ₩4,900 · 광고 없는 무제한 AI 시네마.
              <br />
              언제든 해지 가능 · 회원가입 후 바로 시청.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                onClick={isAuthenticated ? onExplore : (onSubscribe || onLogin)}
                className="w-full sm:w-auto px-8 py-6 text-base font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white rounded-xl shadow-[0_10px_40px_-10px_rgba(99,102,241,0.6)] gap-2"
              >
                <Crown className="w-5 h-5" />
                {isAuthenticated ? "지금 시청하기" : "지금 시작하기"}
              </Button>
              <Button
                onClick={onExplore}
                variant="outline"
                className="w-full sm:w-auto px-8 py-6 text-base font-bold bg-white/5 border-white/20 hover:bg-white/10 text-white rounded-xl gap-2"
              >
                <Play className="w-5 h-5" />
                먼저 둘러보기
              </Button>
            </div>
          </motion.div>

          {/* 미니 푸터 (필수 사업자 정보만) */}
          <p className="text-xs text-gray-400 mt-12 leading-relaxed">
            © {new Date().getFullYear()} CREAITE · 세계 최초 AI 시네마 OTT
            <br />
            <button
              onClick={() => onNavigate?.("terms")}
              className="text-gray-500 hover:text-gray-300 underline mx-1"
            >
              이용약관
            </button>
            ·
            <button
              onClick={() => onNavigate?.("privacy")}
              className="text-gray-500 hover:text-gray-300 underline mx-1"
            >
              개인정보처리방침
            </button>
            ·
            <button
              onClick={() => onNavigate?.("about")}
              className="text-gray-500 hover:text-gray-300 underline mx-1"
            >
              회사 소개
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
