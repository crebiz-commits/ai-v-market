// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 버그 제보 관리 ("버그를 잡아라" 이벤트)
// bug_reports 조회/상태관리 (RLS: is_admin SELECT/UPDATE/DELETE)
// 상태: new(신규) → reviewing(검토중) → valid(채택)/invalid(반려) → coupon_sent(쿠폰지급)
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { Loader2, Bug, RefreshCw, Mail, Trash2, Coffee, StickyNote } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAdminPagedList } from "../hooks/useAdminPagedList";
import { AdminPager } from "./AdminPager";
import { Button } from "./ui/button";
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
// 훅에 넘기는 배열은 모듈 상수여야 함 — 매 렌더 새 배열이면 useCallback 의존성이 매번 바뀌어 재조회 루프
const STATUS_KEYS = ["new", "reviewing", "valid", "invalid", "coupon_sent"] as const;

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
  // 원본 열기 — 클릭 시점에 새 서명 URL 발급(마운트 시 1회 발급분은 1시간 뒤 만료라
  //   페이지를 오래 열어두면 링크가 죽던 것 방지, 2026-07-14)
  const openFresh = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data } = await supabase.storage
      .from("bug-screenshots")
      .createSignedUrl(toStoragePath(stored), 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else toast.error("스크린샷 링크 발급 실패");
  };
  if (!url) return <div className="w-20 h-20 rounded-lg border border-border bg-white/5 animate-pulse" />;
  return (
    <a href={url} onClick={openFresh} target="_blank" rel="noopener noreferrer"
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
  // 상태 필터·배지 카운트는 서버 집계, 목록은 페이지 단위 — 300건 하드캡 제거(데이터 유실 해소)
  const {
    items, setItems, loading, filter, setFilter,
    page, pageSize, setPageSize, total, totalAll, counts, hasMore, loadError,
    goToPage, reload, afterStatusChange,
  } = useAdminPagedList<BugReport, BugReport["status"]>({
    table: "bug_reports",
    select: "*",
    statuses: STATUS_KEYS,
    errorLabel: "버그 제보",
  });

  const setStatus = async (id: string, status: BugReport["status"]): Promise<boolean> => {
    const prevItem = items.find((it) => it.id === id);
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status, reviewed_at: new Date().toISOString() } : it)));
    // 직접 UPDATE 대신 RPC — admin_logs 감사기록(쿠폰지급=금전 액션 추적, reviewed_by)
    const { error } = await supabase.rpc("admin_set_bug_status", { p_id: id, p_status: status });
    if (error) {
      toast.error("상태 변경 실패: " + error.message);
      // 실패한 항목만 원복 — 다른 항목의 동시 변경을 스냅샷 복원으로 덮어쓰지 않게
      if (prevItem) setItems((cur) => cur.map((it) => (it.id === id ? prevItem : it)));
      return false;
    }
    // 배지는 전체 기준 서버 집계라 낙관적 갱신으로 못 맞춤 → 서버에서 다시 셈
    void afterStatusChange();
    return true;
  };

  const remove = async (id: string) => {
    if (!confirm("이 버그 제보를 삭제할까요? (첨부 스크린샷도 함께 삭제)")) return;
    const target = items.find((it) => it.id === id);
    setItems((cur) => cur.filter((it) => it.id !== id));
    // 직접 DELETE 대신 RPC — admin_logs 감사기록. 스토리지 파일은 아래서 정리.
    const { error } = await supabase.rpc("admin_delete_bug_report", { p_id: id });
    if (error) {
      toast.error("삭제 실패: " + error.message);
      // 실패 시 해당 항목만 원위치 복원(created_at 정렬 유지)
      if (target) setItems((cur) => [...cur, target].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      return;
    }
    // 스토리지 정리 — DB 행만 지우면 개인정보가 담길 수 있는 스크린샷이 비공개 버킷에
    //   영구 잔존(2026-07-14). 실패해도 제보 삭제는 유지(고아 파일은 무해, 재시도 가능).
    const paths = (target?.image_urls || []).map(toStoragePath).filter(Boolean);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from("bug-screenshots").remove(paths);
      if (rmErr) console.warn("[AdminBugReports] 스크린샷 스토리지 정리 실패:", rmErr.message);
    }
    // 삭제로 한 칸 빈 현재 페이지를 다음 항목으로 채우고 배지도 갱신(페이지 단위 조회라 필수)
    reload();
  };

  // 쿠폰 발송: Zoho 작성창 열고 연락처 복사 + '쿠폰지급' 상태 자동 기록.
  //   기존엔 발송 후 별도로 '쿠폰지급' 버튼을 눌러야 기록돼 누락/중복지급 위험이 있었음.
  //   이제 '보내기' 한 번으로 기록까지 끝내고, 미발송 시 토스트의 '실행취소'로 되돌린다.
  const sendCoupon = async (it: BugReport) => {
    const to = it.reporter_contact || "";
    const isEmail = to.includes("@");
    const prevStatus = it.status;
    const isResend = prevStatus === "coupon_sent";
    // 이미 지급된 건이면 작성창 열기·복사 전에 확인(중복지급 유도 방지)
    if (isResend && !confirm("이미 '쿠폰지급'으로 기록된 제보입니다. 그래도 다시 보낼까요?")) return;

    try { await navigator.clipboard.writeText(to); } catch {}
    if (isEmail) window.open("https://mail.zoho.com/zm/#compose", "_blank", "noopener");

    const guide = isEmail
      ? `연락처(${to})를 복사했어요. Zoho 작성창에 붙여넣어 커피 쿠폰을 보내세요.`
      : `연락처(${to || "없음"})를 복사했어요. 카카오 등으로 쿠폰을 보내주세요.`;

    // 신규·재발송 모두 서버 기록(감사 — 매 지급마다 bug_coupon_sent 로그). coupon_sent 로 (재)설정.
    const ok = await setStatus(it.id, "coupon_sent");   // 실패 시 setStatus가 롤백+에러토스트
    if (!ok) return;
    if (isResend) {
      toast.success(`${guide} (재발송 기록됨)`, { duration: 5000 });
    } else {
      toast.success(`${guide} '쿠폰지급'으로 기록했어요.`, {
        duration: 6000,
        action: { label: "실행취소", onClick: () => { void setStatus(it.id, prevStatus); } },
      });
    }
  };

  // 내부 메모(admin_note) — 컬럼은 있었으나 편집 UI가 없어 팀 공유가 불가했음.
  //   draft 로 편집분을 잡고, 저장 성공 시 items 반영 + draft 정리(저장값 기준 복귀).
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const noteValue = (it: BugReport) => noteDrafts[it.id] ?? it.admin_note ?? "";
  const noteDirty = (it: BugReport) => noteDrafts[it.id] !== undefined && noteDrafts[it.id] !== (it.admin_note ?? "");

  const saveNote = async (it: BugReport) => {
    const next = (noteDrafts[it.id] ?? "").trim() || null;
    setSavingNoteId(it.id);
    const { error } = await supabase.from("bug_reports").update({ admin_note: next }).eq("id", it.id);
    setSavingNoteId(null);
    if (error) { toast.error("메모 저장 실패: " + error.message); return; }
    setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, admin_note: next } : x)));
    setNoteDrafts((d) => { const c = { ...d }; delete c[it.id]; return c; });
    toast.success("메모를 저장했어요.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter("all")} aria-pressed={filter === "all"}
          className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === "all" ? "bg-[#6366f1] text-white border-transparent" : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}>
          전체 {totalAll}
        </button>
        {STATUS.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)} aria-pressed={filter === s.key}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === s.key ? "bg-[#6366f1] text-white border-transparent" : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}>
            {s.label} {counts[s.key] || 0}
          </button>
        ))}
        <button onClick={reload} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" title="새로고침" aria-label="새로고침">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loadError ? (
        /* 조회 실패를 "아직 없습니다"로 표시하면 데이터가 멀쩡한데 없다고 단언하게 된다 */
        <div className="text-center py-20 text-muted-foreground">
          <Bug className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-400/60" />
          <p className="text-amber-300/90">제보를 불러오지 못했습니다.</p>
          <Button variant="outline" size="sm" onClick={reload} className="mt-3">다시 시도</Button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Bug className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filter === "all" ? "아직 접수된 버그 제보가 없습니다." : "해당 상태의 제보가 없습니다."}</p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {items.map((it) => {
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
                    <button key={s.key} onClick={() => void setStatus(it.id, s.key)} aria-pressed={it.status === s.key}
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

                {/* 내부 메모 — 어드민 전용, 채택/중복/재현 여부 등 팀 공유 */}
                <div className="mt-3 border-t border-border/60 pt-3">
                  <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                    <StickyNote className="w-3.5 h-3.5" /> 내부 메모 (어드민 전용, 제보자에게 안 보임)
                  </label>
                  <textarea
                    value={noteValue(it)}
                    onChange={(e) => setNoteDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                    placeholder="검토 결과·재현 여부·중복 여부·지급 메모 등"
                    rows={2}
                    className="input-base w-full text-sm resize-y"
                  />
                  {noteDirty(it) && (
                    <div className="flex justify-end gap-2 mt-1.5">
                      <button onClick={() => setNoteDrafts((d) => { const c = { ...d }; delete c[it.id]; return c; })}
                        className="px-3 py-1 rounded-md text-xs font-semibold border border-border text-muted-foreground hover:bg-muted">
                        취소
                      </button>
                      <button onClick={() => void saveNote(it)} disabled={savingNoteId === it.id}
                        className="px-3 py-1 rounded-md text-xs font-bold bg-[#6366f1] text-white inline-flex items-center gap-1 disabled:opacity-60">
                        {savingNoteId === it.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "메모 저장"}
                      </button>
                    </div>
                  )}
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
