// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 고객 1:1 문의함
//   support_inquiries 조회 + 사이트 내 답변(admin_reply_support_inquiry RPC,
//   답변 시 고객에게 알림) + 상태 관리.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { Loader2, Mail, RefreshCw, Inbox, Send, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface Inquiry {
  id: string;
  created_at: string;
  category: string;
  subject: string;
  message: string;
  email: string | null;
  status: "open" | "answered" | "closed";
  admin_reply: string | null;
  replied_at: string | null;
}

const CATEGORY: Record<string, string> = {
  payment: "결제/환불", account: "계정/로그인", subscription: "구독",
  video: "영상/콘텐츠", bug: "오류/버그", etc: "기타",
};
const STATUS: { key: Inquiry["status"]; label: string; cls: string }[] = [
  { key: "open", label: "접수됨", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  { key: "answered", label: "답변완료", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  { key: "closed", label: "종료", cls: "bg-white/10 text-gray-400 border-white/20" },
];
const statusMeta = (s: string) => STATUS.find((x) => x.key === s) || STATUS[0];

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdminSupportInquiries() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Inquiry["status"]>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_inquiries")
      .select("id, created_at, category, subject, message, email, status, admin_reply, replied_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) { toast.error("문의 조회 실패: " + error.message); }
    setItems((data || []) as Inquiry[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sendReply = async (id: string) => {
    const reply = (drafts[id] || "").trim();
    if (!reply) { toast.error("답변 내용을 입력해 주세요."); return; }
    setSending(id);
    const { error } = await supabase.rpc("admin_reply_support_inquiry", { p_id: id, p_reply: reply });
    setSending(null);
    if (error) { toast.error("답변 전송 실패: " + error.message); return; }
    toast.success("답변을 전송했습니다. 고객에게 알림이 갔어요.");
    setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    void load();
  };

  const setStatus = async (id: string, status: Inquiry["status"]) => {
    const prev = items;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status } : it)));
    const { error } = await supabase.from("support_inquiries").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error("상태 변경 실패: " + error.message); setItems(prev); }
  };

  const counts = STATUS.reduce((acc, s) => { acc[s.key] = items.filter((i) => i.status === s.key).length; return acc; }, {} as Record<string, number>);
  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="space-y-4">
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
          <p>{filter === "all" ? "아직 들어온 고객 문의가 없습니다." : "해당 상태의 문의가 없습니다."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => {
            const sm = statusMeta(it.status);
            return (
              <div key={it.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#8b5cf6]/15 text-[#c4b5fd] border border-[#8b5cf6]/30">{CATEGORY[it.category] || it.category}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${sm.cls}`}>{sm.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{fmt(it.created_at)}</span>
                </div>
                <p className="font-bold text-foreground">{it.subject}</p>
                {it.email && (
                  <a href={`mailto:${it.email}`} className="inline-flex items-center gap-1 mt-0.5 text-xs text-muted-foreground hover:text-[#6366f1]">
                    <Mail className="w-3.5 h-3.5" />{it.email}
                  </a>
                )}
                <p className="text-sm text-foreground/90 whitespace-pre-line mt-2 bg-background/50 rounded-lg border border-border/60 p-3">{it.message}</p>

                {/* 기존 답변 */}
                {it.admin_reply && (
                  <div className="mt-2 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-lg p-3">
                    <p className="text-[11px] font-bold text-[#a5b4fc] mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 보낸 답변 {it.replied_at && <span className="text-muted-foreground font-normal ml-1">· {fmt(it.replied_at)}</span>}</p>
                    <p className="text-sm text-foreground/90 whitespace-pre-line">{it.admin_reply}</p>
                  </div>
                )}

                {/* 답변 작성 (사이트 내 — 고객에게 알림) */}
                <div className="mt-3">
                  <textarea
                    value={drafts[it.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                    rows={2}
                    placeholder={it.admin_reply ? "답변 수정/재전송…" : "사이트 내 답변을 작성하세요 (고객에게 알림이 갑니다)"}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#6366f1] resize-y"
                  />
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-xs text-muted-foreground mr-1">상태:</span>
                    {STATUS.map((s) => (
                      <button key={s.key} onClick={() => void setStatus(it.id, s.key)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${it.status === s.key ? s.cls : "bg-transparent text-muted-foreground border-border hover:bg-muted"}`}>
                        {s.label}
                      </button>
                    ))}
                    <button onClick={() => void sendReply(it.id)} disabled={sending === it.id}
                      className="ml-auto px-3 py-1.5 rounded-md text-xs font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white inline-flex items-center gap-1 disabled:opacity-60">
                      {sending === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      답변 전송
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
