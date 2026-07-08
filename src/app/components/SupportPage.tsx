// ════════════════════════════════════════════════════════════════════════════
// 고객센터 — 1:1 문의 (2026-06-11)
//   로그인 고객이 문의 작성 → "내 문의 내역"에서 상태·답변 확인.
//   운영자는 어드민에서 사이트 내 답변 → 고객에게 알림(?support=<id> 딥링크).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Loader2, Send, MessageSquareText, CheckCircle2, Clock, Inbox, LogIn } from "lucide-react";
import { motion } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Footer } from "./Footer";

interface SupportInquiry {
  id: string;
  created_at: string;
  category: string;
  subject: string;
  message: string;
  status: "open" | "answered" | "closed";
  admin_reply: string | null;
  replied_at: string | null;
}

const CATEGORY_KEYS = ["payment", "account", "subscription", "video", "bug", "etc"];
const catLabelKey = (k: string) => `supportPage.category.${CATEGORY_KEYS.includes(k) ? k : "etc"}`;

const STATUS: Record<SupportInquiry["status"], { cls: string; icon: typeof Clock }> = {
  open: { cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: Clock },
  answered: { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  closed: { cls: "bg-white/10 text-gray-400 border-white/20", icon: CheckCircle2 },
};

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
  onSignInClick?: () => void;
  initialInquiryId?: string | null;   // 알림 딥링크(?support=) → 해당 문의로 스크롤·강조
}

export function SupportPage({ onBack, onNavigate, onSignInClick, initialInquiryId }: Props) {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  const [category, setCategory] = useState("payment");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<SupportInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const highlightRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("support_inquiries")
      .select("id, created_at, category, subject, message, status, admin_reply, replied_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.warn("[Support] 조회 실패:", error.message);
    setItems((data || []) as SupportInquiry[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  // 딥링크: 답변 알림 클릭 → 해당 문의로 스크롤 + 강조
  useEffect(() => {
    if (!initialInquiryId || loading) return;
    const timer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [initialInquiryId, loading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) { onSignInClick?.(); return; }
    const s = subject.trim(), m = message.trim();
    if (!s || !m) { toast.error(t("supportPage.errFillAll")); return; }
    setSubmitting(true);
    const { error } = await supabase.from("support_inquiries").insert({
      user_id: user.id,
      email: (user as any)?.email ?? null,
      category, subject: s, message: m,
      source_url: typeof window !== "undefined" ? window.location.href : null,
    });
    setSubmitting(false);
    if (error) { toast.error(t("supportPage.submitFailed", { message: error.message })); return; }
    toast.success(t("supportPage.submitSuccess"));
    setSubject(""); setMessage(""); setCategory("payment");
    void load();
  };

  // ── 비로그인 ──
  if (!user?.id) {
    return (
      <div className="h-full overflow-y-auto bg-[#0a0a0a]">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-20">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/15 text-sm font-semibold text-white shadow-sm transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> {t("common.back")}
          </button>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2 flex items-center gap-2">
            <MessageSquareText className="w-8 h-8 text-[#6366f1]" /> {t("footer.support1on1")}
          </h1>
          <div className="mt-8 bg-card border border-dashed border-border rounded-2xl p-10 text-center">
            <LogIn className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground/80 mb-1">{t("supportPage.signInTitle")}</p>
            <p className="text-xs text-muted-foreground mb-5">{t("supportPage.signInDesc")}</p>
            <button onClick={onSignInClick} className="px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white">
              {t("supportPage.signInButton")}
            </button>
            <p className="text-xs text-muted-foreground mt-6">
              {t("supportPage.emailHelpBefore")}<a href="mailto:support@creaite.net" className="text-[#a78bfa] hover:underline">support@creaite.net</a>{t("supportPage.emailHelpAfter")}
            </p>
          </div>
        </div>
        <Footer onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-20">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/15 text-sm font-semibold text-white shadow-sm transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> {t("common.back")}
        </button>
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2 flex items-center gap-2">
          <MessageSquareText className="w-8 h-8 text-[#6366f1]" /> {t("footer.support1on1")}
        </h1>
        <p className="text-gray-400 text-sm mb-8">{t("supportPage.desc")}</p>

        {/* 문의 폼 */}
        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-5 space-y-4 mb-10">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-2">{t("supportPage.categoryLabel")}</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_KEYS.map((k) => (
                <button key={k} type="button" onClick={() => setCategory(k)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                    category === k ? "bg-[#6366f1] text-white border-transparent" : "bg-background text-muted-foreground border-border hover:border-[#6366f1]/50"
                  }`}>
                  {t(`supportPage.category.${k}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-2">{t("supportPage.subjectLabel")}</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100}
              placeholder={t("supportPage.subjectPlaceholder")}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#6366f1]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-2">{t("supportPage.messageLabel")}</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5}
              placeholder={t("supportPage.messagePlaceholder")}
              className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#6366f1] resize-y" />
          </div>
          <button type="submit" disabled={submitting}
            className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white flex items-center justify-center gap-2 disabled:opacity-60">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? t("supportPage.submitting") : t("supportPage.submit")}
          </button>
        </form>

        {/* 내 문의 내역 */}
        <h2 className="text-lg font-bold text-white mb-3">{t("supportPage.myInquiries")}</h2>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" /></div>
        ) : items.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
            <Inbox className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t("supportPage.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const sm = STATUS[it.status];
              const SI = sm.icon;
              const highlighted = initialInquiryId === it.id;
              return (
                <div key={it.id} ref={highlighted ? highlightRef : undefined}
                  className={`bg-card rounded-xl border p-4 transition-colors ${highlighted ? "border-[#6366f1] ring-2 ring-[#6366f1]/40" : "border-border"}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#8b5cf6]/15 text-[#c4b5fd] border border-[#8b5cf6]/30">{t(catLabelKey(it.category))}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border inline-flex items-center gap-1 ${sm.cls}`}><SI className="w-3 h-3" />{t(`supportPage.status.${it.status}`)}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{fmt(it.created_at)}</span>
                  </div>
                  <p className="font-bold text-foreground">{it.subject}</p>
                  <p className="text-sm text-foreground/80 whitespace-pre-line mt-1">{it.message}</p>
                  {it.admin_reply && (
                    <div className="mt-3 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-lg p-3">
                      <p className="text-[11px] font-bold text-[#a5b4fc] mb-1 flex items-center gap-1">
                        <MessageSquareText className="w-3.5 h-3.5" /> {t("supportPage.adminReply")} {it.replied_at && <span className="text-muted-foreground font-normal ml-1">· {fmt(it.replied_at)}</span>}
                      </p>
                      <p className="text-sm text-foreground/90 whitespace-pre-line">{it.admin_reply}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}
