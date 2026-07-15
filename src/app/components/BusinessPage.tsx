import { useState, useEffect, useRef } from "react";
import { Briefcase, TrendingUp, Handshake, Layers, Send, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { Footer } from "./Footer";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// 봇/스팸 방어(선택) — Cloudflare Turnstile 사이트키가 설정된 경우에만 위젯 렌더·토큰 요구.
//   미설정 환경은 Edge 의 IP rate-limit 로만 보호(캡차는 키 설정 시 자동 활성).
const TURNSTILE_SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;

type Category = "advertising" | "investment" | "partnership" | "b2b_license";

interface BusinessPageProps {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}

const CATEGORIES: Array<{
  id: Category;
  icon: any;
  color: string;
}> = [
  { id: "advertising",  icon: Briefcase,  color: "from-amber-500 to-orange-500" },
  { id: "investment",   icon: TrendingUp, color: "from-emerald-500 to-teal-500" },
  { id: "partnership",  icon: Handshake,  color: "from-[#6366f1] to-[#8b5cf6]" },
  { id: "b2b_license",  icon: Layers,     color: "from-rose-500 to-pink-500" },
];

// 분류별 맞춤 입력칸 — 입력값은 message 앞에 구조화해서 합쳐 저장(스키마 변경 없음)
interface ExtraField {
  id: string;
  labelKey: string;
  options?: string[];   // i18n 키 배열. 있으면 select, 없으면 text
  phKey?: string;
}
const EXTRA_FIELDS: Record<Category, ExtraField[]> = {
  advertising: [
    { id: "budget", labelKey: "business.extra.advertising.budgetLabel", options: [
      "business.extra.advertising.budgetUnder5m", "business.extra.advertising.budget5to20m",
      "business.extra.advertising.budget20to50m", "business.extra.advertising.budget50mPlus", "business.extra.advertising.budgetTbd" ] },
    { id: "period", labelKey: "business.extra.advertising.periodLabel", phKey: "business.extra.advertising.periodPh" },
    { id: "format", labelKey: "business.extra.advertising.formatLabel", phKey: "business.extra.advertising.formatPh" },
  ],
  investment: [
    { id: "stage", labelKey: "business.extra.investment.stageLabel", options: [
      "business.extra.investment.stageSeed", "business.extra.investment.stagePreA", "business.extra.investment.stageA",
      "business.extra.investment.stageBPlus", "business.extra.investment.stageOther" ] },
    { id: "amount", labelKey: "business.extra.investment.amountLabel", phKey: "business.extra.investment.amountPh" },
    { id: "investorType", labelKey: "business.extra.investment.investorLabel", options: [
      "business.extra.investment.investorVc", "business.extra.investment.investorAngel", "business.extra.investment.investorPe",
      "business.extra.investment.investorCvc", "business.extra.investment.investorIndividual", "business.extra.investment.investorOther" ] },
  ],
  partnership: [
    { id: "ptype", labelKey: "business.extra.partnership.typeLabel", options: [
      "business.extra.partnership.typeContent", "business.extra.partnership.typeChannel",
      "business.extra.partnership.typeCoProduction", "business.extra.partnership.typeTech", "business.extra.partnership.typeOther" ] },
    { id: "scope", labelKey: "business.extra.partnership.scopeLabel", phKey: "business.extra.partnership.scopePh" },
  ],
  b2b_license: [
    { id: "scale", labelKey: "business.extra.b2b.scaleLabel", phKey: "business.extra.b2b.scalePh" },
    { id: "usage", labelKey: "business.extra.b2b.usageLabel", phKey: "business.extra.b2b.usagePh" },
  ],
};

export function BusinessPage({ onBack, onNavigate }: BusinessPageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // 진입 시 카테고리 사전선택(?bizcat=). 푸터의 광고/IR/파트너십/라이선스 링크가 해당 폼으로 바로 진입.
  const [category, setCategory] = useState<Category>(() => {
    if (typeof window === "undefined") return "advertising";
    const p = new URLSearchParams(window.location.search).get("bizcat");
    return (CATEGORIES.some((c) => c.id === p) ? p : "advertising") as Category;
  });
  // 초기 선택 반영 후 bizcat 흔적 제거 — 홈 이동 후 재진입 시 옛 카테고리로 잘못 열리는 것 방지.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("bizcat")) {
      params.delete("bizcat");
      const qs = params.toString();
      window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }, []);

  // Turnstile 캡차(사이트키 설정 시) — 스크립트 로드 + 위젯 explicit 렌더
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const renderWidget = () => {
      const ts = (window as any).turnstile;
      if (ts && turnstileRef.current && widgetIdRef.current === null) {
        try { widgetIdRef.current = ts.render(turnstileRef.current, { sitekey: TURNSTILE_SITE_KEY }); } catch { /* 이미 렌더됨 */ }
      }
    };
    if ((window as any).turnstile) { renderWidget(); return; }
    const SCRIPT_ID = "cf-turnstile-script";
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true; script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", renderWidget);
    return () => { script?.removeEventListener("load", renderWidget); };
  }, []);

  const [extra, setExtra] = useState<Record<string, string>>({});
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim() || !email.trim() || !message.trim()) {
      toast.error(t("business.requiredFields"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("business.invalidEmail"));
      return;
    }
    // 캡차 토큰(사이트키 설정 시 필수) — 1회용
    let turnstileToken = "";
    if (TURNSTILE_SITE_KEY) {
      turnstileToken = (window as any).turnstile?.getResponse?.(widgetIdRef.current ?? undefined) || "";
      if (!turnstileToken) { toast.error(t("business.captchaRequired")); return; }
    }
    setSubmitting(true);
    try {
      // 분류별 추가 입력값을 내용 앞에 구조화해서 합침
      const extraLines = EXTRA_FIELDS[category]
        .filter((f) => (extra[f.id] || "").trim())
        .map((f) => `· ${t(f.labelKey)}: ${(extra[f.id] || "").trim()}`);
      const composedMessage = extraLines.length
        ? `[${t(`business.cat.${category}.title`)}]\n${extraLines.join("\n")}\n\n${message.trim()}`
        : message.trim();
      // 직접 INSERT 대신 Edge 경유 — 서버측 rate-limit·캡차검증·필드검증
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/submit-business-inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: publicAnonKey, Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({
          category,
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          message: composedMessage,
          source_url: window.location.href,
          submitted_by: user?.id || null,
          turnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || t("business.submitFailed"));
      setSubmitted(true);
      toast.success(t("business.submitSuccess"));
    } catch (err: any) {
      toast.error(err?.message || t("business.submitFailed"));
      if (TURNSTILE_SITE_KEY) { try { (window as any).turnstile?.reset?.(widgetIdRef.current ?? undefined); } catch { /* noop */ } }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="h-full overflow-y-auto bg-[#0a0a0a] flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-black text-white mb-3">{t("business.submitSuccess")}</h2>
          <p className="text-sm text-gray-400 leading-relaxed mb-8">
            {t("business.replyWithin")}<br />
            <span className="text-white font-bold">{email}</span>
          </p>
          <Button
            onClick={onBack}
            variant="outline"
            className="bg-white/5 border-white/10 hover:bg-white/10 text-white font-medium gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("creatorChannel.back")}
          </Button>
        </motion.div>
        </div>
        <Footer onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] pb-20">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/15 text-sm font-semibold text-white shadow-sm transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("creatorChannel.back")}
        </button>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{t("business.title")}</h1>
          <p className="text-gray-400 text-sm md:text-base leading-relaxed">
            {t("business.subtitle")}
          </p>
        </motion.div>

        {/* 카테고리 선택 */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`relative p-4 rounded-2xl border text-left transition-all ${
                  active
                    ? "bg-white/10 border-white/30 shadow-lg"
                    : "bg-[#121212] border-white/5 hover:border-white/15 hover:bg-white/[0.04]"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center mb-2 shadow-md`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-black text-white mb-0.5">{t(`business.cat.${cat.id}.title`)}</h3>
                <p className="text-[11px] text-gray-400 leading-snug">{t(`business.cat.${cat.id}.desc`)}</p>
              </button>
            );
          })}
        </div>

        {/* 문의 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4 bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5">
          <Field label={t("business.companyLabel")} required>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={100}
              required
              placeholder={t("business.companyPlaceholder")}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t("business.nameLabel")} required>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={50}
                required
                placeholder={t("business.namePlaceholder")}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </Field>

            <Field label={t("business.phoneLabel")}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                placeholder={t("business.phonePlaceholder")}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </Field>
          </div>

          <Field label={t("business.emailLabel")} required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="contact@company.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
            />
          </Field>

          {/* 분류별 맞춤 입력칸 */}
          {EXTRA_FIELDS[category].length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {EXTRA_FIELDS[category].map((f) => (
                <Field key={f.id} label={t(f.labelKey)}>
                  {f.options ? (
                    <select
                      value={extra[f.id] || ""}
                      onChange={(e) => setExtra((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors appearance-none"
                    >
                      <option value="" className="bg-[#1a1a1c]">{t("upload.selectOption")}</option>
                      {f.options.map((o) => {
                        const label = t(o);
                        return (
                          <option key={o} value={label} className="bg-[#1a1a1c]">{label}</option>
                        );
                      })}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={extra[f.id] || ""}
                      onChange={(e) => setExtra((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      maxLength={120}
                      placeholder={f.phKey ? t(f.phKey) : ""}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
                    />
                  )}
                </Field>
              ))}
            </div>
          )}

          <Field label={t("business.messageLabel")} required>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={6}
              required
              placeholder={t("business.messagePlaceholder")}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors resize-none"
            />
            <p className="text-[11px] text-gray-500 text-right mt-1">{message.length}/2000</p>
          </Field>

          {/* 캡차(사이트키 설정 시) */}
          {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="flex justify-center" />}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white font-black text-base shadow-lg rounded-xl"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {t("business.submitting")}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {t("business.submit")}
              </>
            )}
          </Button>

          <p className="text-[11px] text-gray-500 text-center leading-relaxed">
            {t("business.privacyNoteLine1")}<br />
            {t("business.privacyNoteLine2")}
          </p>
        </form>
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1.5">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}
