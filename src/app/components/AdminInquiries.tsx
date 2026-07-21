// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 비즈니스 문의함
// business_inquiries 조회/상태관리 (RLS: is_admin() — SELECT/UPDATE)
// ════════════════════════════════════════════════════════════════════════════
import { Loader2, Mail, Phone, Building2, RefreshCw, Inbox } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAdminPagedList } from "../hooks/useAdminPagedList";
import { AdminPager } from "./AdminPager";
import { Button } from "./ui/button";
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
// 훅에 넘기는 배열은 모듈 상수여야 함 — 매 렌더 새 배열이면 useCallback 의존성이 매번 바뀌어 재조회 루프
const STATUS_KEYS = ["new", "reviewing", "replied", "closed"] as const;
const SELECT_COLS = "id, created_at, category, company_name, contact_name, email, phone, message, status, reviewed_at";

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdminInquiries() {
  // 상태 필터·배지 카운트는 서버 집계, 목록은 페이지 단위 — 200건 하드캡 제거(데이터 유실 해소)
  const {
    items, setItems, loading, filter, setFilter,
    page, pageSize, setPageSize, total, totalAll, counts, hasMore, loadError,
    goToPage, reload, afterStatusChange,
  } = useAdminPagedList<Inquiry, Inquiry["status"]>({
    table: "business_inquiries",
    select: SELECT_COLS,
    statuses: STATUS_KEYS,
    errorLabel: "문의",
  });

  const setStatus = async (id: string, status: Inquiry["status"]) => {
    const prevItem = items.find((it) => it.id === id);
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status, reviewed_at: new Date().toISOString() } : it)));
    // 직접 UPDATE 대신 RPC — admin_logs 감사기록 경유(상태변경 추적)
    const { error } = await supabase.rpc("admin_set_inquiry_status", { p_id: id, p_status: status });
    if (error) {
      console.warn("[AdminInquiries] 상태 변경 실패:", error.message);
      toast.error("상태 변경 실패: " + error.message);
      // 실패한 항목만 원복 — 전체 스냅샷 복원은 동시에 성공한 다른 항목의 갱신을 덮어쓴다
      if (prevItem) setItems((cur) => cur.map((it) => (it.id === id ? prevItem : it)));
      return;
    }
    // 배지는 전체 기준 서버 집계라 낙관적 갱신으로 못 맞춤 → 서버에서 다시 셈
    void afterStatusChange();
  };

  // Zoho 무료 플랜은 mailto 기본핸들러 설정이 막혀 있어, Zoho 작성창을 직접 열고
  // 받는사람 이메일을 클립보드에 복사 → 작성창에 붙여넣기만 하면 되도록 함.
  const replyViaZoho = async (toEmail: string) => {
    try { await navigator.clipboard.writeText(toEmail); } catch {}
    window.open("https://mail.zoho.com/zm/#compose", "_blank", "noopener");
    toast.success(`받는사람 이메일(${toEmail})을 복사했어요. Zoho 작성창 '받는사람'에 붙여넣으세요.`, { duration: 5000 });
  };

  // 답변 버튼 클릭 = 처리 착수 → 신규 문의는 '검토중'으로 자동 전환(배지·상태 정합, 방치 방지)
  const markReviewingIfNew = (it: Inquiry) => {
    if (it.status === "new") void setStatus(it.id, "reviewing");
  };

  return (
    <div className="space-y-4">
      {/* 필터 + 새로고침 */}
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
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-400/60" />
          <p className="text-amber-300/90">문의를 불러오지 못했습니다.</p>
          <Button variant="outline" size="sm" onClick={reload} className="mt-3">다시 시도</Button>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filter === "all" ? "아직 들어온 비즈니스 문의가 없습니다." : "해당 상태의 문의가 없습니다."}</p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {items.map((it) => {
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
                    <button key={s.key} onClick={() => void setStatus(it.id, s.key)} aria-pressed={it.status === s.key}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${it.status === s.key ? s.cls : "bg-transparent text-muted-foreground border-border hover:bg-muted"}`}>
                      {s.label}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    <a href={`mailto:${it.email}?subject=${encodeURIComponent("[CREAITE] " + (CATEGORY[it.category] || "") + " 문의 답변")}`}
                      onClick={() => markReviewingIfNew(it)}
                      className="px-3 py-1 rounded-md text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                      title="기본 메일 앱으로 답변">
                      기본 메일
                    </a>
                    <button onClick={() => { markReviewingIfNew(it); void replyViaZoho(it.email); }}
                      className="px-3 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white">
                      Zoho로 답변
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
