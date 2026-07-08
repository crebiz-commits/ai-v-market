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
import { useTranslation, Trans } from "react-i18next";
import { BackButton } from "./BackButton";
import { motion } from "motion/react";
import { Button } from "./ui/button";

interface CreatorRevenueGuideProps {
  onBack: () => void;
}

const BRAND_GRADIENT = "linear-gradient(135deg, #a78bfa 0%, #ec4899 50%, #f59e0b 100%)";

const AD_FORMATS = [
  { name: "Pre-roll", key: "preroll", icon: "▶️" },
  { name: "Overlay", key: "overlay", icon: "💬" },
  { name: "Mid-roll", key: "midroll", icon: "⏸️" },
  { name: "Post-roll", key: "postroll", icon: "⏭️" },
  { name: "Bumper", key: "bumper", icon: "⏱️" },
] as const;

const SETTLEMENT_ROWS = ["cycle", "minimum", "taxIndividual", "taxBusiness", "newVideoHold", "method"] as const;

export function CreatorRevenueGuide({ onBack }: CreatorRevenueGuideProps) {
  const { t } = useTranslation();
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
          <BackButton onClick={onBack} label={t("creatorDashboard.back")} className="mb-6" />

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-black mb-4"
            style={{ backgroundImage: BRAND_GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
          >
            {t("creatorRevenueGuide.title")}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-base md:text-lg text-gray-300 leading-relaxed max-w-2xl"
          >
            {t("creatorRevenueGuide.subtitle")}
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
                <h3 className="text-base font-bold text-white mb-1.5">{t("creatorRevenueGuide.when.title")}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  <Trans i18nKey="creatorRevenueGuide.when.body" components={{ b: <strong className="text-cyan-300" /> }} />
                </p>
                <p className="text-xs text-gray-500 leading-relaxed mt-3">
                  <Trans i18nKey="creatorRevenueGuide.when.note" components={{ b: <strong className="text-gray-400" /> }} />
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ① 수익 종류 3가지 */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2">{t("creatorRevenueGuide.sources.title")}</h2>
          <p className="text-sm text-gray-500 mb-6">{t("creatorRevenueGuide.sources.subtitle")}</p>

          <div className="grid md:grid-cols-3 gap-4">
            {/* 판매 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-emerald-500/30 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-3">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{t("creatorRevenueGuide.sources.license.title")}</h3>
              <p className="text-3xl font-black text-emerald-400 mb-2">80%</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {t("creatorRevenueGuide.sources.license.desc")}
              </p>
            </div>

            {/* 광고 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-amber-500/30 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center mb-3">
                <Megaphone className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{t("creatorRevenueGuide.sources.ad.title")}</h3>
              <p className="text-3xl font-black text-amber-400 mb-2">50~60%</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {t("creatorRevenueGuide.sources.ad.desc")}
              </p>
            </div>

            {/* 구독 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-purple-500/15 flex items-center justify-center mb-3">
                <Crown className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{t("creatorRevenueGuide.sources.sub.title")}</h3>
              <p className="text-3xl font-black text-purple-400 mb-2">{t("creatorRevenueGuide.sources.sub.rate")}</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {t("creatorRevenueGuide.sources.sub.desc")}
              </p>
            </div>
          </div>
        </section>

        {/* ② 영상 길이별 시뮬레이션 */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            <Clock className="w-6 h-6 text-[#a78bfa]" />
            {t("creatorRevenueGuide.tiers.title")}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t("creatorRevenueGuide.tiers.subtitle")}</p>

          <div className="space-y-3">
            {/* 1분 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/30 flex items-center justify-center">
                  <span className="text-xs font-black text-cyan-300">{t("creatorRevenueGuide.tiers.minutes1")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1">{t("creatorRevenueGuide.tiers.shorts.title")}</h3>
                  <p className="text-xs text-gray-500 mb-3">{t("creatorRevenueGuide.tiers.shorts.desc")}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-white/5 opacity-50">{t("creatorRevenueGuide.badge.licenseNo")}</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">{t("creatorRevenueGuide.badge.ad", { percent: "50%" })}</span>
                    <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-white/5 opacity-50">{t("creatorRevenueGuide.badge.subNo")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3분 */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-500/5 border border-pink-500/30 flex items-center justify-center">
                  <span className="text-xs font-black text-pink-300">{t("creatorRevenueGuide.tiers.minutes3to10")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1">{t("creatorRevenueGuide.tiers.cinema.title")}</h3>
                  <p className="text-xs text-gray-500 mb-3">{t("creatorRevenueGuide.tiers.cinema.desc")}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{t("creatorRevenueGuide.badge.license", { percent: "80%" })}</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">{t("creatorRevenueGuide.badge.ad", { percent: "55%" })}</span>
                    <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-white/5 opacity-50">{t("creatorRevenueGuide.badge.subNo")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 10분+ OTT (장편 통합) */}
            <div className="bg-gradient-to-br from-[#a78bfa]/5 via-[#ec4899]/5 to-[#f59e0b]/5 border-2 border-[#a78bfa]/30 rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-[#a78bfa] text-white text-[10px] font-bold tracking-wide">
                {t("creatorRevenueGuide.tiers.ott.badge")}
              </div>
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-[#a78bfa] to-[#ec4899] flex items-center justify-center">
                  <span className="text-xs font-black text-white">{t("creatorRevenueGuide.tiers.minutes10plus")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white mb-1">{t("creatorRevenueGuide.tiers.ott.title")}</h3>
                  <p className="text-xs text-gray-300 mb-3">
                    <Trans i18nKey="creatorRevenueGuide.tiers.ott.desc" components={{ b: <strong className="text-purple-300" /> }} />
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs mb-3">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{t("creatorRevenueGuide.badge.license", { percent: "80%" })}</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">{t("creatorRevenueGuide.badge.ad", { percent: "60%" })}</span>
                    <span className="px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">{t("creatorRevenueGuide.badge.sub", { percent: "50%" })}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 leading-relaxed bg-white/[0.02] rounded-lg px-3 py-2 border border-white/5">
                    <Trans i18nKey="creatorRevenueGuide.tiers.ott.tip" components={{ b: <strong className="text-gray-300" /> }} />
                  </div>
                  <div className="text-[11px] text-gray-400 leading-relaxed bg-purple-500/5 rounded-lg px-3 py-2 border border-purple-500/15 mt-2">
                    <Trans i18nKey="creatorRevenueGuide.tiers.ott.adNote" components={{ b: <strong className="text-purple-300" /> }} />
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
            {t("creatorRevenueGuide.ads.title")}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t("creatorRevenueGuide.ads.subtitle")}</p>

          <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
            {AD_FORMATS.map((ad, i) => (
              <div key={ad.name} className={`p-4 flex items-start gap-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div className="shrink-0 w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-base">
                  {ad.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{ad.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t(`creatorRevenueGuide.ads.${ad.key}`)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/80 flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              <Trans i18nKey="creatorRevenueGuide.ads.note" components={{ b: <strong className="text-amber-300" /> }} />
            </p>
          </div>
        </section>

        {/* ④ 구독료 분배 계산 (강조) */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            <Crown className="w-6 h-6 text-purple-400" />
            {t("creatorRevenueGuide.subscription.title")}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t("creatorRevenueGuide.subscription.subtitle")}</p>

          <div className="bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border border-purple-500/20 rounded-2xl p-5 mb-4">
            <p className="text-xs text-purple-300 font-bold mb-2">{t("creatorRevenueGuide.subscription.formulaLabel")}</p>
            <code className="block text-sm text-white font-mono leading-relaxed bg-[#0a0a0a] p-3 rounded-lg whitespace-pre-wrap">
              {t("creatorRevenueGuide.subscription.formula1")}
              {"\n\n"}
              {t("creatorRevenueGuide.subscription.formula2")}
            </code>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-[#121212] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{t("creatorRevenueGuide.subscription.exampleLabel")}</p>
              <p className="text-sm text-white leading-relaxed">
                <Trans i18nKey="creatorRevenueGuide.subscription.exampleBody" components={{ b: <strong className="text-purple-300" />, br: <br /> }} />
              </p>
            </div>
            <div className="bg-[#121212] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{t("creatorRevenueGuide.subscription.cautionLabel")}</p>
              <p className="text-sm text-white leading-relaxed">
                <Trans i18nKey="creatorRevenueGuide.subscription.cautionBody" components={{ b: <strong className="text-amber-300" />, s: <strong />, br: <br /> }} />
              </p>
            </div>
          </div>
        </section>

        {/* ⑤ 정산 정책 */}
        <section>
          <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            {t("creatorRevenueGuide.settlement.title")}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{t("creatorRevenueGuide.settlement.subtitle")}</p>

          <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
            {SETTLEMENT_ROWS.map((rowKey, i) => (
              <div key={rowKey} className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div className="text-xs font-bold text-gray-400 sm:w-32 shrink-0">{t(`creatorRevenueGuide.settlement.${rowKey}Label`)}</div>
                <div className="text-sm text-gray-200">{t(`creatorRevenueGuide.settlement.${rowKey}Value`)}</div>
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
                <h3 className="text-base font-bold text-white mb-2">{t("creatorRevenueGuide.maximize.title")}</h3>
                <ul className="space-y-2 text-sm text-gray-300 leading-relaxed">
                  <li>• <Trans i18nKey="creatorRevenueGuide.maximize.tip1" components={{ b: <strong className="text-white" /> }} /></li>
                  <li>• <Trans i18nKey="creatorRevenueGuide.maximize.tip2" components={{ b: <strong className="text-white" /> }} /></li>
                  <li>• <Trans i18nKey="creatorRevenueGuide.maximize.tip3" components={{ b: <strong className="text-white" /> }} /></li>
                  <li>• <Trans i18nKey="creatorRevenueGuide.maximize.tip4" components={{ b: <strong className="text-white" /> }} /></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ⑦ 면책 */}
        <section className="text-center">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            {t("creatorRevenueGuide.disclaimer.body")}
            <br />
            <Trans i18nKey="creatorRevenueGuide.disclaimer.terms" components={{ link: <a href="?info=terms" className="text-[#a78bfa] hover:underline" /> }} />
          </p>
        </section>

        {/* CTA */}
        <div className="flex justify-center pt-4">
          <Button
            onClick={onBack}
            className="bg-gradient-to-r from-[#a78bfa] to-[#ec4899] text-white font-bold px-8 h-12 rounded-xl"
          >
            {t("creatorRevenueGuide.cta")}
          </Button>
        </div>
      </div>
    </div>
  );
}
