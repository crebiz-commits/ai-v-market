// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 고객 1:1 문의함
//   support_inquiries 조회 + 사이트 내 답변(admin_reply_support_inquiry RPC,
//   답변 시 고객에게 알림) + 상태 관리.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { Loader2, Mail, RefreshCw, Inbox, Send, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { sendNotification, buildSupportReplyEmail } from "../utils/sendNotification";
import { useAdminPagedList } from "../hooks/useAdminPagedList";
import { AdminPager } from "./AdminPager";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface Inquiry {
  id: string;
  created_at: string;
  user_id: string;   // 답변 이메일·인앱 알림 수신자
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
// 훅에 넘기는 배열은 모듈 상수여야 함 — 매 렌더 새 배열이면 useCallback 의존성이 매번 바뀌어 재조회 루프
const STATUS_KEYS = ["open", "answered", "closed"] as const;
const SELECT_COLS = "id, created_at, user_id, category, subject, message, email, status, admin_reply, replied_at";

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdminSupportInquiries() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  // 상태 필터·배지 카운트는 서버 집계, 목록은 페이지 단위 — 300건 하드캡 제거(데이터 유실 해소)
  const {
    items, setItems, loading, filter, setFilter,
    page, pageSize, setPageSize, total, totalAll, counts, hasMore, loadError,
    goToPage, reload, afterStatusChange,
  } = useAdminPagedList<Inquiry, Inquiry["status"]>({
    table: "support_inquiries",
    select: SELECT_COLS,
    statuses: STATUS_KEYS,
    errorLabel: "문의",
  });

  const sendReply = async (it: Inquiry) => {
    const reply = (drafts[it.id] || "").trim();
    if (!reply) { toast.error("답변 내용을 입력해 주세요."); return; }
    setSending(it.id);
    // ① RPC: 답변 저장 + status=answered + 인앱 알림 + admin_logs (신뢰 경로)
    const { error } = await supabase.rpc("admin_reply_support_inquiry", { p_id: it.id, p_reply: reply });
    if (error) { setSending(null); toast.error("답변 전송 실패: " + error.message); return; }
    // ② 이메일 발송 — 인앱만으론 사이트 미방문 고객이 답변을 못 봄. Edge 가 support_reply 는
    //    인앱 스킵(RPC가 이미 넣음)하고 이메일만 발송(fire-and-forget, 실패해도 답변은 저장됨).
    const { subject, html } = buildSupportReplyEmail({ subject: it.subject, reply, inquiryId: it.id });
    void sendNotification({ user_id: it.user_id, type: "support_reply", subject, html, link: `/?support=${it.id}` });
    setSending(null);
    toast.success("답변을 전송했습니다. 고객에게 알림·이메일이 갔어요.");
    setDrafts((d) => { const n = { ...d }; delete n[it.id]; return n; });
    reload();   // 답변 시 status=answered → 현재 페이지·배지 카운트 갱신
  };

  const setStatus = async (id: string, status: Inquiry["status"]) => {
    const prevItem = items.find((it) => it.id === id);
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status } : it)));
    // 직접 UPDATE → RPC(admin_logs 기록). 미적용 환경(PGRST202) 폴백 없이 에러 표면화.
    const { error } = await supabase.rpc("admin_set_support_status", { p_id: id, p_status: status });
    if (error) {
      toast.error("상태 변경 실패: " + error.message);
      // 실패한 항목만 원복 — 전체 스냅샷을 되돌리면 그 사이 성공한 다른 항목의 갱신·답변까지 지워진다
      if (prevItem) setItems((cur) => cur.map((it) => (it.id === id ? prevItem : it)));
      return;
    }
    // 배지는 전체 기준 서버 집계라 낙관적 갱신으로 못 맞춤 → 서버에서 다시 셈
    void afterStatusChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === "all" ? "bg-[#6366f1] text-white border-transparent" : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}>
          전체 {totalAll}
        </button>
        {STATUS.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === s.key ? "bg-[#6366f1] text-white border-transparent" : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}>
            {s.label} {counts[s.key] || 0}
          </button>
        ))}
        <button onClick={reload} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" title="새로고침">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loadError ? (
        /* 조회 실패를 "아직 없습니다"로 표시하면 데이터가 멀쩡한데 없다고 단언하게 된다 */
        <div className="text-center py-20 text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-400/60" />
          <p className="text-amber-300/90">문의를 불러오지 못했습니다.</p>
          <Button variant="outline" size="sm" onClick={reload} className="mt-3">다시 시도</Button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filter === "all" ? "아직 들어온 고객 문의가 없습니다." : "해당 상태의 문의가 없습니다."}</p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {items.map((it) => {
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
                    <button onClick={() => void sendReply(it)} disabled={sending === it.id}
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
        </>
      )}
      {/* 페이저는 목록 분기 밖 — 안에 두면 로딩 중 통째로 언마운트돼 클릭 지점이 사라진다 */}
      {!loadError && (total > 0 || page > 0) && (
        <AdminPager
          page={page} pageSize={pageSize} hasMore={hasMore} loading={loading} total={total}
          onPageChange={goToPage} onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
