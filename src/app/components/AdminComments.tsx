// 댓글 관리 페이지 (Phase 23 보강) — 전체 댓글 검색/강제 숨김/복원/삭제
//
// 패턴: AdminContent.tsx 를 따라 작성 (검색 + 필터 + 리스트 + 액션)
// 크리에이터별 댓글 관리는 CommentSettings.tsx,
// 신고 처리는 AdminReports 가 담당. 본 화면은 어드민이 능동적으로 부적절 댓글을 발견·처리할 때 사용.
import { useEffect, useState } from "react";
import {
  Loader2, Search, Eye, EyeOff, Trash2, MessageSquare, Flag, Filter, Pin, Heart, Film, ExternalLink,
} from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface CommentRow {
  id: string;
  video_id: string | null;
  video_title: string | null;
  post_id: string | null;
  post_title: string | null;
  user_id: string | null;
  author_name: string | null;
  content: string;
  likes_count: number;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  is_filtered: boolean;
  filter_reason: string | null;
  is_pinned: boolean;
  creator_hearted: boolean;
  parent_id: string | null;
  created_at: string;
  pending_reports: number;
}

const FILTERS = [
  { key: "all",      label: "전체" },
  { key: "visible",  label: "공개" },
  { key: "hidden",   label: "숨김" },
  { key: "filtered", label: "자동필터" },
  { key: "reported", label: "신고 대기" },
];

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export function AdminComments() {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 50;

  const load = async (append = false) => {
    if (append && loadingMore) return;                 // 동기 중복 클릭 가드
    const off = append ? rows.length : 0;
    if (append) setLoadingMore(true); else setLoading(true);
    const { data, error } = await supabase.rpc("admin_search_comments", {
      p_query: query || null,
      p_filter: filter,
      p_limit: PAGE,
      p_offset: off,
    });
    if (error) {
      toast.error("댓글 목록 조회 실패: " + error.message);
      if (!append) setRows([]);
    } else {
      const list = (data || []) as CommentRow[];
      setRows((prev) => (append ? [...prev, ...list] : list));
      setHasMore(list.length === PAGE);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  useEffect(() => { load(); }, [filter]);

  const hide = async (c: CommentRow) => {
    const reason = prompt(`이 댓글을 숨기는 이유:\n\n"${c.content.slice(0, 60)}${c.content.length > 60 ? "…" : ""}"`);
    if (reason === null) return;
    setProcessingId(c.id);
    const { error } = await supabase.rpc("admin_hide_comment", { p_comment_id: c.id, p_reason: reason });
    setProcessingId(null);
    if (error) return toast.error("숨김 실패: " + error.message);
    toast.success("숨김 처리됨");
    load();
  };

  const unhide = async (c: CommentRow) => {
    if (!confirm("이 댓글을 복원하시겠습니까?\n(자동 필터 표시도 함께 해제됩니다)")) return;
    setProcessingId(c.id);
    const { error } = await supabase.rpc("admin_unhide_comment", { p_comment_id: c.id });
    setProcessingId(null);
    if (error) return toast.error("복원 실패: " + error.message);
    toast.success("복원됨");
    load();
  };

  const remove = async (c: CommentRow) => {
    if (!confirm(`이 댓글을 영구 삭제하시겠습니까?\n\n"${c.content.slice(0, 80)}${c.content.length > 80 ? "…" : ""}"\n\n(이 작업은 되돌릴 수 없습니다)`)) return;
    setProcessingId(c.id);
    const { error } = await supabase.rpc("admin_delete_comment", { p_comment_id: c.id });
    setProcessingId(null);
    if (error) return toast.error("삭제 실패: " + error.message);
    toast.success("삭제됨");
    load();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="input-base pl-9 w-full"
            placeholder="댓글 내용·작성자·영상 제목 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <Button onClick={() => load()} disabled={loading}>검색</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>댓글이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(c => (
            <div
              key={c.id}
              className={`bg-card border rounded-xl p-3 ${c.is_hidden ? "border-red-500/30 opacity-70" : "border-border"}`}
            >
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-sm truncate">
                      {c.author_name || "이름 없음"}
                    </p>
                    {c.parent_id && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-bold">
                        답글
                      </span>
                    )}
                    {c.is_pinned && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-bold flex items-center gap-1">
                        <Pin className="w-3 h-3" />고정
                      </span>
                    )}
                    {c.creator_hearted && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 font-bold flex items-center gap-1">
                        <Heart className="w-3 h-3" />크리에이터 ♥
                      </span>
                    )}
                    {c.is_hidden && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold">숨김</span>
                    )}
                    {c.is_filtered && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold flex items-center gap-1">
                        <Filter className="w-3 h-3" />자동필터
                      </span>
                    )}
                    {c.pending_reports > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 font-bold flex items-center gap-1">
                        <Flag className="w-3 h-3" />{c.pending_reports}건
                      </span>
                    )}
                  </div>

                  <p className="text-sm whitespace-pre-wrap break-words mb-1">{c.content}</p>

                  <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span>{fmtDate(c.created_at)}</span>
                    {c.video_id ? (
                      <a
                        href={`?video=${encodeURIComponent(c.video_id)}&comment=${encodeURIComponent(c.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#818cf8] hover:underline font-medium"
                        title="새 탭에서 영상 열기 (이 댓글로 스크롤)"
                      >
                        <Film className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[220px]">{c.video_title || "영상 보기"}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-70 flex-shrink-0" />
                      </a>
                    ) : c.post_id ? (
                      <a
                        href={`?post=${encodeURIComponent(c.post_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#818cf8] hover:underline font-medium"
                        title="새 탭에서 커뮤니티 글 열기"
                      >
                        <MessageSquare className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate max-w-[220px]">{c.post_title || "커뮤니티 글"}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-70 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">· 위치 불명</span>
                    )}
                    <span>· 좋아요 {c.likes_count.toLocaleString()}</span>
                  </p>

                  {c.is_hidden && c.hidden_reason && (
                    <p className="text-xs text-red-400/80 mt-1">숨김 사유: {c.hidden_reason}</p>
                  )}
                  {c.is_filtered && c.filter_reason && (
                    <p className="text-xs text-amber-300/80 mt-1">
                      자동 필터: {c.filter_reason === "blocked_user" ? "크리에이터 차단 사용자" : c.filter_reason === "filter_word" ? "금칙어 매칭" : c.filter_reason}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1 flex-shrink-0">
                  {c.is_hidden ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unhide(c)}
                      disabled={processingId === c.id}
                      className="gap-1 text-green-400 border-green-500/30"
                    >
                      <Eye className="w-3.5 h-3.5" />복원
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => hide(c)}
                      disabled={processingId === c.id}
                      className="gap-1 text-amber-300 border-amber-500/30"
                    >
                      <EyeOff className="w-3.5 h-3.5" />숨김
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove(c)}
                    disabled={processingId === c.id}
                    className="gap-1 text-red-400 border-red-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />삭제
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => load(true)} disabled={loadingMore} className="gap-1.5">
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "더 보기"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
