// 사용자 상세 모달 (사용자 관리 "상세" 스펙) — admin_get_user_detail RPC
import { useCallback, useEffect, useState } from "react";
import {
  X, Loader2, Crown, ShieldCheck, ShieldAlert, Film, EyeOff, MessageSquare,
  FileText, Users, UserPlus, ShoppingBag, CreditCard, Copy, AlertTriangle,
  Ban, CheckCircle2,
} from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface UserDetail {
  profile: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    subscription_tier: string;
    subscription_started_at: string | null;
    subscription_expires_at: string | null;
    is_admin: boolean;
    is_suspended: boolean;
    suspended_reason: string | null;
    suspended_at: string | null;
    tax_type: string | null;
    business_number: string | null;
    business_name: string | null;
    has_payout_info: boolean;
    referral_code: string | null;
    referral_count: number | null;
    deletion_requested_at: string | null;
    created_at: string;
    updated_at: string;
  };
  stats: {
    videos_total: number;
    videos_hidden: number;
    comments: number;
    posts: number;
    followers: number;
    following: number;
    orders_completed: number;
    payments_total: number;
    payments_count: number;
  };
  recent_videos: {
    id: string;
    title: string | null;
    thumbnail: string | null;
    is_hidden: boolean;
    visibility: string | null;
    created_at: string;
  }[];
  recent_payments: {
    id: number;
    order_id: string | null;
    payment_type: string;
    amount: number;
    status: string;
    created_at: string;
  }[];
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR") : "—");
const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString("ko-KR") : "—");

const PAY_TYPE_LABEL: Record<string, string> = {
  subscription: "구독",
  license: "라이선스",
  ad_budget: "광고예산",
};
const PAY_STATUS_LABEL: Record<string, string> = {
  completed: "완료",
  refunded: "환불",
  refund_requested: "환불요청",
  failed: "실패",
  pending: "대기",
};

export function AdminUserDetailModal({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged?: () => void }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const fetchDetail = useCallback(async (): Promise<UserDetail | null> => {
    const { data, error } = await supabase.rpc("admin_get_user_detail", { p_user_id: userId });
    if (error) {
      toast.error("상세 조회 실패: " + error.message);
      return null;
    }
    return data as UserDetail;
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const d = await fetchDetail();
      if (cancelled) return;
      if (!d) { onClose(); return; }
      setDetail(d);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // userId 만 의존 — onClose 는 매 렌더 새 함수라 넣으면 부모 리렌더마다 재조회됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success("복사됨"),
      () => toast.error("복사 실패"),
    );
  };

  const p = detail?.profile;
  const s = detail?.stats;
  const isSelf = !!p && p.id === user?.id;

  // 액션 완료 공통 처리 — 성공 시 모달 상세 + 목록(onChanged) 동시 갱신
  const finish = async (error: { message: string } | null, okMsg: string, failMsg: string) => {
    if (error) { toast.error(`${failMsg}: ${error.message}`); setActing(false); return; }
    toast.success(okMsg);
    const d = await fetchDetail();
    if (d) setDetail(d);
    onChanged?.();
    setActing(false);
  };

  const doSuspend = async () => {
    if (!p) return;
    const reason = prompt(`'${p.display_name || p.email}' 사용자를 정지하는 이유:`);
    if (reason === null) return;
    setActing(true);
    const { error } = await supabase.rpc("admin_suspend_user", { p_user_id: p.id, p_reason: reason });
    await finish(error, "정지 처리됨", "정지 실패");
  };
  const doUnsuspend = async () => {
    if (!p) return;
    if (!confirm(`'${p.display_name || p.email}' 정지를 해제하시겠습니까?`)) return;
    setActing(true);
    const { error } = await supabase.rpc("admin_unsuspend_user", { p_user_id: p.id });
    await finish(error, "정지 해제됨", "해제 실패");
  };
  const doToggleAdmin = async () => {
    if (!p) return;
    const newRole = !p.is_admin;
    if (!confirm(`'${p.display_name || p.email}' 에게 어드민 권한을 ${newRole ? "부여" : "회수"}하시겠습니까?`)) return;
    setActing(true);
    const { error } = await supabase.rpc("admin_set_admin_role", { p_user_id: p.id, p_is_admin: newRole });
    await finish(error, newRole ? "어드민 부여됨" : "어드민 회수됨", "권한 변경 실패");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center gap-3 z-10">
          <h3 className="font-bold text-base flex-1">사용자 상세</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading || !p || !s ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
          </div>
        ) : (
          <>
          <div className="p-5 space-y-5">
            {/* 프로필 요약 */}
            <div className="flex items-start gap-3">
              <UserAvatar src={p.avatar_url} name={p.display_name} className="w-16 h-16" fallbackClassName="text-xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-lg truncate">{p.display_name || "이름 없음"}</span>
                  {p.subscription_tier === "premium" && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold flex items-center gap-1">
                      <Crown className="w-3 h-3" />PREMIUM
                    </span>
                  )}
                  {p.is_admin && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6366f1]/15 text-[#8b5cf6] font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />어드민
                    </span>
                  )}
                  {p.is_suspended && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />정지
                    </span>
                  )}
                </div>
                <button
                  onClick={() => p.email && copy(p.email)}
                  className="text-xs text-muted-foreground mt-1 flex items-center gap-1 hover:text-foreground"
                >
                  {p.email || "(이메일 없음)"}
                  {p.email && <Copy className="w-3 h-3" />}
                </button>
                <p className="text-[11px] text-muted-foreground/70 mt-1">가입 {fmtDate(p.created_at)}</p>
              </div>
            </div>

            {p.bio && <p className="text-sm text-muted-foreground border-l-2 border-border pl-3">{p.bio}</p>}

            {/* 정지/삭제요청 경고 */}
            {p.is_suspended && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
                <p className="font-semibold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" />정지된 계정</p>
                <p className="mt-1">사유: {p.suspended_reason || "—"}</p>
                <p className="text-red-300/70">정지 시각: {fmtDate(p.suspended_at)}</p>
              </div>
            )}
            {p.deletion_requested_at && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-xs text-orange-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                계정 삭제 요청됨 — {fmtDate(p.deletion_requested_at)}
              </div>
            )}

            {/* 통계 그리드 */}
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={Film} label="영상" value={s.videos_total} sub={s.videos_hidden > 0 ? `숨김 ${s.videos_hidden}` : undefined} />
              <Stat icon={MessageSquare} label="댓글" value={s.comments} />
              <Stat icon={FileText} label="게시글" value={s.posts} />
              <Stat icon={Users} label="팔로워" value={s.followers} />
              <Stat icon={UserPlus} label="팔로잉" value={s.following} />
              <Stat icon={ShoppingBag} label="구매" value={s.orders_completed} />
            </div>

            {/* 구독 + 결제 요약 */}
            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-xs">
              <Row label="구독 등급" value={p.subscription_tier} />
              {p.subscription_tier === "premium" && (
                <>
                  <Row label="구독 시작" value={fmtDay(p.subscription_started_at)} />
                  <Row label="구독 만료" value={fmtDay(p.subscription_expires_at)} />
                </>
              )}
              <Row label="누적 결제" value={`₩${s.payments_total.toLocaleString()} (${s.payments_count}건)`} />
              {p.referral_code && <Row label="추천 코드" value={`${p.referral_code} (추천 ${p.referral_count ?? 0}명)`} />}
            </div>

            {/* 크리에이터 정산 정보 (있을 때만) */}
            {(p.has_payout_info || p.business_number || p.tax_type) && (
              <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-xs">
                <p className="font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />정산 정보
                </p>
                <Row label="정산 계좌" value={p.has_payout_info ? "등록됨" : "미등록"} />
                {p.tax_type && <Row label="과세 유형" value={p.tax_type === "business" ? "사업자" : "개인"} />}
                {p.business_name && <Row label="상호" value={p.business_name} />}
                {p.business_number && <Row label="사업자번호" value={p.business_number} />}
              </div>
            )}

            {/* 최근 영상 */}
            {detail && detail.recent_videos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">최근 영상</p>
                <div className="space-y-1.5">
                  {detail.recent_videos.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 text-xs">
                      <div className="w-14 h-8 rounded bg-muted overflow-hidden flex-shrink-0">
                        {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className="flex-1 truncate">{v.title || "(제목 없음)"}</span>
                      {v.is_hidden && <EyeOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                      {v.visibility && v.visibility !== "public" && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{v.visibility}</span>
                      )}
                      <span className="text-muted-foreground/60 flex-shrink-0">{fmtDay(v.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 최근 결제 */}
            {detail && detail.recent_payments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">최근 결제</p>
                <div className="space-y-1.5">
                  {detail.recent_payments.map((pay) => (
                    <div key={pay.id} className="flex items-center gap-2 text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] flex-shrink-0">
                        {PAY_TYPE_LABEL[pay.payment_type] || pay.payment_type}
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">{pay.order_id || `#${pay.id}`}</span>
                      <span className="font-semibold flex-shrink-0">₩{pay.amount.toLocaleString()}</span>
                      <span className={`text-[10px] flex-shrink-0 ${pay.status === "refunded" ? "text-red-400" : pay.status === "completed" ? "text-green-400" : "text-muted-foreground"}`}>
                        {PAY_STATUS_LABEL[pay.status] || pay.status}
                      </span>
                      <span className="text-muted-foreground/60 flex-shrink-0">{fmtDay(pay.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground/50 pt-1 flex items-center gap-1">
              ID: {p.id}
              <button onClick={() => copy(p.id)} className="hover:text-foreground"><Copy className="w-3 h-3" /></button>
            </p>
          </div>

          {/* 액션 푸터 — 정지/해제 · 어드민 부여/회수 (본인 계정 제외) */}
          <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex items-center gap-2 justify-end">
            {acting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-auto" />}
            {isSelf ? (
              <span className="text-xs text-muted-foreground">본인 계정 — 셀프 정지/권한 회수 불가</span>
            ) : (
              <>
                {p.is_suspended ? (
                  <Button size="sm" variant="outline" onClick={doUnsuspend} disabled={acting} className="gap-1 text-green-400 border-green-500/30">
                    <CheckCircle2 className="w-4 h-4" />정지 해제
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={doSuspend} disabled={acting} className="gap-1 text-red-400 border-red-500/30">
                    <Ban className="w-4 h-4" />정지
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={doToggleAdmin} disabled={acting} className="gap-1">
                  <ShieldCheck className="w-4 h-4" />{p.is_admin ? "어드민 회수" : "어드민 부여"}
                </Button>
              </>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Film; label: string; value: number; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5 text-center">
      <Icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
      <p className="font-bold text-sm">{value.toLocaleString()}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {sub && <p className="text-[9px] text-red-400/80 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}
