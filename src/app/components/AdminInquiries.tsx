// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 비즈니스 문의함
// business_inquiries 조회/상태관리 (RLS: is_admin() — SELECT/UPDATE)
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { Loader2, Mail, Phone, Building2, RefreshCw, Inbox } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface Inquiry {
  id: string;
  created_at: string;
  category: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  message: string;
  status: "new" | "reviewing" | "replied" | "closed";
  reviewed_at: string | null;
}

const CATEGORY: Record<string, string> = {
  advertising: "광고",
  investment: "투자/IR",
  partnership: "제휴",
  b2b_license: "B2B 라이선스",
  other: "기타",
};

const STATUS: { key: Inquiry["status"]; label: string; cls: string }[] = [
  { key: "new", label: "신규", cls: "bg-[#6366f1]/20 text-[#a5b4fc] border-[#6366f1]/40" },
  { key: "reviewing", label: "검토중", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  { key: "replied", label: "답변완료", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  { key: "closed", label: "종료", cls: "bg-white/10 text-gray-400 border-white/20" },
];
const statusMeta = (s: string) => STATUS.find((x) => x.key === s) || STATUS[0];

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdminInquiries() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Inquiry["status"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("business_inquiries")
      .select("id, created_at, category, company_name, contact_name, email, phone, message, status, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn("[AdminInquiries] 조회 실패:", error.message);
      toast.error("문의 조회 실패: " + error.message);
    }
    setItems((data || []) as Inquiry[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: Inquiry["status"]) => {
    const prev = items;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status, reviewed_at: new Date().toISOString() } : it)));
    const { error } = await supabase
      .from("business_inquiries")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.warn("[AdminInquiries] 상태 변경 실패:", error.message);
      toast.error("상태 변경 실패: " + error.message);
      setItems(prev);
    }
  };

  // Zoho 무료 플랜은 mailto 기본핸들러 설정이 막혀 있어, Zoho 작성창을 직접 열고
  // 받는사람 이메일을 클립보드에 복사 → 작성창에 붙여넣기만 하면 되도록 함.
  const replyViaZoho = async (toEmail: string) => {
    try { await navigator.clipboard.writeText(toEmail); } catch {}
    window.open("https://mail.zoho.com/zm/#compose", "_blank", "noopener");
    toast.success(`받는사람 이메일(${toEmail})을 복사했어요. Zoho 작성창 '받는사람'에 붙여넣으세요.`, { duration: 5000 });
  };

  const counts = STATUS.reduce((acc, s) => { acc[s.key] = items.filter((i) => i.status === s.key).length; return acc; }, {} as Record<string, number>);
  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="space-y-4">
      {/* 필터 + 새로고침 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === "all" ? "bg-[#6366f1] text-white border-transparent" : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}>
          전체 {items.length}
        </button>
        {STATUS.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === s.key ? "bg-[#6366f1] text-white border-transparent" : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}>
            {s.label} {counts[s.key] || 0}
          </button>
        ))}
        <button onClick={() => void load()} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" title="새로고침">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filter === "all" ? "아직 들어온 비즈니스 문의가 없습니다." : "해당 상태의 문의가 없습니다."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => {
            const sm = statusMeta(it.status);
            return (
              <div key={it.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#8b5cf6]/15 text-[#c4b5fd] border border-[#8b5cf6]/30">
                    {CATEGORY[it.category] || it.category}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${sm.cls}`}>{sm.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{fmt(it.created_at)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="w-4 h-4 text-[#6366f1] flex-shrink-0" />
                  <span className="font-bold text-foreground">{it.company_name}</span>
                  <span className="text-muted-foreground">· {it.contact_name}</span>
                </div>

                <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
                  <a href={`mailto:${it.email}`} className="flex items-center gap-1 hover:text-[#6366f1] transition-colors">
                    <Mail className="w-3.5 h-3.5" />{it.email}
                  </a>
                  {it.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{it.phone}</span>}
                </div>

                <p className="text-sm text-foreground/90 whitespace-pre-line mt-3 bg-background/50 rounded-lg border border-border/60 p-3">
                  {it.message}
                </p>

                {/* 상태 변경 */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">상태:</span>
                  {STATUS.map((s) => (
                    <button key={s.key} onClick={() => void setStatus(it.id, s.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${it.status === s.key ? s.cls : "bg-transparent text-muted-foreground border-border hover:bg-muted"}`}>
                      {s.label}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <a href={`mailto:${it.email}?subject=${encodeURIComponent("[CREAITE] " + (CATEGORY[it.category] || "") + " 문의 답변")}`}
                      className="px-3 py-1 rounded-md text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                      title="기본 메일 앱으로 답변">
                      기본 메일
                    </a>
                    <button onClick={() => void replyViaZoho(it.email)}
                      className="px-3 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white">
                      Zoho로 답변
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
