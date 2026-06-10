import { useState } from "react";
import { Briefcase, TrendingUp, Handshake, Layers, Send, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { Footer } from "./Footer";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  ko: string; en: string;
  options?: { ko: string; en: string }[];   // 있으면 select, 없으면 text
  ph?: { ko: string; en: string };
}
const EXTRA_FIELDS: Record<Category, ExtraField[]> = {
  advertising: [
    { id: "budget", ko: "예산 규모", en: "Budget", options: [
      { ko: "~500만원", en: "Under ₩5M" }, { ko: "500만~2천만원", en: "₩5M–20M" },
      { ko: "2천만~5천만원", en: "₩20M–50M" }, { ko: "5천만원 이상", en: "₩50M+" }, { ko: "미정", en: "TBD" } ] },
    { id: "period", ko: "캠페인 기간", en: "Campaign period", ph: { ko: "예: 2개월 / 2026 Q3", en: "e.g. 2 months / 2026 Q3" } },
    { id: "format", ko: "희망 광고 형식", en: "Preferred format", ph: { ko: "예: 인비디오, 피드 카드, 브랜드 채널", en: "e.g. in-video, feed card, brand channel" } },
  ],
  investment: [
    { id: "stage", ko: "투자 단계", en: "Stage", options: [
      { ko: "Seed", en: "Seed" }, { ko: "Pre-A", en: "Pre-A" }, { ko: "Series A", en: "Series A" },
      { ko: "Series B 이상", en: "Series B+" }, { ko: "기타", en: "Other" } ] },
    { id: "amount", ko: "검토 규모", en: "Ticket size", ph: { ko: "예: 5억 / 협의", en: "e.g. $500K / TBD" } },
    { id: "investorType", ko: "투자 주체", en: "Investor type", options: [
      { ko: "VC", en: "VC" }, { ko: "엔젤", en: "Angel" }, { ko: "PE", en: "PE" },
      { ko: "전략적 투자자(CVC)", en: "Strategic (CVC)" }, { ko: "개인", en: "Individual" }, { ko: "기타", en: "Other" } ] },
  ],
  partnership: [
    { id: "ptype", ko: "제휴 형태", en: "Partnership type", options: [
      { ko: "콘텐츠 파트너", en: "Content partner" }, { ko: "채널 협력", en: "Channel collab" },
      { ko: "공동 기획", en: "Co-production" }, { ko: "기술 제휴", en: "Tech partnership" }, { ko: "기타", en: "Other" } ] },
    { id: "scope", ko: "제안 범위/규모", en: "Scope", ph: { ko: "예: 분기 단위 공동 캠페인", en: "e.g. quarterly joint campaign" } },
  ],
  b2b_license: [
    { id: "scale", ko: "사용 규모", en: "Usage scale", ph: { ko: "예: 영상 10편 / 1년", en: "e.g. 10 videos / 1 year" } },
    { id: "usage", ko: "사용 용도", en: "Use case", ph: { ko: "예: 사내 교육, 광고 소재, 앱 내 임베드", en: "e.g. internal training, ad creative, in-app embed" } },
  ],
};

export function BusinessPage({ onBack, onNavigate }: BusinessPageProps) {
  const { t, i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>("advertising");
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
      toast.error("Invalid email format.");
      return;
    }
    setSubmitting(true);
    try {
      // 분류별 추가 입력값을 내용 앞에 구조화해서 합침
      const extraLines = EXTRA_FIELDS[category]
        .filter((f) => (extra[f.id] || "").trim())
        .map((f) => `· ${isKo ? f.ko : f.en}: ${(extra[f.id] || "").trim()}`);
      const composedMessage = extraLines.length
        ? `[${t(`business.cat.${category}.title`)}]\n${extraLines.join("\n")}\n\n${message.trim()}`
        : message.trim();
      const { error } = await supabase.from("business_inquiries").insert({
        category,
        company_name: companyName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        message: composedMessage,
        source_url: window.location.href,
        user_agent: navigator.userAgent.substring(0, 200),
        submitted_by: user?.id || null,
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success(t("business.submitSuccess"));
    } catch (err: any) {
      toast.error(err?.message || t("business.submitFailed"));
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
            We'll reply within 2–3 business days to<br />
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
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
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
                <Field key={f.id} label={isKo ? f.ko : f.en}>
                  {f.options ? (
                    <select
                      value={extra[f.id] || ""}
                      onChange={(e) => setExtra((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors appearance-none"
                    >
                      <option value="" className="bg-[#1a1a1c]">{isKo ? "선택" : "Select"}</option>
                      {f.options.map((o) => (
                        <option key={o.en} value={isKo ? o.ko : o.en} className="bg-[#1a1a1c]">{isKo ? o.ko : o.en}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={extra[f.id] || ""}
                      onChange={(e) => setExtra((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      maxLength={120}
                      placeholder={f.ph ? (isKo ? f.ph.ko : f.ph.en) : ""}
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
            Your information is used only for responding to your inquiry<br />
            and will be deleted within 1 year after handling unless you consent to retention.
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
