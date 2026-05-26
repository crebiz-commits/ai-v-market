// ════════════════════════════════════════════════════════════════════════════
// 크리에이터 수익 정책 안내 페이지 (2026-05-25)
//
// 진입 경로:
//   - SPA: Footer/햄버거 메뉴/Upload 페이지/MyPage 판매 탭 (별도 작업)
//   - 별도 URL: https://www.creaite.net/?info=creator-revenue (직접 링크·공유·SEO)
//
// 내용:
//   1. 인트로 (수익 3가지)
//   2. 수익 종류 상세 카드 3종 (판매 80% / 광고 50~60% / 구독 풀 50%)
//   3. 영상 길이별 시뮬레이션 (1분 / 3분 / 10분 / 30분)
//   4. 광고 종류별 안내 (preroll·overlay·midroll·postroll·bumper)
//   5. 정산 정책 (월 정산·₩10,000 최소액·3.3% 원천징수)
//
// 메모리: 본문은 한국어 우선 (베타 한국 위주). 글로벌 출시 시 i18n 보강 예정
// ════════════════════════════════════════════════════════════════════════════

import { ArrowLeft, ShoppingBag, Megaphone, Crown, Clock, FileText, TrendingUp, Sparkles, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/button";

interface CreatorRevenueGuideProps {
  onBack: () => void;
}

const BRAND_GRADIENT = "linear-gradient(135deg, #a78bfa 0%, #ec4899 50%, #f59e0b 100%)";

export function CreatorRevenueGuide({ onBack }: CreatorRevenueGuideProps) {
  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      {/* 히어로 */}
      <div
        className="relative overflow-hidden border-b border-white/5"
        style={{ background: "radial-gradient(ellipse at top, #1a1a2e 0%, #0a0a0a 100%)" }}
      >
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full opacity-30" style={{ background: "radial-gradient(circle, rgba(167,139,250,0.4) 0%, transparent 60%)", filter: "blur(40px)" }} />
        <div className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full opacity-30" style={{ background: "radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 60%)", filter: "blur(40px)" }} />

        <div className="relative max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            돌아가기
          </button>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-black mb-4"
            style={{ backgroundImage: BRAND_GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
          >
            크리에이터 수익 정책
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-base md:text-lg text-gray-300 leading-relaxed max-w-2xl"
          >
            CREAITE에서 AI 영상으로 어떻게 수익을 얻는지, 어떤 영상이 어떤 수익원을 받을 수 있는지 한눈에 알려드립니다.
          </motion.p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-12">
        {/* 수익 발생 시점 안내 — 최상단 강조 */}
        <section>
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-5 md:p-6">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-cyan-300" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white mb-1.5">📌 수익은 언제 발생하나요?</h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  모든 수익(라이선스·광고·구독)은 시청자가 <strong className="text-cyan-300">영상 카드를 클릭해 상세보기에 진입한 뒤</strong>,
                  영상을 <strong className="text-cyan-300">재생</strong>하거나 <strong className="text-cyan-300">라이선스를 구매</strong>할 때 발생합니다.
                  홈 피드·시네마·OTT 화면에 카드가 노출되는 것 자체로는 수익이 발생하지 않습니다.
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-3">
                  ※ 홈 피드 영상 4개당 1개씩 끼는 광고는 <strong className="text-gray-400">CREAITE 자체 광고</strong>로,
                  크리에이터 분배 대상이 아닙니다. 크리에이터에게 분배되는 광고는 <strong className="text-gray-400">영상 상세보기에서 영상을 재생할 때 노출되는 광고</strong>입니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ① 수익 종류 3가지 */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2">3가지 수익원</h2>
          <p className="text-sm text-gray-500 mb-6">CREAITE는 크리에이터에게 라이선스 판매·광고·구독 3가지 방식으로 수익을 분배합니다.</p>

          <div className="grid md:grid-cols-3 gap-4">
            {/* 판매 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-emerald-500/30 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-3">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">라이선스 판매</h3>
              <p className="text-3xl font-black text-emerald-400 mb-2">80%</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                영상에 가격을 등록하면 구매자가 결제할 때마다 즉시 적립. 플랫폼 수수료 20%.
              </p>
            </div>

            {/* 광고 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-amber-500/30 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center mb-3">
                <Megaphone className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">광고 수익</h3>
              <p className="text-3xl font-black text-amber-400 mb-2">50~60%</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                영상에 붙는 광고가 노출될 때마다 수익 발생. 영상 길이에 따라 분배율 차등.
              </p>
            </div>

            {/* 구독 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-purple-500/15 flex items-center justify-center mb-3">
                <Crown className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">구독료 분배</h3>
              <p className="text-3xl font-black text-purple-400 mb-2">50% 풀</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                10분 이상 OTT 영상 시청 시간 비율로 매월 분배. 전체 구독 매출의 50%가 크리에이터 풀로 누적.
              </p>
            </div>
          </div>
        </section>

        {/* ② 영상 길이별 시뮬레이션 */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            <Clock className="w-6 h-6 text-[#a78bfa]" />
            영상 길이별 수익 가능 영역
          </h2>
          <p className="text-sm text-gray-500 mb-6">올리는 영상의 길이에 따라 노출되는 위치와 받을 수 있는 수익이 달라집니다.</p>

          <div className="space-y-3">
            {/* 1분 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/30 flex items-center justify-center">
                  <span className="text-xs font-black text-cyan-300">1분</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1">홈 피드 숏폼 (0~3분 미만)</h3>
                  <p className="text-xs text-gray-500 mb-3">홈 피드의 짧은 영상으로 노출됩니다. 시청자가 빠르게 스크롤하며 발견하는 영역.</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">📦 라이선스 판매 80%</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">📢 영상 광고 50%</span>
                    <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-white/5 opacity-50">👑 구독 분배 ✗</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3분 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-500/5 border border-pink-500/30 flex items-center justify-center">
                  <span className="text-xs font-black text-pink-300">3~10분</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1">시네마 (3분 이상)</h3>
                  <p className="text-xs text-gray-500 mb-3">시네마 탭에 노출. 비구독자도 1분까지 미리보기 가능 → 시청자가 끝까지 보려면 구독.</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">📦 라이선스 판매 80%</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">📢 영상 광고 55%</span>
                    <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-white/5 opacity-50">👑 구독 분배 ✗</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 10분+ OTT (장편 통합) */}
            <div className="bg-gradient-to-br from-[#a78bfa]/5 via-[#ec4899]/5 to-[#f59e0b]/5 border-2 border-[#a78bfa]/30 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-[#a78bfa] text-white text-[10px] font-bold tracking-wide">
                ⭐ 모든 수익원
              </div>
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-[#a78bfa] to-[#ec4899] flex items-center justify-center">
                  <span className="text-xs font-black text-white">10분+</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1">OTT (10분 이상)</h3>
                  <p className="text-xs text-gray-300 mb-3">프리미엄 OTT 탭에 노출. 구독자만 시청 가능. <strong className="text-purple-300">구독료 분배의 유일한 대상</strong> — 시청 시간이 곧 수익.</p>
                  <div className="flex flex-wrap gap-2 text-xs mb-3">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">📦 라이선스 판매 80%</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">📢 영상 광고 60%</span>
                    <span className="px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">👑 구독료 분배 ✓</span>
                  </div>
                  <div className="text-[11px] text-gray-400 leading-relaxed bg-white/[0.02] rounded-lg px-3 py-2 border border-white/5">
                    💡 <strong className="text-gray-300">영상이 길수록 유리</strong>: 같은 영상이라도 길이가 길면 시청 시간이 더 누적되어 구독료 분배 비율 ↑, 광고 노출 기회도 ↑ (mid-roll 등 다중 노출 가능).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ③ 광고 종류별 안내 */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-amber-400" />
            영상 광고 종류
          </h2>
          <p className="text-sm text-gray-500 mb-6">영상에 다음 5가지 형식의 광고가 붙으며, 노출될 때마다 크리에이터에게 수익이 분배됩니다.</p>

          <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
            {[
              { name: "Pre-roll", desc: "영상 재생 직전 노출. 가장 일반적인 광고 형식.", icon: "▶️" },
              { name: "Overlay", desc: "영상 시청 중 하단에 작은 배너로 표시. 시청 방해 최소.", icon: "💬" },
              { name: "Mid-roll", desc: "10분 이상 OTT 영상에 한해 중간 지점 광고 삽입.", icon: "⏸️" },
              { name: "Post-roll", desc: "영상 종료 시 다음 영상 추천 전 노출.", icon: "⏭️" },
              { name: "Bumper", desc: "6초 짧은 광고. 시청 흐름 거의 안 끊김.", icon: "⏱️" },
            ].map((ad, i) => (
              <div key={ad.name} className={`p-4 flex items-start gap-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div className="shrink-0 w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-base">
                  {ad.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{ad.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ad.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/80 flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              광고 단가는 1,000회 노출(CPM) 기준으로 산정되며, 영상이 노출되는 위치(홈·시네마·OTT)에 따라
              <strong className="text-amber-300"> 분배율이 차등 적용</strong>됩니다. 단가는 시장 상황·광고주 정책에 따라 변동될 수 있습니다.
            </p>
          </div>
        </section>

        {/* ④ 구독료 분배 계산 (강조) */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            <Crown className="w-6 h-6 text-purple-400" />
            구독료 분배는 어떻게 계산되나
          </h2>
          <p className="text-sm text-gray-500 mb-6">OTT 영상(10분 이상)의 유효 시청 시간 비율로 매월 분배됩니다.</p>

          <div className="bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border border-purple-500/20 rounded-2xl p-5 mb-4">
            <p className="text-xs text-purple-300 font-bold mb-2">📐 분배 공식</p>
            <code className="block text-sm text-white font-mono leading-relaxed bg-[#0a0a0a] p-3 rounded-lg whitespace-pre-wrap">
              내 수익 = (내 OTT 영상 유효 시청 시간 ÷ 전체 OTT 시청 시간) × 크리에이터 풀
              {"\n\n"}
              크리에이터 풀 = 전체 구독 매출 × 50%
            </code>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-[#121212] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">📊 예시</p>
              <p className="text-sm text-white leading-relaxed">
                전체 OTT 시청 시간 중 <strong className="text-purple-300">5%</strong>가 내 영상이라면<br />
                → 그 달 크리에이터 풀의 <strong className="text-purple-300">5%</strong>를 수령
              </p>
            </div>
            <div className="bg-[#121212] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">⚠️ 주의</p>
              <p className="text-sm text-white leading-relaxed">
                <strong className="text-amber-300">유효 시청만 카운트</strong>:<br />
                영상 길이의 <strong>30% 이상</strong> 시청 + 동일 IP 24시간 내 중복 X
              </p>
            </div>
          </div>
        </section>

        {/* ⑤ 정산 정책 */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            정산 정책
          </h2>
          <p className="text-sm text-gray-500 mb-6">매월 1일에 전월 수익을 산출해 지급합니다.</p>

          <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
            {[
              { label: "정산 주기", value: "매월 1일 (전월 1일~말일 수익 합산)" },
              { label: "지급 최소액", value: "₩10,000 — 미만 시 다음 달로 자동 이월" },
              { label: "세금 (비사업자)", value: "정산 시 3.3% 자동 원천징수 (소득세 3% + 지방세 0.3%)" },
              { label: "세금 (사업자)", value: "세금계산서 별도 발행 (사업자등록번호 등록 필요)" },
              { label: "신규 영상 유예", value: "업로드 후 48시간 광고 수익 카운트 제외 (어뷰징 방지)" },
              { label: "지급 방법", value: "마이페이지 → 설정 → 등록한 계좌로 영업일 1~2일 이내" },
            ].map((row, i) => (
              <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div className="text-xs font-bold text-gray-400 sm:w-32 shrink-0">{row.label}</div>
                <div className="text-sm text-gray-200">{row.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ⑥ 안내 박스 */}
        <section>
          <div className="bg-gradient-to-br from-[#a78bfa]/10 to-[#ec4899]/10 border border-[#a78bfa]/20 rounded-2xl p-5 md:p-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-[#a78bfa] mt-1 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white mb-2">💡 수익을 극대화하려면</h3>
                <ul className="space-y-2 text-sm text-gray-300 leading-relaxed">
                  <li>• <strong className="text-white">10분 이상 OTT 영상</strong>을 꾸준히 올리면 라이선스 + 광고 + 구독료 3가지 수익 모두 받을 수 있습니다.</li>
                  <li>• 영상 1편의 <strong className="text-white">완성도(시청 완주율)</strong>가 영상 개수보다 중요합니다.</li>
                  <li>• <strong className="text-white">관련성 있는 영상</strong>을 꾸준히 올리면 한 채널 안에서 시청자가 연속 시청 → 시청 시간 누적 효과 ↑</li>
                  <li>• 라이선스 가격은 영상별로 <strong className="text-white">자유롭게 설정</strong> 가능. 인기 영상은 점진적으로 가격을 조정할 수 있습니다.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ⑦ 면책 */}
        <section className="text-center">
          <p className="text-[11px] text-gray-600 leading-relaxed">
            본 안내문의 분배 비율·정책은 운영상의 필요에 따라 변경될 수 있으며, 변경 시 사전 공지됩니다.
            <br />
            상세한 이용약관은{" "}
            <a href="?info=terms" className="text-[#a78bfa] hover:underline">서비스 약관</a>을 참조하세요.
          </p>
        </section>

        {/* CTA */}
        <div className="flex justify-center pt-4">
          <Button
            onClick={onBack}
            className="bg-gradient-to-r from-[#a78bfa] to-[#ec4899] text-white font-bold px-8 h-12 rounded-xl"
          >
            확인했어요
          </Button>
        </div>
      </div>
    </div>
  );
}
