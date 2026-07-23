// ════════════════════════════════════════════════════════════════════════════
// 🤝 B2B 배급사 제휴 게시판 — 커뮤니티 4번째 탭
//
//   배급사·사업자가 "우리 회사는 이렇고, 이런 영화·광고·프로모션·제휴를 원한다"를
//   공개 게시하고 서로 발견하는 공개 게시판. 로그인 사용자 자유 게시.
//   보안은 서버(b2b_partnership_board_20260723.sql): RLS·컬럼잠금·정지차단·신고.
//   Community.tsx 비대화 방지를 위해 별도 컴포넌트로 분리(협업 탭과 동형 UI).
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { motion } from "motion/react";
import {
  Handshake, Plus, Loader2, Building2, ExternalLink, MapPin, Trash2, X,
  Megaphone, Film, Layers, Wrench, Package, Flag,
} from "lucide-react";
import { ReportModal } from "./ReportModal";

// 제휴 종류 6종(서버 CHECK 와 1:1). 아이콘·색은 표시용.
const CATEGORIES = ["content_partnership", "advertising", "co_production", "distribution", "tech", "other"] as const;
type Category = (typeof CATEGORIES)[number];
const CATEGORY_META: Record<Category, { key: string; cls: string; Icon: any }> = {
  content_partnership: { key: "b2b.catContent",      cls: "bg-[#8b5cf6]/20 text-[#a78bfa] border-[#8b5cf6]/40", Icon: Film },
  advertising:         { key: "b2b.catAdvertising",  cls: "bg-amber-500/20 text-amber-300 border-amber-500/40",  Icon: Megaphone },
  co_production:       { key: "b2b.catCoProduction", cls: "bg-[#10b981]/20 text-[#34d399] border-[#10b981]/40",  Icon: Handshake },
  distribution:        { key: "b2b.catDistribution", cls: "bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/40",  Icon: Package },
  tech:                { key: "b2b.catTech",         cls: "bg-rose-500/20 text-rose-300 border-rose-500/40",    Icon: Wrench },
  other:               { key: "b2b.catOther",        cls: "bg-white/10 text-gray-300 border-white/20",          Icon: Layers },
};

interface B2BPost {
  id: string;
  user_id: string;
  company_name: string;
  category: Category;
  title: string;
  description: string;
  link_url: string | null;
  region: string | null;
  status: "open" | "closed";
  created_at: string;
  is_mine: boolean;
}

interface B2BBoardProps {
  onSignInClick?: () => void;
}

export function B2BBoard({ onSignInClick }: B2BBoardProps) {
  const { t, i18n } = useTranslation();
  const isKo = (i18n.language || "ko").startsWith("ko");
  const { user, isAuthenticated } = useAuth();

  const [posts, setPosts] = useState<B2BPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [showModal, setShowModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<B2BPost | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_b2b_posts", { p_category: null, p_limit: 50, p_offset: 0 });
    if (error) {
      console.warn("[B2BBoard] get_b2b_posts 실패:", error.message);
      setPosts([]);
    } else {
      setPosts((data as B2BPost[]) || []);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => posts.filter((p) => filter === "all" || p.category === filter),
    [posts, filter],
  );

  const handleDelete = async (post: B2BPost) => {
    if (!confirm(t("b2b.deleteConfirm"))) return;
    const { error } = await supabase.from("b2b_posts").delete().eq("id", post.id);
    if (error) return toast.error(t("b2b.deleteFailed", { message: error.message }));
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    toast.success(t("b2b.deleteSuccess"));
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(isKo ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-5 pb-6 md:pb-8">
      {/* 히어로 */}
      <div className="relative overflow-hidden rounded-2xl border border-[#6366f1]/30 bg-gradient-to-br from-[#101433] via-[#1a1b3a] to-[#0d0d14] p-5 md:p-7">
        <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-[#6366f1]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-[#8b5cf6]/10 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/10 border border-white/20 text-[#c4b5fd] backdrop-blur-sm">
            <Building2 className="w-3.5 h-3.5 text-[#818cf8]" />
            {t("b2b.badge")}
          </span>
          <h2 className="mt-3 text-xl md:text-3xl font-black text-white leading-tight">{t("b2b.heroTitle")}</h2>
          <p className="mt-1.5 text-sm text-gray-300/80 max-w-xl">{t("b2b.heroDesc")}</p>
          <Button
            onClick={() => {
              if (!isAuthenticated) { toast.error(t("b2b.writeRequiresLogin")); onSignInClick?.(); return; }
              setShowModal(true);
            }}
            className="mt-4 gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            {t("b2b.postButton")}
          </Button>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-2">
        {([{ id: "all" as const, label: t("community.filterAll") },
          ...CATEGORIES.map((c) => ({ id: c, label: t(CATEGORY_META[c].key) }))]).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                active ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white border-transparent"
                       : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
          <Building2 className="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground/80">{t("b2b.empty")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("b2b.emptyHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => {
            const meta = CATEGORY_META[p.category] || CATEGORY_META.other;
            const Icon = meta.Icon;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative bg-[#121212] rounded-2xl border border-white/5 p-5 hover:border-[#6366f1]/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${meta.cls}`}>
                      <Icon className="w-3 h-3" />
                      {t(meta.key)}
                    </span>
                    {p.status === "closed" && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-gray-400 border border-white/10">
                        {t("b2b.statusClosed")}
                      </span>
                    )}
                  </div>
                  {/* 내 글: 삭제 / 남의 글: 신고 */}
                  {p.is_mine ? (
                    <button onClick={() => void handleDelete(p)} title={t("b2b.delete")}
                      className="p-1.5 rounded hover:bg-red-500/15 text-gray-500 hover:text-red-400 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={() => { if (!isAuthenticated) { onSignInClick?.(); return; } setReportTarget(p); }}
                      title={t("b2b.report")}
                      className="p-1.5 rounded hover:bg-white/10 text-gray-600 hover:text-gray-300 flex-shrink-0 opacity-0 group-hover:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 transition-opacity">
                      <Flag className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <h3 className="font-bold text-white leading-snug mb-1 line-clamp-2">{p.title}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-semibold text-[#a78bfa]">
                    <Building2 className="w-3.5 h-3.5" />{p.company_name}
                  </span>
                  {p.region && (
                    <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{p.region}</span>
                  )}
                  <span>· {fmtDate(p.created_at)}</span>
                </div>
                <p className="text-sm text-gray-300/90 whitespace-pre-wrap line-clamp-4">{p.description}</p>

                {p.link_url && (
                  // 서버 CHECK 로 http/https 만 저장되므로 javascript: 스킴 불가.
                  <a href={p.link_url} target="_blank" rel="noopener noreferrer nofollow"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#818cf8] hover:text-white transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t("b2b.visitSite")}
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {showModal && (
        <B2BCreateModal
          onClose={() => setShowModal(false)}
          onCreated={(row) => { setPosts((prev) => [row, ...prev]); setShowModal(false); }}
        />
      )}
      {reportTarget && (
        <ReportModal
          open={!!reportTarget}
          targetType="b2b_post"
          targetId={reportTarget.id}
          targetTitle={reportTarget.title}
          onClose={() => setReportTarget(null)}
          onSignInClick={onSignInClick}
        />
      )}
    </div>
  );
}

// ── 작성 모달 ────────────────────────────────────────────────────────────────
function B2BCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (row: B2BPost) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [form, setForm] = useState({
    company_name: "", category: "content_partnership" as Category,
    title: "", description: "", link_url: "", region: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const company = form.company_name.trim();
    const title = form.title.trim();
    const desc = form.description.trim();
    const link = form.link_url.trim();
    if (company.length < 2) return toast.error(t("b2b.errCompany"));
    if (title.length < 2) return toast.error(t("b2b.errTitle"));
    if (desc.length < 10) return toast.error(t("b2b.errDesc"));
    if (link && !/^https?:\/\//i.test(link)) return toast.error(t("b2b.errLink"));

    setSaving(true);
    const { data, error } = await supabase.from("b2b_posts").insert({
      user_id: user!.id,
      company_name: company,
      category: form.category,
      title,
      description: desc,
      link_url: link || null,
      region: form.region.trim() || null,
    }).select("id, user_id, company_name, category, title, description, link_url, region, status, created_at").single();
    setSaving(false);

    if (error) return toast.error(t("b2b.postFailed", { message: error.message }));
    onCreated({ ...(data as any), is_mine: true } as B2BPost);
    toast.success(t("b2b.postSuccess"));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#141414] rounded-2xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-[#141414] z-10">
          <h3 className="font-bold text-white flex items-center gap-2"><Building2 className="w-5 h-5 text-[#818cf8]" />{t("b2b.modalTitle")}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">{t("b2b.fieldCompany")} *</label>
            <input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              maxLength={100} placeholder={t("b2b.phCompany")} className="input-base w-full" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">{t("b2b.fieldCategory")} *</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, category: c }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    form.category === c ? "bg-[#6366f1] text-white border-transparent"
                                        : "bg-white/5 text-gray-400 border-white/10 hover:border-[#6366f1]/50"}`}>
                  {t(CATEGORY_META[c].key)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">{t("b2b.fieldTitle")} *</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200} placeholder={t("b2b.phTitle")} className="input-base w-full" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">{t("b2b.fieldDesc")} *</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={5000} rows={5} placeholder={t("b2b.phDesc")} className="input-base w-full resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-400 mb-1.5 block">{t("b2b.fieldRegion")}</label>
              <input value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                maxLength={60} placeholder={t("b2b.phRegion")} className="input-base w-full" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 mb-1.5 block">{t("b2b.fieldLink")}</label>
              <input value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                placeholder="https://" className="input-base w-full" />
            </div>
          </div>
          <p className="text-[11px] text-gray-500">{t("b2b.contactNote")}</p>
        </div>
        <div className="px-5 py-4 border-t border-white/10 flex gap-2 sticky bottom-0 bg-[#141414]">
          <Button variant="outline" onClick={onClose} className="flex-1">{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving}
            className="flex-1 gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("b2b.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
