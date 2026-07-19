// ════════════════════════════════════════════════════════════════════════════
// 멤버십(구독) 전용 페이지 (2026-06-11)
//   넷플릭스·티빙·디즈니+ 처럼 "원하는 멤버십을 선택하세요" 전용 화면.
//   요금제는 단일(프리미엄) — Free vs Premium 비교로 제시.
//   ★가격은 하드코딩하지 않고 platform_settings.subscription_price_krw(=실제 청구가)를 표시한다.
//   결제는 usePayment().startSubscription (토스) 재사용.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { ArrowLeft, Crown, Check, Loader2, Sparkles, ShieldCheck, CreditCard } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { usePayment } from "../hooks/usePayment";
import { supabase } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Footer } from "./Footer";
import { isAppWrapper, openWebSubscribe } from "../utils/appWrapper";

interface Props {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
  onSignInClick?: () => void;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function SubscriptionPage({ onBack, onNavigate, onSignInClick }: Props) {
  const { t } = useTranslation();
  const { isAuthenticated, user, profile } = useAuth();
  const { startAutoBilling } = usePayment();
  const [paying, setPaying] = useState(false);
  const [agreed, setAgreed] = useState(false);   // 자동결제 동의 (전자상거래법)
  const [billing, setBilling] = useState<{ card_company: string | null; card_last4: string | null; auto_renew: boolean; status: string; next_charge_at: string | null } | null>(null);
  // 구독가 — ★표시=청구 보장: 실제 청구에 쓰는 platform_settings.subscription_price_krw 를 그대로 표시.
  //   (하드코딩하면 관리자가 얼리버드를 종료해 설정을 올려도 화면은 옛 가격 → 표시≠청구 = 전자상거래법 리스크)
  //   폴백 2900 은 usePayment.startSubscription 과 동일. 정상가는 비교 표시용 상수.
  const REGULAR_PRICE_KRW = 4900;
  const [priceKrw, setPriceKrw] = useState<number>(2900);

  const expires = (profile as any)?.subscription_expires_at as string | undefined;
  // P9/m-2: 만료 반영 — tier 만 보지 말고 만료일(미래)까지 확인(NULL=만료로 취급).
  const isPremium = profile?.subscription_tier === "premium"
    && !!expires && new Date(expires).getTime() > Date.now();
  const hasAutoBilling = !!billing && billing.status === "active" && billing.auto_renew;

  useEffect(() => {
    if (!isAuthenticated) return;
    supabase.rpc("get_my_billing").then(
      ({ data }) => { if (Array.isArray(data) && data[0]) setBilling(data[0] as any); },
      () => {},
    );
  }, [isAuthenticated]);

  // 실제 청구가 로드(비로그인도 표시해야 하므로 인증 무관). 실패 시 폴백 유지.
  useEffect(() => {
    supabase.rpc("get_platform_setting", { p_key: "subscription_price_krw" }).then(
      ({ data }) => { const n = Number(data); if (n > 0) setPriceKrw(n); },
      () => {},
    );
  }, []);

  // 얼리버드 = 현재 청구가가 정상가 미만일 때만. 설정을 정상가로 올리면 할인 UI 가 자동으로 사라진다.
  const isEarlyBird = priceKrw < REGULAR_PRICE_KRW;
  const discountPct = isEarlyBird ? Math.round((1 - priceKrw / REGULAR_PRICE_KRW) * 100) : 0;
  const priceLabel = priceKrw.toLocaleString();

  const subscribe = async () => {
    if (!isAuthenticated) { onSignInClick?.(); return; }
    if (!user?.id) return;

    // 리더앱: 네이티브 앱 안에서는 IAP 수수료 회피를 위해 웹 결제로 유도
    if (isAppWrapper()) {
      toast.info(t("subscriptionModal.subscribeOnWeb"));
      openWebSubscribe();
      return;
    }

    setPaying(true);
    try {
      await startAutoBilling({ customerKey: user.id, email: user?.email });
      // 토스 카드 등록 페이지로 이동 — 이후 코드 실행 안 됨
    } catch (err: any) {
      if (err?.code === "PAYMENTS_DISABLED") { /* B-2: 안내 토스트는 usePayment 에서 표시됨 */ }
      else if (err?.code === "USER_CANCEL") toast.info(t("subscriptionPage.canceled"));
      else toast.error(t("subscriptionPage.errorWithMessage", { message: err?.message || "" }));
      setPaying(false);
    }
  };

  const setAutoRenew = async (on: boolean) => {
    if (on === false && !confirm(t("subscriptionPage.confirmCancelAutoRenew"))) return;
    const { error } = await supabase.rpc("set_my_auto_renew", { p_on: on });
    if (error) { toast.error(error.message); return; }
    toast.success(on ? t("subscriptionPage.autoRenewResumed") : t("subscriptionPage.autoRenewCanceled"));
    setBilling((b) => (b ? { ...b, auto_renew: on } : b));
  };

  const freeFeatures = [
    t("subscriptionPage.freeFeature1"),
    t("subscriptionPage.freeFeature2"),
    t("subscriptionPage.freeFeature3"),
    t("subscriptionPage.freeFeature4"),
  ];
  const premiumFeatures = [
    t("subscriptionPage.premiumFeature1"),
    t("subscriptionPage.premiumFeature2"),
    t("subscriptionPage.premiumFeature3"),
    t("subscriptionPage.premiumFeature4"),
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-20">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/15 text-sm font-semibold text-white shadow-sm transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> {t("common.back")}
        </button>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-xs font-bold text-amber-200">{t("subscriptionPage.badge")}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
            {t("subscriptionPage.title")}
          </h1>
          <p className="text-gray-400 text-sm md:text-base">
            {t("subscriptionPage.subtitle")}
          </p>
        </motion.div>

        {/* 현재 상태 + 자동결제 관리 */}
        {isAuthenticated && isPremium && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                <span className="font-bold text-emerald-300">{t("subscriptionPage.premiumActive")}</span>
                {expires && <span className="text-gray-400 ml-2">{hasAutoBilling ? t("subscriptionPage.nextChargeDate", { date: fmtDate(expires) }) : t("subscriptionPage.expiresDate", { date: fmtDate(expires) })}</span>}
              </div>
            </div>
            {billing && billing.card_last4 && (
              <div className="flex items-center justify-between pl-8 flex-wrap gap-2">
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> {billing.card_company || t("subscriptionPage.card")} ···· {billing.card_last4}
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${billing.auto_renew ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-gray-400"}`}>
                    {billing.auto_renew ? t("subscriptionPage.autoRenewOn") : t("subscriptionPage.autoRenewOff")}
                  </span>
                </span>
                {billing.auto_renew
                  ? <button onClick={() => setAutoRenew(false)} className="text-xs font-semibold text-red-400 hover:underline">{t("subscriptionPage.cancelAutoRenew")}</button>
                  : <button onClick={() => setAutoRenew(true)} className="text-xs font-semibold text-emerald-400 hover:underline">{t("subscriptionPage.resumeAutoRenew")}</button>}
              </div>
            )}
          </div>
        )}

        {/* 플랜 카드 2개 */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          {/* FREE */}
          <div className={`relative rounded-2xl border p-6 bg-gradient-to-b from-[#17171d] to-[#0d0d12] ${!isPremium ? "border-[#6366f1]/40" : "border-white/10"}`}>
            <p className="text-sm font-bold text-gray-300 mb-1">{t("subscriptionPage.freePlanName")}</p>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="text-3xl font-black text-white">₩0</span>
            </div>
            <ul className="space-y-2.5 mb-6">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                  <Check className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" /> {f}
                </li>
              ))}
            </ul>
            <button disabled
              className="w-full py-3 rounded-xl font-bold text-sm bg-white/5 border border-white/10 text-gray-400 cursor-default">
              {!isAuthenticated || !isPremium ? t("subscriptionPage.currentPlan") : t("subscriptionPage.freePlan")}
            </button>
          </div>

          {/* PREMIUM */}
          <div className="relative rounded-2xl border-2 border-amber-500/60 p-6 bg-gradient-to-b from-[#241c10] to-[#0d0d12] shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-400 to-orange-500 text-black">
              {t("subscriptionPage.recommended")}
            </span>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-5 h-5 text-amber-400" />
              <p className="text-sm font-black text-amber-300 uppercase tracking-wider">Premium</p>
            </div>
            {/* 가격 = 실제 청구가(subscription_price_krw). 얼리버드(정상가 미만)일 때만 할인 UI 노출 */}
            {isEarlyBird && (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-red-500 to-amber-500 text-white text-[11px] font-black mb-2.5">
                {t("subscriptionPage.earlyBirdBadge", { percent: discountPct })}
              </div>
            )}
            <div className={`flex items-baseline gap-2 ${isEarlyBird ? "mb-1.5" : "mb-5"}`}>
              {isEarlyBird && <span className="text-lg text-gray-500 line-through">₩{REGULAR_PRICE_KRW.toLocaleString()}</span>}
              <span className="text-4xl font-black text-white">₩{priceLabel}</span>
              <span className="text-sm text-gray-400 font-medium">{t("subscriptionModal.perMonth")}</span>
            </div>
            {isEarlyBird && (
              <p className="flex items-center gap-1 text-[11px] font-bold text-amber-300 mb-5">
                ⏰ {t("subscriptionPage.earlyBirdEnding", { regular: REGULAR_PRICE_KRW.toLocaleString() })}
              </p>
            )}
            <ul className="space-y-2.5 mb-6">
              {premiumFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-200">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-amber-400" />
                  </div>
                  {f}
                </li>
              ))}
            </ul>
            {!isPremium && (
              <label className="flex items-start gap-2 mb-3 cursor-pointer text-left">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500 shrink-0" />
                <span className="text-[11px] text-gray-400 leading-snug">
                  {t("subscriptionPage.agreeRecurring")}
                </span>
              </label>
            )}
            <button onClick={subscribe} disabled={paying || isPremium || (!isPremium && !agreed)}
              className="w-full py-3 rounded-xl font-black text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-60">
              {paying ? <><Loader2 className="w-5 h-5 animate-spin" />{t("subscriptionPage.registeringCard")}</>
                : isPremium ? <>{t("subscriptionPage.active")}</>
                : !isAuthenticated ? <><Crown className="w-5 h-5" />{t("subscriptionModal.signInToSubscribe")}</>
                : isAppWrapper() ? <><Crown className="w-5 h-5" />{t("subscriptionModal.subscribeOnWebCTA")}</>
                : <><Crown className="w-5 h-5" />{t("subscriptionPage.subscribeCTA")}</>}
            </button>
            <p className="text-[11px] text-gray-500 text-center mt-3">
              {t("subscriptionPage.footNote", { price: priceLabel })}
            </p>
          </div>
        </div>

        {/* 안내 (자동결제 법적 고지 — 전자상거래법) */}
        <div className="mt-8 text-xs text-gray-500 leading-relaxed space-y-1.5">
          <p>· {t("subscriptionPage.notice1", { price: priceLabel })}</p>
          <p>· {t("subscriptionPage.notice2")}</p>
          <p>· {t("subscriptionPage.notice3")}</p>
          <p>· {t("subscriptionPage.notice4")}</p>
        </div>
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}
