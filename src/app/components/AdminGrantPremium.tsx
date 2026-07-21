// 관리자 — 프리미엄 수동 지급 (챌린지 우승 보상 등)
//   이메일 + 개월수 입력 → admin_grant_premium RPC 호출.
//   RPC 가 관리자 인증 + 구독 컬럼 업데이트(protect 트리거 우회는 SECURITY DEFINER 소유자=postgres) + 감사로그.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";
import { Crown, Loader2, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";

interface GrantResult {
  display_name: string | null;
  email: string;
  subscription_tier: string;
  subscription_expires_at: string;
}

// 프리미엄 현황 목록 (admin_list_premium_users RPC)
interface PremiumRow {
  user_id: string;
  email: string;
  display_name: string | null;
  subscription_tier: string;
  subscription_started_at: string | null;
  subscription_expires_at: string;
  days_left: number;          // KST 날짜 기준. 음수 = 만료 후 경과일
  is_active: boolean;
  manual_grants: number;      // 0 이면 결제 구독
  last_granted_at: string | null;
  total_count: number;        // 서버가 같은 필터로 센 전체 건수
}

type ListFilter = "active" | "expired" | "all";
const LIST_PAGE = 20;

export function AdminGrantPremium() {
  const [email, setEmail] = useState("");
  const [months, setMonths] = useState(6);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GrantResult | null>(null);

  // 이달의 크리에이터 임명 (뱃지 + 홈 히어로)
  const [crownEmail, setCrownEmail] = useState("");
  const [crownVideo, setCrownVideo] = useState("");
  const [crownBusy, setCrownBusy] = useState(false);
  const [crownDone, setCrownDone] = useState<{ video_title?: string | null } | null>(null);

  // ── 프리미엄 현황 목록 ──
  const [rows, setRows] = useState<PremiumRow[]>([]);
  const [listFilter, setListFilter] = useState<ListFilter>("active");
  const [listPage, setListPage] = useState(0);       // 0-indexed
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false); // 조회 실패 — "없음"과 구분(빈 화면 오인 방지)
  // 필터·페이지를 빠르게 바꾸면 이전 요청이 나중에 도착해 화면을 덮는다 → 최신 요청만 반영
  const reqSeq = useRef(0);

  const loadList = useCallback(async (filter: ListFilter, page: number) => {
    const seq = ++reqSeq.current;
    setListLoading(true);
    const { data, error } = await supabase.rpc("admin_list_premium_users", {
      p_filter: filter, p_limit: LIST_PAGE, p_offset: page * LIST_PAGE,
    });
    if (seq !== reqSeq.current) return;   // 낡은 응답 폐기
    if (error) {
      setRows([]); setListTotal(0); setListError(true); setListLoading(false);
      toast.error("현황 조회 실패: " + error.message);
      return;
    }
    const list = (data || []) as PremiumRow[];
    setRows(list);
    // 총건수는 서버가 같은 필터로 센 값을 쓴다(클라가 세면 페이지네이션에서 숫자가 틀어짐)
    setListTotal(list.length > 0 ? Number(list[0].total_count) : 0);
    setListError(false);
    setListLoading(false);
  }, []);

  useEffect(() => { void loadList(listFilter, listPage); }, [loadList, listFilter, listPage]);

  const lastPage = Math.max(0, Math.ceil(listTotal / LIST_PAGE) - 1);
  const fmtDay = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

  const extractVideoId = (s: string): string => {
    const t = s.trim();
    if (!t) return "";
    try { const q = new URL(t).searchParams.get("video"); if (q) return q; } catch { /* URL 아님 */ }
    const m = t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : "";   // 인식 실패 시 빈 문자열(원문 반환 금지 — 서버 uuid 캐스트 에러 방지)
  };

  const crown = async () => {
    const e = crownEmail.trim();
    if (!e) { toast.error("우승자 이메일을 입력하세요"); return; }
    const vid = extractVideoId(crownVideo);
    // 우승작을 입력했는데 인식 못하면 raw 문자열 대신 친절히 안내(히어로는 선택사항)
    if (crownVideo.trim() && !vid) {
      toast.error("영상 URL(...?video=ID) 또는 UUID를 인식하지 못했어요. 비워두면 히어로 없이 임명합니다.");
      return;
    }
    setCrownBusy(true); setCrownDone(null);
    try {
      const { data, error } = await supabase.rpc("admin_crown_creator", {
        p_email: e, p_video_id: vid || null, p_badge_months: 1, p_hero_days: 30,
      });
      if (error) throw error;
      setCrownDone((data as any) || {});
      toast.success("이달의 크리에이터 임명 완료 👑" + (vid ? " · 홈 히어로 고정" : ""));
    } catch (err: any) {
      toast.error(err?.message || "임명 실패");
    } finally { setCrownBusy(false); }
  };

  const grant = async () => {
    const e = email.trim();
    if (!e) { toast.error("이메일을 입력하세요"); return; }
    if (!months || months < 1 || months > 60) { toast.error("개월수는 1~60 사이여야 합니다"); return; }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc("admin_grant_premium", { p_email: e, p_months: months });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as GrantResult | undefined;
      if (!row) {
        toast.error("해당 이메일의 사용자를 찾을 수 없습니다");
        return;
      }
      setResult(row);
      toast.success(
        `${row.display_name || e} 프리미엄 지급 완료 (만료 ${new Date(row.subscription_expires_at).toLocaleDateString("ko-KR")})`,
      );
      // 방금 지급한 사람이 아래 현황에 바로 보이도록 첫 페이지로 리로드
      setListPage(0);
      void loadList(listFilter, 0);
    } catch (err: any) {
      toast.error(err?.message || "지급 실패");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "h-10 rounded-lg bg-card border border-border px-3 text-sm outline-none focus:border-[#6366f1]";

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-[#a78bfa] font-bold">
          <Crown className="w-5 h-5" /> 프리미엄 수동 지급
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">사용자 이메일</label>
          <input
            className={inputCls}
            type="email"
            placeholder="winner@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") grant(); }}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">지급 개월수</label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className={`${inputCls} w-24`}
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            />
            <div className="flex gap-1.5">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`px-3 h-10 rounded-lg text-sm font-semibold border transition-colors ${
                    months === m
                      ? "bg-[#6366f1]/15 border-[#6366f1] text-[#a5b4fc]"
                      : "bg-card border-border text-muted-foreground hover:border-white/30"
                  }`}
                >
                  {m}개월
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            현재 만료일이 미래면 거기서 +{months}개월, 만료/미구독이면 오늘부터 +{months}개월.
          </p>
        </div>

        <button
          onClick={grant}
          disabled={busy}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
          프리미엄 지급
        </button>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-bold text-emerald-300 mb-1">✓ 지급 완료</p>
          <p className="text-muted-foreground">
            {result.display_name || result.email} · <b className="text-white">{result.subscription_tier}</b>
          </p>
          <p className="text-muted-foreground">
            만료일: <b className="text-white">{new Date(result.subscription_expires_at).toLocaleString("ko-KR")}</b>
          </p>
        </div>
      )}

      {/* ── 이달의 크리에이터 임명 (뱃지 + 홈 히어로) ── */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-300 font-bold">👑 이달의 크리에이터 임명</div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          채널에 <b>“👑 이달의 크리에이터” 뱃지 1개월</b> + (우승작 지정 시) <b>OTT 홈 히어로 1개월 고정</b>.
        </p>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">우승자 이메일</label>
          <input className={inputCls} type="email" placeholder="winner@gmail.com" value={crownEmail}
            onChange={(e) => setCrownEmail(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">
            우승작 영상 ID 또는 URL <span className="text-white/30">(선택 — 홈 히어로 고정용)</span>
          </label>
          <input className={inputCls} placeholder="영상 상세 URL 붙여넣기 또는 영상 ID" value={crownVideo}
            onChange={(e) => setCrownVideo(e.target.value)} />
        </div>
        <button onClick={crown} disabled={crownBusy}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity">
          {crownBusy ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <span>👑</span>} 이달의 크리에이터 임명
        </button>
        {crownDone && (
          <p className="text-xs text-emerald-300">✓ 임명 완료{crownDone.video_title ? ` · 히어로 고정: ${crownDone.video_title}` : ""}</p>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground leading-relaxed">
        <p>· 챌린지 우승 보상 등 <b>수동 지급</b>용 (토스 결제와 무관).</p>
        <p>· 지급 즉시 해당 계정에 영상 광고 제거·프리미엄 기능 적용.</p>
        <p>· 모든 지급은 활동 로그(감사)에 기록됩니다.</p>
      </div>

      {/* ── 프리미엄 현황 ── 누구에게 줬는지·언제 끝나는지(2026-07-21 추가) ── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[#a78bfa] font-bold">
            <Crown className="w-5 h-5" /> 프리미엄 현황
            {!listLoading && !listError && (
              <span className="text-xs font-semibold text-muted-foreground">{listTotal}명</span>
            )}
          </div>
          <button
            onClick={() => void loadList(listFilter, listPage)}
            disabled={listLoading}
            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:border-white/30 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${listLoading ? "animate-spin" : ""}`} /> 새로고침
          </button>
        </div>

        {/* 필터 */}
        <div className="flex gap-1.5">
          {([["active", "구독 중"], ["expired", "만료됨"], ["all", "전체"]] as [ListFilter, string][]).map(
            ([key, label]) => (
              <button
                key={key}
                onClick={() => { setListFilter(key); setListPage(0); }}
                className={`px-3 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                  listFilter === key
                    ? "bg-[#6366f1]/15 border-[#6366f1] text-[#a5b4fc]"
                    : "bg-card border-border text-muted-foreground hover:border-white/30"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#8b5cf6]" />
          </div>
        ) : listError ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-amber-200/90">
              목록을 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.
              <br />
              <span className="text-amber-200/60">
                (SQL <code>admin_list_premium_users_20260721.sql</code> 적용이 필요할 수 있습니다)
              </span>
            </p>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {listFilter === "expired" ? "만료된 구독자가 없습니다." : "아직 프리미엄 구독자가 없습니다."}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.user_id}
                className="rounded-lg border border-border bg-background/40 px-3 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">
                      {r.display_name || r.email}
                    </span>
                    {r.manual_grants > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        수동 지급{r.manual_grants > 1 ? ` ×${r.manual_grants}` : ""}
                      </span>
                    ) : (
                      // 배지 판정 기준은 "이 화면에서 지급한 이력(admin_logs)이 있는가" 뿐이다.
                      // 토스 결제분과 DB 에서 직접 설정한 컴프(예: 관리자 영구 프리미엄)를
                      // 구분하지 못하므로 '결제'라고만 쓰면 오해를 준다(2026-07-21).
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/5 text-muted-foreground border border-border">
                        결제·직접설정
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    만료 {fmtDay(r.subscription_expires_at)}
                    {r.last_granted_at && ` · 마지막 지급 ${fmtDay(r.last_granted_at)}`}
                  </p>
                </div>
                {/* 남은 기간 — 7일 이하는 경고색으로(연장 판단용) */}
                <div className="shrink-0 text-right">
                  {r.is_active ? (
                    <span
                      className={`text-sm font-bold ${
                        r.days_left <= 7 ? "text-amber-400" : "text-emerald-400"
                      }`}
                    >
                      D-{r.days_left}
                    </span>
                  ) : (
                    <span className="text-sm font-bold text-red-400">만료</span>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {r.is_active ? "남음" : `${Math.abs(r.days_left)}일 지남`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 페이지네이션 — 총건수는 서버 기준 */}
        {!listLoading && !listError && listTotal > LIST_PAGE && (
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setListPage((p) => Math.max(0, p - 1))}
              disabled={listPage === 0}
              className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground disabled:opacity-40 hover:border-white/30 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> 이전
            </button>
            <span className="text-xs text-muted-foreground">
              {listPage + 1} / {lastPage + 1}
            </span>
            <button
              onClick={() => setListPage((p) => Math.min(lastPage, p + 1))}
              disabled={listPage >= lastPage}
              className="h-8 px-2.5 rounded-lg border border-border text-xs text-muted-foreground disabled:opacity-40 hover:border-white/30 flex items-center gap-1"
            >
              다음 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          · <b>수동 지급</b> = 이 화면에서 지급한 이력이 있는 계정.<br />
          · <b>결제·직접설정</b> = 그 외 전부 — 토스 결제 구독과 DB 에서 직접 넣은 계정(관리자 영구 프리미엄 등)이 <b>함께</b> 들어갑니다. 둘은 구분하지 않습니다.<br />
          · 몇 개월씩 줬는지 등 <b>지급 이력 전체</b>는 <b>활동 로그 → 프리미엄 지급</b> 에서 볼 수 있습니다.
        </p>
      </div>
    </div>
  );
}
