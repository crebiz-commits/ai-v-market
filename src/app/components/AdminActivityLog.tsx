// 어드민 활동 로그 페이지 (Phase 10.7)
import { useEffect, useState } from "react";
import { Loader2, ClipboardList, RefreshCw, User, EyeOff, Eye, Trash2, RotateCcw, Megaphone, ShieldCheck, ShieldAlert, Ban, Flag, Sparkles, Coins, Gift, Crown, Star, Trophy, Layers, Image as ImageIcon, Bug, MessageSquare, Settings, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface LogRow {
  id: number;
  admin_id: string;
  admin_name: string | null;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; icon: typeof User; color: string }> = {
  suspend_user:           { label: "사용자 정지",      icon: Ban,           color: "text-red-400" },
  unsuspend_user:         { label: "사용자 정지 해제",  icon: ShieldCheck,   color: "text-green-400" },
  set_admin_role:         { label: "어드민 권한 변경",  icon: ShieldAlert,   color: "text-[#8b5cf6]" },
  hide_video:             { label: "영상 숨김",        icon: EyeOff,        color: "text-amber-300" },
  unhide_video:           { label: "영상 복원",        icon: Eye,           color: "text-green-400" },
  delete_video:           { label: "영상 삭제",        icon: Trash2,        color: "text-red-400" },
  refund_payment:         { label: "환불 처리",        icon: RotateCcw,     color: "text-amber-300" },
  broadcast_notification: { label: "공지 발송",        icon: Megaphone,     color: "text-blue-400" },
  hide_comment:           { label: "댓글 숨김",        icon: EyeOff,        color: "text-amber-300" },
  unhide_comment:         { label: "댓글 복원",        icon: Eye,           color: "text-green-400" },
  delete_comment:         { label: "댓글 삭제",        icon: Trash2,        color: "text-red-400" },
  unhide_post:            { label: "커뮤니티글 복원",  icon: Eye,           color: "text-green-400" },
  resolve_moderation:     { label: "AI 검토 결정",     icon: ShieldCheck,   color: "text-blue-400" },
  report_remove:          { label: "신고 반영·콘텐츠 제거", icon: EyeOff,     color: "text-red-400" },
  report_keep:            { label: "신고 기각·정상 판정",   icon: ShieldCheck, color: "text-green-400" },
  report_dismiss:         { label: "신고 무효 처리",        icon: Flag,       color: "text-gray-400" },
  sponsor_approve:        { label: "협찬 표시 승인",        icon: Sparkles,   color: "text-emerald-400" },
  sponsor_reject:         { label: "협찬 표시 반려",        icon: Sparkles,   color: "text-red-400" },
  clawback_add:           { label: "클로백 등록",          icon: RotateCcw,  color: "text-red-400" },
  clawback_resolve:       { label: "클로백 처리",          icon: RotateCcw,  color: "text-amber-300" },
  // ── 2026-07-19 활동로그 감사: 실제 기록되나 라벨 없던 action 보강(원문 영어 표시 해소) ──
  // 금전·권한·정책 (감사 최우선)
  update_setting:         { label: "정책 변경",            icon: Settings,      color: "text-red-400" },
  revenue_payout:         { label: "정산 지급",            icon: Coins,         color: "text-emerald-400" },
  grant_premium:          { label: "프리미엄 지급",        icon: Gift,          color: "text-emerald-400" },
  crown_creator:          { label: "이달의 크리에이터 지정", icon: Crown,        color: "text-yellow-400" },
  set_video_hero:         { label: "OTT 히어로 지정",       icon: Star,          color: "text-blue-400" },
  // 광고 (트리거 log_ads_changes + 광고 심사)
  create_ad:              { label: "광고 등록",            icon: Megaphone,     color: "text-blue-400" },
  update_ad:              { label: "광고 수정",            icon: Megaphone,     color: "text-amber-300" },
  delete_ad:              { label: "광고 삭제",            icon: Megaphone,     color: "text-red-400" },
  ad_approve:             { label: "광고 승인",            icon: ShieldCheck,   color: "text-green-400" },
  ad_reject:              { label: "광고 반려",            icon: ShieldAlert,   color: "text-red-400" },
  // 챌린지
  announce_challenge:     { label: "챌린지 발표",          icon: Trophy,        color: "text-blue-400" },
  create_challenge:       { label: "챌린지 생성",          icon: Trophy,        color: "text-green-400" },
  update_challenge:       { label: "챌린지 수정",          icon: Trophy,        color: "text-amber-300" },
  delete_challenge:       { label: "챌린지 삭제",          icon: Trophy,        color: "text-red-400" },
  // 컬렉션
  collection_upsert:      { label: "컬렉션 편집",          icon: Layers,        color: "text-amber-300" },
  collection_delete:      { label: "컬렉션 삭제",          icon: Layers,        color: "text-red-400" },
  collection_set_videos:  { label: "컬렉션 영상 구성",     icon: Layers,        color: "text-blue-400" },
  // 이벤트 배너
  create_event_banner:    { label: "이벤트 배너 생성",     icon: ImageIcon,     color: "text-green-400" },
  update_event_banner:    { label: "이벤트 배너 수정",     icon: ImageIcon,     color: "text-amber-300" },
  delete_event_banner:    { label: "이벤트 배너 삭제",     icon: ImageIcon,     color: "text-red-400" },
  toggle_event_banner:    { label: "이벤트 배너 토글",     icon: ImageIcon,     color: "text-blue-400" },
  // 운영: 마일스톤·버그·문의
  set_milestone_status:   { label: "업로드 마일스톤",      icon: Flag,          color: "text-blue-400" },
  bug_coupon_sent:        { label: "버그 쿠폰 지급",       icon: Bug,           color: "text-emerald-400" },
  set_bug_status:         { label: "버그 상태 변경",       icon: Bug,           color: "text-amber-300" },
  delete_bug_report:      { label: "버그 신고 삭제",       icon: Bug,           color: "text-red-400" },
  set_inquiry_status:     { label: "비즈 문의 상태",       icon: MessageSquare, color: "text-blue-400" },
  reply_support_inquiry:  { label: "고객 문의 답변",       icon: MessageSquare, color: "text-green-400" },
  set_support_status:     { label: "고객 문의 상태",       icon: MessageSquare, color: "text-amber-300" },
};

const ACTIONS_FILTER = [
  { key: "all",                    label: "전체" },
  { key: "suspend_user",           label: "사용자 정지" },
  { key: "set_admin_role",         label: "권한 변경" },
  { key: "hide_video",             label: "영상 숨김" },
  { key: "delete_video",           label: "영상 삭제" },
  { key: "hide_comment",           label: "댓글 숨김" },
  { key: "resolve_moderation",     label: "AI 검토" },
  { key: "report_remove",          label: "신고 반영" },
  { key: "report_keep",            label: "신고 기각" },
  { key: "refund_payment",         label: "환불" },
  { key: "update_setting",         label: "정책 변경" },
  { key: "grant_premium",          label: "프리미엄 지급" },
  { key: "revenue_payout",         label: "정산 지급" },
  { key: "broadcast_notification", label: "공지" },
];

export function AdminActivityLog() {
  const PAGE_SIZES = [30, 50, 100];
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);       // 0-indexed
  const [hasMore, setHasMore] = useState(false);

  // 페이지 단위 조회 — 끝없는 append 대신 30/50/100개씩 이동(replace)
  const load = async (targetPage: number) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_activity_logs", {
      p_admin_id: null,
      p_action: actionFilter === "all" ? null : actionFilter,
      p_limit: pageSize,
      p_offset: targetPage * pageSize,
    });
    if (error) {
      toast.error("로그 조회 실패: " + error.message);
      setLogs([]);
    } else {
      const list = (data || []) as LogRow[];
      setLogs(list);
      setHasMore(list.length === pageSize);   // 다음 페이지 존재 가능
      setPage(targetPage);
    }
    setLoading(false);
  };

  // 필터·페이지 크기 변경 시 첫 페이지로 리셋
  useEffect(() => { load(0); }, [actionFilter, pageSize]);

  return (
    <div>
      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {ACTIONS_FILTER.map(a => (
          <button
            key={a.key}
            onClick={() => setActionFilter(a.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              actionFilter === a.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{a.label}</button>
        ))}
        <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading} className="ml-auto gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
        어드민이 변경한 모든 작업이 자동 기록됩니다. 보안 감사 + 책임 추적용입니다.
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : logs.length === 0 && page === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>활동 로그가 없습니다</p>
        </div>
      ) : (
        <>
        {logs.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">이 페이지엔 로그가 없습니다</div>
        )}
        <div className="space-y-2">
          {logs.map(l => {
            const meta = ACTION_META[l.action] || { label: l.action, icon: ClipboardList, color: "text-muted-foreground" };
            const Icon = meta.icon;
            return (
              <div key={l.id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${meta.color}`}>{meta.label}</span>
                      {l.target_type && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                          {l.target_type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {l.admin_name || l.admin_email || "(알 수 없음)"} ·
                      {" " + new Date(l.created_at).toLocaleString("ko-KR")}
                    </p>
                    {l.target_id && (
                      <p className="text-[11px] font-mono text-muted-foreground/70 mt-0.5 truncate">
                        대상: {l.target_id}
                      </p>
                    )}
                    {l.details && Object.keys(l.details).length > 0 && (
                      <details className="mt-1.5">
                        <summary className="text-[11px] text-[#6366f1] cursor-pointer hover:underline">
                          상세 정보
                        </summary>
                        <pre className="text-[10px] text-muted-foreground/80 mt-1 p-2 bg-muted/40 rounded overflow-x-auto">
{JSON.stringify(l.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* 페이지네이션 — 30/50/100개씩, 이전/다음 (끝없는 append 대신 페이지 이동) */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>페이지당</span>
            {PAGE_SIZES.map(sz => (
              <button
                key={sz}
                onClick={() => setPageSize(sz)}
                className={`px-2 py-1 rounded font-semibold transition-colors ${
                  pageSize === sz ? "bg-[#6366f1] text-white" : "bg-muted hover:bg-muted/70"
                }`}
              >{sz}</button>
            ))}
            <span>개</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load(page - 1)} disabled={loading || page === 0} className="gap-1">
              <ChevronLeft className="w-4 h-4" />이전
            </Button>
            <span className="text-xs text-muted-foreground min-w-[3.5rem] text-center">{page + 1} 페이지</span>
            <Button variant="outline" size="sm" onClick={() => load(page + 1)} disabled={loading || !hasMore} className="gap-1">
              다음<ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
