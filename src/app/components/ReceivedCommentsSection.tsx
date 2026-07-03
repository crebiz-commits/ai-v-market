// ════════════════════════════════════════════════════════════════════════════
// 받은 댓글 — 크리에이터가 자기 영상에 달린 댓글을 한 곳에서 보고 답글·숨김 (2026-07-03)
//
// RPC:
//   get_creator_received_comments(limit, offset) — 내 영상 댓글(내가 쓴 건 제외) 최신순
//   creator_hide_comment(id) / creator_restore_comment(id) — 숨김/복원
//   답글은 comments 테이블에 직접 insert (parent_id=최상위, 작성자는 트리거가 프로필로 강제)
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Loader2, EyeOff, Eye, CornerDownRight, Send } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { UserAvatar } from "./UserAvatar";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface ReceivedComment {
  id: string;
  video_id: string;
  video_title: string | null;
  parent_id: string | null;
  content: string;
  author_name: string | null;
  author_avatar: string | null;
  author_user_id: string;
  is_hidden: boolean;
  created_at: string;
}

const PAGE = 20;

export function ReceivedCommentsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<ReceivedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    const setL = offset === 0 ? setLoading : setLoadingMore;
    setL(true);
    const { data, error } = await supabase.rpc("get_creator_received_comments", { p_limit: PAGE, p_offset: offset });
    if (error) {
      console.warn("[ReceivedComments] 조회 실패:", error.message);
      toast.error(t("mypage.receivedComments.loadFailed", "받은 댓글을 불러오지 못했어요."));
    } else {
      const rows = (data ?? []) as ReceivedComment[];
      setItems(prev => offset === 0 ? rows : [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
    }
    setL(false);
  }, [t]);

  useEffect(() => { if (user) load(0); }, [user, load]);

  const submitReply = async (c: ReceivedComment) => {
    const text = replyText.trim();
    if (!text || !user) return;
    setBusyId(c.id);
    // 답글은 최상위 댓글에 붙임 (받은 댓글이 이미 답글이면 그 부모에)
    const { error } = await supabase.from("comments").insert({
      user_id: user.id,
      video_id: c.video_id,
      parent_id: c.parent_id ?? c.id,
      content: text,
    });
    setBusyId(null);
    if (error) { toast.error(t("mypage.receivedComments.replyFailed", "답글 등록 실패")); return; }
    toast.success(t("mypage.receivedComments.replied", "답글을 등록했어요."));
    setReplyingId(null);
    setReplyText("");
  };

  const toggleHide = async (c: ReceivedComment) => {
    setBusyId(c.id);
    const { error } = await supabase.rpc(
      c.is_hidden ? "creator_restore_comment" : "creator_hide_comment",
      { p_comment_id: c.id },
    );
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    setItems(prev => prev.map(x => x.id === c.id ? { ...x, is_hidden: !c.is_hidden } : x));
    toast.success(c.is_hidden ? t("mypage.receivedComments.restored", "댓글을 다시 표시했어요.") : t("mypage.receivedComments.hidden", "댓글을 숨겼어요."));
  };

  return (
    <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-md">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-white">{t("mypage.receivedComments.title", "받은 댓글")}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t("mypage.receivedComments.subtitle", "내 영상에 달린 댓글에 답글을 달거나 숨길 수 있어요.")}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-10">{t("mypage.receivedComments.empty", "아직 받은 댓글이 없어요.")}</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className={`rounded-xl border p-3 ${c.is_hidden ? "bg-white/[0.02] border-white/5 opacity-70" : "bg-white/5 border-white/5"}`}>
              <div className="flex items-start gap-3">
                <UserAvatar src={c.author_avatar} name={c.author_name} className="w-9 h-9" fallbackClassName="text-sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{c.author_name || t("community.anonymous")}</span>
                    {c.parent_id && <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5"><CornerDownRight className="w-3 h-3" />{t("mypage.receivedComments.reply", "답글")}</span>}
                    {c.is_hidden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">{t("mypage.receivedComments.hiddenBadge", "숨김")}</span>}
                    <span className="text-[10px] text-gray-600">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-200 mt-1 break-words whitespace-pre-wrap">{c.content}</p>
                  <p className="text-[11px] text-gray-500 mt-1.5 truncate">📹 {c.video_title || c.video_id}</p>

                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => { setReplyingId(replyingId === c.id ? null : c.id); setReplyText(""); }}
                      className="text-xs font-semibold text-[#8b5cf6] hover:underline"
                    >
                      {t("mypage.receivedComments.replyAction", "답글")}
                    </button>
                    <button
                      onClick={() => toggleHide(c)}
                      disabled={busyId === c.id}
                      className="text-xs font-semibold text-gray-400 hover:text-white inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {busyId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (c.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />)}
                      {c.is_hidden ? t("mypage.receivedComments.restoreAction", "다시 표시") : t("mypage.receivedComments.hideAction", "숨기기")}
                    </button>
                  </div>

                  {replyingId === c.id && (
                    <div className="mt-2 flex items-end gap-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder={t("mypage.receivedComments.replyPlaceholder", "답글을 입력하세요")}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1] resize-y"
                      />
                      <button
                        onClick={() => submitReply(c)}
                        disabled={busyId === c.id || !replyText.trim()}
                        className="h-9 px-3 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                      >
                        {busyId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {t("mypage.receivedComments.send", "등록")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => load(items.length)}
              disabled={loadingMore}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold text-gray-300 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("mypage.receivedComments.loadMore", "더 보기")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
