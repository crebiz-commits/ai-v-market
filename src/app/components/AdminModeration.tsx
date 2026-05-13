// 숨김 콘텐츠 관리 — 영상/댓글/커뮤니티글/정지 사용자 통합 (Phase 10.6)
import { useEffect, useState } from "react";
import { Loader2, EyeOff, Film, MessageSquare, FileText, User, RefreshCw } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface HiddenRow {
  target_type: string;
  target_id: string;
  title: string | null;
  thumbnail: string | null;
  reason: string | null;
  hidden_at: string | null;
  creator_name: string | null;
}

const TARGETS = [
  { key: "all", label: "전체" },
  { key: "video", label: "영상" },
  { key: "comment", label: "댓글" },
  { key: "community_post", label: "커뮤니티" },
  { key: "user", label: "정지 사용자" },
];

const ICONS: Record<string, typeof Film> = {
  video: Film,
  comment: MessageSquare,
  community_post: FileText,
  user: User,
};

export function AdminModeration() {
  const [rows, setRows] = useState<HiddenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_hidden_content", { p_target_type: filter });
    if (error) {
      toast.error("숨김 목록 조회 실패: " + error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const restore = async (r: HiddenRow) => {
    const key = `${r.target_type}:${r.target_id}`;
    if (!confirm("복원하시겠습니까?")) return;
    setProcessingKey(key);
    let error;
    if (r.target_type === "video") {
      ({ error } = await supabase.rpc("admin_unhide_video", { p_video_id: r.target_id }));
    } else if (r.target_type === "user") {
      ({ error } = await supabase.rpc("admin_unsuspend_user", { p_user_id: r.target_id }));
    } else {
      // 댓글/커뮤니티는 SQL update로 직접 (별도 RPC가 없음 — 추후 필요시 추가)
      const table = r.target_type === "comment" ? "comments" : "community_posts";
      ({ error } = await supabase
        .from(table)
        .update({ is_hidden: false, hidden_reason: null, hidden_at: null })
        .eq("id", r.target_id));
    }
    setProcessingKey(null);
    if (error) return toast.error("복원 실패: " + error.message);
    toast.success("복원됨");
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {TARGETS.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === t.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{t.label}</button>
        ))}
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <EyeOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>숨김/정지 콘텐츠가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const Icon = ICONS[r.target_type] || EyeOff;
            const key = `${r.target_type}:${r.target_id}`;
            return (
              <div key={key} className="bg-card border border-red-500/20 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  {r.thumbnail ? (
                    <img src={r.thumbnail} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-bold">
                        {TARGETS.find(t => t.key === r.target_type)?.label}
                      </span>
                      <p className="font-semibold text-sm truncate">{r.title || "(제목 없음)"}</p>
                    </div>
                    <p className="text-xs text-red-400/80 mt-1">사유: {r.reason || "사유 없음"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {r.creator_name || ""} · {r.hidden_at ? new Date(r.hidden_at).toLocaleString("ko-KR") : "-"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restore(r)} disabled={processingKey === key} className="text-green-400 border-green-500/30">
                    복원
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
