// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 버그 제보 관리 ("버그를 잡아라" 이벤트)
// bug_reports 조회/상태관리 (RLS: is_admin SELECT/UPDATE/DELETE)
// 상태: new(신규) → reviewing(검토중) → valid(채택)/invalid(반려) → coupon_sent(쿠폰지급)
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { Loader2, Bug, RefreshCw, Mail, Trash2, Coffee } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface BugReport {
  id: string;
  user_id: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  title: string;
  description: string;
  steps: string | null;
  page_url: string | null;
  image_urls: string[] | null;
  status: "new" | "reviewing" | "valid" | "invalid" | "coupon_sent";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS: { key: BugReport["status"]; label: string; cls: string }[] = [
  { key: "new", label: "신규", cls: "bg-[#6366f1]/20 text-[#a5b4fc] border-[#6366f1]/40" },
  { key: "reviewing", label: "검토중", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  { key: "valid", label: "채택", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  { key: "invalid", label: "반려", cls: "bg-white/10 text-gray-400 border-white/20" },
  { key: "coupon_sent", label: "쿠폰지급", cls: "bg-pink-500/20 text-pink-300 border-pink-500/40" },
];
const statusMeta = (s: string) => STATUS.find((x) => x.key === s) || STATUS[0];

// bug-screenshots 는 비공개 버킷(2026-06-25) → 저장값(경로 또는 구 공개URL)에서 경로를 뽑아 서명 URL 로 표시.
function toStoragePath(stored: string): string {
  const marker = "/bug-screenshots/";
  const i = stored.indexOf(marker);
  return i >= 0 ? stored.slice(i + marker.length) : stored;
}

function BugShot({ stored, idx }: { stored: string; idx: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.storage
      .from("bug-screenshots")
      .createSignedUrl(toStoragePath(stored), 3600)
      .then(({ data }) => { if (alive && data?.signedUrl) setUrl(data.signedUrl); });
    return () => { alive = false; };
  }, [stored]);
  if (!url) return <div className="w-20 h-20 rounded-lg border border-border bg-white/5 animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="block w-20 h-20 rounded-lg overflow-hidden border border-border hover:border-[#6366f1]/60 transition-colors">
      <img src={url} alt={`첨부 ${idx + 1}`} className="w-full h-full object-cover" />
    </a>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdminBugReports() {
  const [items, setItems] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | BugReport["status"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bug_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      console.warn("[AdminBugReports] 조회 실패:", error.message);
      toast.error("버그 제보 조회 실패: " + error.message);
    }
    setItems((data || []) as BugReport[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: BugReport["status"]) => {
    const prev = items;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status, reviewed_at: new Date().toISOString() } : it)));
    const { error } = await supabase
      .from("bug_reports")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("상태 변경 실패: " + error.message);
      setItems(prev);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 버그 제보를 삭제할까요?")) return;
    const prev = items;
    setItems((cur) => cur.filter((it) => it.id !== id));
    const { error } = await supabase.from("bug_reports").delete().eq("id", id);
    if (error) { toast.error("삭제 실패: " + error.message); setItems(prev); }
  };

  // 쿠폰 발송: Zoho 작성창 열고 연락처 복사 (AdminInquiries 패턴)
  const sendCoupon = async (it: BugReport) => {
    const to = it.reporter_contact || "";
    if (to.includes("@")) {
      try { await navigator.clipboard.writeText(to); } catch {}
      window.open("https://mail.zoho.com/zm/#compose", "_blank", "noopener");
      toast.success(`연락처(${to})를 복사했어요. Zoho 작성창에 붙여넣어 커피 쿠폰을 보내세요.`, { duration: 5000 });
    } else {
      try { await navigator.clipboard.writeText(to); } catch {}
      toast.info(`연락처(${to || "없음"})를 복사했어요. 카카오 등으로 쿠폰을 보내주세요.`, { duration: 5000 });
    }
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
          <Bug className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filter === "all" ? "아직 접수된 버그 제보가 없습니다." : "해당 상태의 제보가 없습니다."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => {
            const sm = statusMeta(it.status);
            return (
              <div key={it.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${sm.cls}`}>{sm.label}</span>
                  <span className="font-bold text-foreground">{it.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{fmt(it.created_at)}</span>
                </div>

                <p className="text-sm text-foreground/90 whitespace-pre-line bg-background/50 rounded-lg border border-border/60 p-3">{it.description}</p>

                {/* 첨부 스크린샷 — 클릭 시 새 탭 원본 */}
                {it.image_urls && it.image_urls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {it.image_urls.map((url, i) => (
                      <BugShot key={url} stored={url} idx={i} />
                    ))}
                  </div>
                )}

                {it.steps && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/70">재현: </span>
                    <span className="whitespace-pre-line">{it.steps}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                  {it.page_url && <span>📍 {it.page_url}</span>}
                  <span>👤 {it.reporter_name || "익명"}</span>
                  {it.reporter_contact && (
                    <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{it.reporter_contact}</span>
                  )}
                </div>

                {/* 상태 변경 + 액션 */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">상태:</span>
                  {STATUS.map((s) => (
                    <button key={s.key} onClick={() => void setStatus(it.id, s.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${it.status === s.key ? s.cls : "bg-transparent text-muted-foreground border-border hover:bg-muted"}`}>
                      {s.label}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button onClick={() => void sendCoupon(it)}
                      className="px-3 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white inline-flex items-center gap-1">
                      <Coffee className="w-3.5 h-3.5" /> 쿠폰 보내기
                    </button>
                    <button onClick={() => void remove(it.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-400" title="삭제">
                      <Trash2 className="w-4 h-4" />
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
