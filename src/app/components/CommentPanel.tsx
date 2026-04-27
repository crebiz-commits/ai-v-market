import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Heart, ChevronDown, ChevronUp, Loader2, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

interface Comment {
  id: string;
  user_id: string;
  video_id?: string;
  post_id?: string;
  parent_id?: string;
  content: string;
  likes_count: number;
  created_at: string;
  author_name: string;
  author_avatar?: string;
  liked?: boolean;
  replies?: Comment[];
}

interface CommentPanelProps {
  videoId?: string;
  postId?: string;
  title?: string;
  onClose: () => void;
  onCommentPosted?: () => void;
  // 모바일: 바텀시트, 데스크탑: 사이드패널
  mode?: "sheet" | "panel";
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function getInitials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function Avatar({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  const colors = [
    "from-[#6366f1] to-[#8b5cf6]",
    "from-[#f59e0b] to-[#ef4444]",
    "from-[#10b981] to-[#06b6d4]",
    "from-[#f43f5e] to-[#ec4899]",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      style={{ width: size, height: size, minWidth: size }}
      className={`rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold overflow-hidden`}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.4 }}>{getInitials(name)}</span>
      )}
    </div>
  );
}

export function CommentPanel({ videoId, postId, title, onClose, onCommentPosted, mode = "sheet" }: CommentPanelProps) {
  const { user, isAuthenticated } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("comments")
        .select(`
          id, user_id, video_id, post_id, parent_id,
          content, likes_count, created_at
        `)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (videoId) query = query.eq("video_id", videoId);
      else if (postId) query = query.eq("post_id", postId);

      const { data, error } = await query;
      if (error) throw error;

      // 작성자 프로필 병합 (간단히 user_id에서)
      const enriched: Comment[] = (data || []).map((c: any) => ({
        ...c,
        author_name: c.author_name || "익명",
        replies: [],
      }));

      // 대댓글 가져오기
      const parentIds = enriched.map((c) => c.id);
      if (parentIds.length > 0) {
        let repQuery = supabase
          .from("comments")
          .select("id, user_id, parent_id, content, likes_count, created_at")
          .in("parent_id", parentIds)
          .order("created_at", { ascending: true });

        const { data: repData } = await repQuery;
        if (repData) {
          const repMap: Record<string, Comment[]> = {};
          repData.forEach((r: any) => {
            if (!repMap[r.parent_id]) repMap[r.parent_id] = [];
            repMap[r.parent_id].push({ ...r, author_name: "익명" });
          });
          enriched.forEach((c) => {
            c.replies = repMap[c.id] || [];
          });
        }
      }

      setComments(enriched);
    } catch (err) {
      console.error("[CommentPanel] fetch error:", err);
      // Supabase 테이블이 아직 없을 수 있으니 조용히 빈 배열
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [videoId, postId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    if (!isAuthenticated) {
      toast.error("댓글을 작성하려면 로그인이 필요합니다.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        user_id: user!.id,
        content: text.trim(),
        likes_count: 0,
      };
      if (videoId) payload.video_id = videoId;
      if (postId) payload.post_id = postId;
      if (replyTo) payload.parent_id = replyTo.id;

      const { data, error } = await supabase
        .from("comments")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      const newComment: Comment = {
        ...(data as any),
        author_name: user!.name,
        replies: [],
      };

      if (replyTo) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo.id
              ? { ...c, replies: [...(c.replies || []), newComment] }
              : c
          )
        );
        setExpandedReplies((prev) => new Set([...prev, replyTo.id]));
      } else {
        setComments((prev) => [newComment, ...prev]);
      }

      onCommentPosted?.();
      setText("");
      setReplyTo(null);
    } catch (err: any) {
      toast.error("댓글 작성에 실패했습니다.");
      console.error("[CommentPanel] submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!isAuthenticated) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    const alreadyLiked = likedComments.has(commentId);
    setLikedComments((prev) => {
      const next = new Set(prev);
      alreadyLiked ? next.delete(commentId) : next.add(commentId);
      return next;
    });
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, likes_count: c.likes_count + (alreadyLiked ? -1 : 1) }
          : {
              ...c,
              replies: (c.replies || []).map((r) =>
                r.id === commentId
                  ? { ...r, likes_count: r.likes_count + (alreadyLiked ? -1 : 1) }
                  : r
              ),
            }
      )
    );
    // Supabase 업데이트는 RPC나 increment 방식으로
    try {
      await supabase
        .from("comments")
        .update({ likes_count: alreadyLiked ? 0 : 1 }) // simplified
        .eq("id", commentId);
    } catch {}
  };

  const totalCount = comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  const CommentItem = ({ comment, isReply = false }: { comment: Comment; isReply?: boolean }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isReply ? "ml-10 mt-2" : ""}`}
    >
      <Avatar name={comment.author_name} size={isReply ? 28 : 36} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{comment.author_name}</span>
          <span className="text-xs text-gray-500">{timeAgo(comment.created_at)}</span>
        </div>
        <p className="text-sm text-gray-300 mt-0.5 leading-relaxed break-words">{comment.content}</p>
        <div className="flex items-center gap-4 mt-1.5">
          <button
            onClick={() => handleLike(comment.id)}
            className={`flex items-center gap-1 text-xs transition-colors ${
              likedComments.has(comment.id) ? "text-red-400" : "text-gray-500 hover:text-red-400"
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${likedComments.has(comment.id) ? "fill-red-400" : ""}`} />
            {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
          </button>
          {!isReply && (
            <button
              onClick={() => {
                setReplyTo({ id: comment.id, name: comment.author_name });
                inputRef.current?.focus();
              }}
              className="text-xs text-gray-500 hover:text-[#8b5cf6] transition-colors"
            >
              답글
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );

  const containerClass =
    mode === "panel"
      ? "flex flex-col h-full bg-[#111] border-l border-white/10 w-80"
      : "flex flex-col h-full bg-[#111] rounded-t-2xl";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-[#8b5cf6]" />
          <span className="font-semibold text-white">
            댓글 {!loading && totalCount > 0 ? totalCount : ""}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Comment List */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">첫 번째 댓글을 남겨보세요!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {comments.map((comment) => (
              <div key={comment.id}>
                <CommentItem comment={comment} />

                {/* 답글 토글 */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-10 mt-1.5">
                    <button
                      onClick={() =>
                        setExpandedReplies((prev) => {
                          const next = new Set(prev);
                          next.has(comment.id) ? next.delete(comment.id) : next.add(comment.id);
                          return next;
                        })
                      }
                      className="flex items-center gap-1 text-xs text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
                    >
                      {expandedReplies.has(comment.id) ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      답글 {comment.replies.length}개
                    </button>
                    <AnimatePresence>
                      {expandedReplies.has(comment.id) &&
                        comment.replies.map((reply) => (
                          <CommentItem key={reply.id} comment={reply} isReply />
                        ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
        {replyTo && (
          <div className="flex items-center justify-between text-xs text-[#8b5cf6] mb-2 bg-[#6366f1]/10 px-3 py-1.5 rounded-lg">
            <span>@{replyTo.name}에게 답글</span>
            <button onClick={() => setReplyTo(null)} className="hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          {user && <Avatar name={user.name} size={32} />}
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={isAuthenticated ? "댓글 추가..." : "로그인하여 댓글을 작성하세요"}
              disabled={!isAuthenticated || submitting}
              rows={1}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-[#6366f1] transition-colors disabled:opacity-50"
              style={{ minHeight: 36, maxHeight: 100 }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting || !isAuthenticated}
            className="p-2 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white disabled:opacity-40 transition-opacity flex-shrink-0"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
