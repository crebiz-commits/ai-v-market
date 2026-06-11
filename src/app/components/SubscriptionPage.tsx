// ════════════════════════════════════════════════════════════════════════════
// 멤버십(구독) 전용 페이지 (2026-06-11)
//   넷플릭스·티빙·디즈니+ 처럼 "원하는 멤버십을 선택하세요" 전용 화면.
//   현재 요금제는 단일(프리미엄 ₩4,900) — Free vs Premium 비교로 제시.
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
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const { isAuthenticated, user, profile } = useAuth();
  const { startAutoBilling } = usePayment();
  const [paying, setPaying] = useState(false);
  const [agreed, setAgreed] = useState(false);   // 자동결제 동의 (전자상거래법)
  const [billing, setBilling] = useState<{ card_company: string | null; card_last4: string | null; auto_renew: boolean; status: string; next_charge_at: string | null } | null>(null);

  const isPremium = profile?.subscription_tier === "premium";
  const expires = (profile as any)?.subscription_expires_at as string | undefined;
  const hasAutoBilling = !!billing && billing.status === "active" && billing.auto_renew;

  useEffect(() => {
    if (!isAuthenticated) return;
    supabase.rpc("get_my_billing").then(
      ({ data }) => { if (Array.isArray(data) && data[0]) setBilling(data[0] as any); },
      () => {},
    );
  }, [isAuthenticated]);

  const subscribe = async () => {
    if (!isAuthenticated) { onSignInClick?.(); return; }
    if (!user?.id) return;
    setPaying(true);
    try {
      await startAutoBilling({ customerKey: user.id, email: user?.email });
      // 토스 카드 등록 페이지로 이동 — 이후 코드 실행 안 됨
    } catch (err: any) {
      if (err?.code === "USER_CANCEL") toast.info(isKo ? "취소했어요." : "Canceled.");
      else toast.error((isKo ? "오류: " : "Error: ") + (err?.message || ""));
      setPaying(false);
    }
  };

  const setAutoRenew = async (on: boolean) => {
    if (on === false && !confirm(isKo ? "자동결제를 해지할까요? 현재 구독은 만료일까지 유지됩니다." : "Cancel auto-pay? Subscription stays until expiry.")) return;
    const { error } = await supabase.rpc("set_my_auto_renew", { p_on: on });
    if (error) { toast.error(error.message); return; }
    toast.success(on ? (isKo ? "자동결제를 재개했어요." : "Resumed.") : (isKo ? "자동결제를 해지했어요. 만료일까지 이용 가능합니다." : "Canceled."));
    setBilling((b) => (b ? { ...b, auto_renew: on } : b));
  };

  const freeFeatures = isKo
    ? ["무료 공개 영상 무제한 시청", "모든 영상 1분 미리보기", "라이선스 개별 구매 가능", "광고 포함"]
    : ["Unlimited free videos", "1-min preview of everything", "Buy licenses individually", "Includes ads"];
  const premiumFeatures = isKo
    ? ["시네마·OTT 모든 영상 무제한 시청", "광고 완전 제거", "고화질(HD) 스트리밍", "매월 자동 갱신 · 언제든 해지"]
    : ["Unlimited cinema & OTT", "Ad-free experience", "HD streaming", "Auto-renews monthly · cancel anytime"];

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-20">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> {isKo ? "뒤로" : "Back"}
        </button>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-xs font-bold text-amber-200">CREAITE 멤버십</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
            {isKo ? "원하는 멤버십을 선택하세요" : "Choose your membership"}
          </h1>
          <p className="text-gray-400 text-sm md:text-base">
            {isKo ? "매월 자동 갱신 · 언제든 해지 가능" : "Auto-renews monthly · cancel anytime."}
          </p>
        </motion.div>

        {/* 현재 상태 + 자동결제 관리 */}
        {isAuthenticated && isPremium && (
          <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                <span className="font-bold text-emerald-300">{isKo ? "프리미엄 이용 중" : "Premium active"}</span>
                {expires && <span className="text-gray-400 ml-2">{(isKo ? (hasAutoBilling ? "다음 결제일 " : "만료일 ") : (hasAutoBilling ? "Next charge " : "Expires ")) + fmtDate(expires)}</span>}
              </div>
            </div>
            {billing && billing.card_last4 && (
              <div className="flex items-center justify-between pl-8 flex-wrap gap-2">
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> {billing.card_company || (isKo ? "카드" : "Card")} ···· {billing.card_last4}
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${billing.auto_renew ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-gray-400"}`}>
                    {billing.auto_renew ? (isKo ? "자동결제 ON" : "Auto ON") : (isKo ? "자동결제 OFF" : "Auto OFF")}
                  </span>
                </span>
                {billing.auto_renew
                  ? <button onClick={() => setAutoRenew(false)} className="text-xs font-semibold text-red-400 hover:underline">{isKo ? "자동결제 해지" : "Cancel auto-pay"}</button>
                  : <button onClick={() => setAutoRenew(true)} className="text-xs font-semibold text-emerald-400 hover:underline">{isKo ? "자동결제 재개" : "Resume"}</button>}
              </div>
            )}
          </div>
        )}

        {/* 플랜 카드 2개 */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          {/* FREE */}
          <div className={`relative rounded-2xl border p-6 bg-gradient-to-b from-[#17171d] to-[#0d0d12] ${!isPremium ? "border-[#6366f1]/40" : "border-white/10"}`}>
            <p className="text-sm font-bold text-gray-300 mb-1">{isKo ? "무료" : "Free"}</p>
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
              {!isAuthenticated || !isPremium ? (isKo ? "현재 이용 중" : "Current plan") : (isKo ? "무료 플랜" : "Free plan")}
            </button>
          </div>

          {/* PREMIUM */}
          <div className="relative rounded-2xl border-2 border-amber-500/60 p-6 bg-gradient-to-b from-[#241c10] to-[#0d0d12] shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-400 to-orange-500 text-black">
              {isKo ? "추천" : "Recommended"}
            </span>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-5 h-5 text-amber-400" />
              <p className="text-sm font-black text-amber-300 uppercase tracking-wider">Premium</p>
            </div>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="text-4xl font-black text-white">₩4,900</span>
              <span className="text-sm text-gray-400 font-medium">{isKo ? "/ 월" : "/ mo"}</span>
            </div>
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
                  {isKo ? "매월 ₩4,900 자동결제(정기결제) 및 환불 정책에 동의합니다. 언제든 해지할 수 있습니다." : "I agree to ₩4,900/mo recurring billing & refund policy. Cancel anytime."}
                </span>
              </label>
            )}
            <button onClick={subscribe} disabled={paying || isPremium || (!isPremium && !agreed)}
              className="w-full py-3 rounded-xl font-black text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-60">
              {paying ? <><Loader2 className="w-5 h-5 animate-spin" />{isKo ? "카드 등록 중…" : "Opening…"}</>
                : isPremium ? <>{isKo ? "이용 중" : "Active"}</>
                : !isAuthenticated ? <><Crown className="w-5 h-5" />{isKo ? "로그인 후 구독하기" : "Sign in to subscribe"}</>
                : <><Crown className="w-5 h-5" />{isKo ? "프리미엄 구독하기" : "Subscribe to Premium"}</>}
            </button>
            <p className="text-[11px] text-gray-500 text-center mt-3">
              {isKo ? "매월 ₩4,900 자동 결제 · 언제든 해지 가능" : "₩4,900/mo auto-billed · cancel anytime"}
            </p>
          </div>
        </div>

        {/* 안내 (자동결제 법적 고지 — 전자상거래법) */}
        <div className="mt-8 text-xs text-gray-500 leading-relaxed space-y-1.5">
          <p>· {isKo ? "프리미엄은 매월 ₩4,900이 등록한 카드로 자동 결제(정기결제)됩니다. 「구독하기」를 누르면 자동결제에 동의하는 것으로 간주됩니다." : "Premium auto-bills ₩4,900/mo to your card. Subscribing means you agree to recurring billing."}</p>
          <p>· {isKo ? "자동결제는 이 페이지 또는 마이페이지에서 언제든 해지할 수 있으며, 해지 시 다음 결제일부터 청구되지 않습니다 (이미 결제한 기간은 만료일까지 이용 가능)." : "Cancel anytime here or in My Page; no further charges after cancellation (current period stays active)."}</p>
          <p>· {isKo ? "프리미엄 구독 시 시네마·OTT 전체 영상을 광고 없이 무제한 시청할 수 있습니다." : "Premium unlocks all cinema & OTT, ad-free."}</p>
          <p>· {isKo ? "결제·환불 관련 문의는 고객센터(1:1 문의) 또는 support@creaite.net 으로 연락 주세요." : "For billing questions, contact support@creaite.net."}</p>
        </div>
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}
