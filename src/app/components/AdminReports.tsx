// ════════════════════════════════════════════════════════════════════════════
// 어드민 신고 큐 관리 페이지 (Phase 10)
//
// 기능:
//   - pending 상태 신고 목록 조회 (get_pending_reports RPC)
//   - 각 신고에 대해 유지/제거/반려 액션 (moderate_report RPC)
//   - 신고 누적이 임계값 넘은 콘텐츠는 자동 숨김 상태로 표시
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { Loader2, Check, Trash2, X, RefreshCw, Flag, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { sendNotification, buildReportResultEmail } from "../utils/sendNotification";
import { useSettings } from "../contexts/SettingsContext";

interface ReportRow {
  id: number;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  created_at: string;
  report_count: number;
  // 2차 감사 보강 — 관리자가 대상 실제 내용을 보고 판정하도록 백엔드가 함께 반환
  target_preview?: string | null;    // 대상 콘텐츠 스니펫(영상제목/댓글본문/글제목/닉네임)
  target_deleted?: boolean;          // 대상이 삭제된 고아 신고
  comment_video_id?: string | null;  // 댓글 부모 영상(딥링크용)
  comment_post_id?: string | null;   // 댓글 부모 커뮤니티글(딥링크용)
}

const REASON_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  spam: { label: "스팸 / 광고", icon: "🚫", color: "text-amber-300 bg-amber-500/10" },
  inappropriate: { label: "음란물", icon: "🔞", color: "text-red-400 bg-red-500/10" },
  copyright: { label: "저작권 침해", icon: "©️", color: "text-blue-300 bg-blue-500/10" },
  violence: { label: "폭력/위험", icon: "⚠️", color: "text-orange-400 bg-orange-500/10" },
  harassment: { label: "괴롭힘/혐오", icon: "😡", color: "text-pink-400 bg-pink-500/10" },
  misinformation: { label: "허위 정보", icon: "📰", color: "text-purple-400 bg-purple-500/10" },
  other: { label: "기타", icon: "💬", color: "text-muted-foreground bg-muted" },
};

const TARGET_LABELS: Record<string, string> = {
  video: "📹 영상",
  comment: "💬 댓글",
  user: "👤 사용자",
  community_post: "📝 커뮤니티",
};

export function AdminReports() {
  // L2(2026-05-31): 자동 숨김 임계값을 platform_settings 에서 동적 조회 (하드코딩 3 제거)
  const { autoHideThreshold } = useSettings();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_pending_reports");
    if (error) {
      toast.error("신고 큐 조회 실패: " + error.message);
      setReports([]);
    } else {
      setReports(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 대상 유형 라벨 — 영상/댓글/사용자/커뮤니티 (이모지 프리픽스 제거)
  const targetNoun = (tt: string) => TARGET_LABELS[tt]?.replace(/^.+\s/, "") || tt;

  const handleAction = async (report: ReportRow, action: "keep" | "remove" | "dismiss") => {
    const id = report.id;
    // user 대상은 백엔드 remove가 콘텐츠 숨김이 아니라 profiles.is_suspended(계정 정지)라
    //   안내 문구를 분기해야 함(2026-07-18 감사: moderate_report target_type별 처리 확인).
    const isUser = report.target_type === "user";
    const confirmMsg =
      action === "keep"
        ? (isUser
            ? "정상 사용자로 판정하시겠습니까?\n(신고를 기각합니다)"
            : "정상 콘텐츠로 판정하시겠습니까?\n(자동 숨김된 콘텐츠는 복원됩니다)")
        : action === "remove"
          ? (isUser
              ? "가이드라인 위반으로 이 사용자 계정을 정지하시겠습니까?\n(계정 정지)"
              : "가이드라인 위반으로 콘텐츠를 숨김 처리하시겠습니까?\n(영구 숨김)")
          : "악성 신고로 반려하시겠습니까?\n(이 신고만 무효 처리)";
    if (!confirm(confirmMsg)) return;

    const adminNote = prompt("어드민 메모를 입력하세요 (선택, 사용자에게 보이지 않음)") || null;

    setProcessingId(id);
    const { error } = await supabase.rpc("moderate_report", {
      p_report_id: id,
      p_action: action,
      p_admin_note: adminNote,
    });
    setProcessingId(null);

    if (error) {
      toast.error("처리 실패: " + error.message);
      return;
    }

    // Phase 34 — 신고자에게 처리 결과 메일 발송 (keep/remove만, dismiss 제외)
    if (action === "keep" || action === "remove") {
      try {
        const clicked = reports.find((r) => r.id === id);
        if (clicked) {
          const targetTypeLabel =
            TARGET_LABELS[clicked.target_type]?.replace(/^.+\s/, "") || clicked.target_type;
          const { subject, html } = buildReportResultEmail({ action, targetTypeLabel });
          // M6(2026-05-31): 같은 대상의 모든 신고자에게 통지 (moderate_report가 일괄 처리하므로)
          const reporterIds = Array.from(new Set(
            reports
              .filter((r) => r.target_type === clicked.target_type && r.target_id === clicked.target_id && r.reporter_id)
              .map((r) => r.reporter_id)
          ));
          for (const rid of reporterIds) {
            void sendNotification({
              user_id: rid,
              type: "report_result",
              // to 생략 — Edge Function이 user_id로 자동 조회
              subject,
              html,
            });
          }
        }
      } catch (mailErr) {
        console.warn("[AdminReports] 신고 결과 메일 발송 실패:", mailErr);
      }
    }

    const successMsg =
      action === "keep"
        ? (isUser ? "정상 판정됨 (신고 기각)" : "유지 처리됨 (자동 숨김도 해제)")
        : action === "remove"
          ? (isUser ? "계정 정지됨" : "제거 처리됨 (콘텐츠 숨김)")
          : "악성 신고로 반려됨";
    toast.success(successMsg);
    load();
  };

  // 같은 대상의 중복 신고는 묶어서 표시 (대표 1개만 보여주고 나머지는 카운트로)
  const groupedReports = (() => {
    const groups = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const key = `${r.target_type}:${r.target_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.values());
  })();

  const filtered = groupedReports.filter(group =>
    filterType === "all" || group[0].target_type === filterType
  );

  // 필터 타입별 개수
  const typeCounts = {
    all: groupedReports.length,
    video: groupedReports.filter(g => g[0].target_type === "video").length,
    comment: groupedReports.filter(g => g[0].target_type === "comment").length,
    user: groupedReports.filter(g => g[0].target_type === "user").length,
    community_post: groupedReports.filter(g => g[0].target_type === "community_post").length,
  };

  return (
    <div>
      <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">신고 처리 안내</p>
          <ul className="text-amber-200/80 space-y-0.5">
            <li>• <span className="font-semibold">유지</span>: 정상 콘텐츠 — 자동 숨김됐다면 복원</li>
            <li>• <span className="font-semibold">제거</span>: 가이드라인 위반 — 콘텐츠 숨김(영구) · 사용자 대상은 <span className="font-semibold">계정 정지</span></li>
            <li>• <span className="font-semibold">반려</span>: 악성 신고 — 단일 신고만 무효 처리</li>
            <li>• 같은 대상에 대한 신고는 자동으로 그룹핑됩니다</li>
          </ul>
        </div>
      </div>

      {/* 필터 + 새로고침 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { key: "all", label: "전체" },
          { key: "video", label: "📹 영상" },
          { key: "comment", label: "💬 댓글" },
          { key: "user", label: "👤 사용자" },
          { key: "community_post", label: "📝 커뮤니티" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterType(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterType === key
                ? "bg-[#6366f1] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {label} ({typeCounts[key as keyof typeof typeCounts]})
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-1.5 ml-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Flag className="w-12 h-12 mx-auto mb-3 opacity-30" />
          {filterType !== "all" && groupedReports.length > 0 ? (
            <>
              <p>이 유형의 신고가 없습니다</p>
              <p className="text-xs mt-1">다른 유형에는 처리 대기 중인 신고가 있습니다 — '전체'에서 확인하세요.</p>
            </>
          ) : (
            <>
              <p>처리 대기 중인 신고가 없습니다</p>
              <p className="text-xs mt-1">모든 신고가 처리되었거나, 아직 접수되지 않았습니다.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(group => {
            // get_pending_reports 정렬이 created_at DESC → group[0]=최신. "최초 신고"는 가장
            //   오래된 것이므로 group 마지막이 대표(2차 감사: 라벨/데이터 정합).
            const primary = group[group.length - 1];
            const reasonMeta = REASON_LABELS[primary.reason];
            return (
              <div key={`${primary.target_type}:${primary.target_id}`}
                   className="bg-card border border-border rounded-xl p-4">
                {/* Header — 대상 정보 */}
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-bold">
                      {TARGET_LABELS[primary.target_type] || primary.target_type}
                    </span>
                    {/* 2차 감사 M2: 대상이 삭제된 고아 신고 표시 */}
                    {primary.target_deleted && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 font-bold">
                        🗑 대상 삭제됨
                      </span>
                    )}
                    {/* L3(2026-05-31): user 신고는 자동 숨김 대상이 아님 → 배지 제외 */}
                    {primary.report_count >= autoHideThreshold && primary.target_type !== "user" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold">
                        ⚠️ 신고 {primary.report_count}건 — 자동 숨김됨
                      </span>
                    )}
                    {primary.report_count >= autoHideThreshold && primary.target_type === "user" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold">
                        신고 {primary.report_count}건 — 수동 검토 필요
                      </span>
                    )}
                  </div>
                  {(() => {
                    // 대상 딥링크: 영상/사용자채널/커뮤니티글 이동. 댓글은 부모(영상/글)로 이동
                    //   (백엔드가 comment_video_id/comment_post_id 반환). 삭제된 대상은 링크 없음.
                    const tt = primary.target_type, tid = primary.target_id;
                    const href = primary.target_deleted ? null
                      : tt === "video" ? `/?video=${tid}`
                      : tt === "user" ? `/?tab=channel&creator=${tid}`
                      : tt === "community_post" ? `/?tab=community&sub=posts&post=${tid}`
                      : tt === "comment" && primary.comment_video_id ? `/?video=${primary.comment_video_id}`
                      : tt === "comment" && primary.comment_post_id ? `/?tab=community&sub=posts&post=${primary.comment_post_id}`
                      : null;
                    const linkLabel = tt === "comment" ? "원본 위치 보기" : "대상 보기";
                    const idText = href ? linkLabel : `대상 ID: ${tid.slice(0, 18)}…`;
                    return href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#6366f1] hover:underline flex items-center gap-1">
                        {idText}<ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">{idText}</span>
                    );
                  })()}
                </div>

                {/* 사유 */}
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${reasonMeta?.color || "bg-muted"} mb-2`}>
                  <span>{reasonMeta?.icon || "💬"}</span>
                  <span>{reasonMeta?.label || primary.reason}</span>
                </div>

                {/* 대상 콘텐츠 미리보기 — 관리자가 무엇을 판정하는지 확인 (2차 감사 H1: 특히 댓글 맹검 해소) */}
                {primary.target_preview ? (
                  <div className="text-sm mt-1 mb-2 p-2.5 rounded-lg bg-white/[0.04] border border-white/10">
                    <span className="text-[10px] text-muted-foreground block mb-1">
                      {primary.target_type === "user" ? "신고된 사용자" : "신고된 내용"}
                    </span>
                    <span className="text-foreground/90 whitespace-pre-wrap break-words line-clamp-4">
                      {primary.target_preview}
                    </span>
                  </div>
                ) : primary.target_deleted ? (
                  <p className="text-xs text-gray-400 mt-1 mb-2 italic">
                    ⚠️ 대상이 이미 삭제되었습니다 — 반려로 큐에서 정리하세요.
                  </p>
                ) : null}

                {/* 신고자 메모(자유입력) — 신고된 내용(preview)과 구분 */}
                {primary.description && (
                  <div className="mt-2 mb-2 p-2 rounded bg-muted/40">
                    <span className="text-[10px] text-muted-foreground block mb-0.5">신고자 메모</span>
                    <p className="text-sm text-muted-foreground italic">"{primary.description}"</p>
                  </div>
                )}

                {/* 신고자 정보 + 다중 신고 */}
                <div className="text-xs text-muted-foreground mt-2">
                  최초 신고: {primary.reporter_name || "이름 없음"} ·
                  {" " + new Date(primary.created_at).toLocaleString("ko-KR")}
                  {group.length > 1 && (
                    <span className="ml-2 text-amber-300 font-semibold">
                      외 {group.length - 1}명도 신고
                    </span>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(primary, "keep")}
                    disabled={processingId === primary.id}
                    className="gap-1 border-green-500/30 text-green-400 hover:bg-green-500/10"
                  >
                    <Check className="w-3.5 h-3.5" />
                    유지
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleAction(primary, "remove")}
                    disabled={processingId === primary.id}
                    className="gap-1 bg-red-500 hover:bg-red-600 text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {primary.target_type === "user" ? "정지" : "제거"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(primary, "dismiss")}
                    disabled={processingId === primary.id}
                    className="gap-1 border-muted text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                    반려
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
