// 어드민 활동 로그 페이지 (Phase 10.7)
import { useEffect, useState } from "react";
import { Loader2, ClipboardList, RefreshCw, User, EyeOff, Eye, Trash2, RotateCcw, Megaphone, ShieldCheck, ShieldAlert, Ban, Flag } from "lucide-react";
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
  { key: "broadcast_notification", label: "공지" },
];

export function AdminActivityLog() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_activity_logs", {
      p_admin_id: null,
      p_action: actionFilter === "all" ? null : actionFilter,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) {
      toast.error("로그 조회 실패: " + error.message);
      setLogs([]);
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [actionFilter]);

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
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
        어드민이 변경한 모든 작업이 자동 기록됩니다. 보안 감사 + 책임 추적용입니다.
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>활동 로그가 없습니다</p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
