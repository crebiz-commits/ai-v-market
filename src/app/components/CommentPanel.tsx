import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Heart, ChevronDown, ChevronUp, Loader2, MessageCircle, Trash2, Pin, MoreVertical, Ban, Flag, UserX } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useCreatorInfo } from "../hooks/useCreatorInfo";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { ReportModal } from "./ReportModal";
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
  is_pinned?: boolean;
  creator_hearted?: boolean;
  liked?: boolean;
  replies?: Comment[];
}

interface CommentPanelProps {
  videoId?: string;
  postId?: string;
  /**
   * 영상 작성자의 user_id. 핀/하트 버튼 노출 + 차단 메뉴 노출 판정에 쓰임.
   * 영상 댓글일 때만 의미 있음. 커뮤니티 글에는 전달 X.
   */
  videoCreatorId?: string;
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

export function CommentPanel({ videoId, postId, videoCreatorId, onClose, onCommentPosted, mode = "sheet" }: CommentPanelProps) {
  const { user, isAuthenticated, profile } = useAuth();
  const isVideoOwner = !!(videoId && videoCreatorId && user?.id === videoCreatorId);

  const [comments, setComments] = useState<Comment[]>([]);
  const allUserIds: string[] = [];
  comments.forEach((c) => {
    allUserIds.push(c.user_id);
    c.replies?.forEach((r) => allUserIds.push(r.user_id));
  });
  const creatorInfo = useCreatorInfo(allUserIds);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const { isBlocked, blockUser } = useBlockedUsers();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const cols = `
        id, user_id, video_id, post_id, parent_id,
        content, likes_count, created_at, author_name,
        is_pinned, creator_hearted, is_hidden
      `;

      let query = supabase
        .from("comments")
        .select(cols)
        .is("parent_id", null)
        .eq("is_hidden", false)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (videoId) query = query.eq("video_id", videoId);
      else if (postId) query = query.eq("post_id", postId);

      const { data, error } = await query;
      if (error) throw error;

      const enriched: Comment[] = (data || []).map((c: any) => ({
        ...c,
        author_name: c.author_name || "익명",
        replies: [],
      }));

      // 대댓글 (숨김 제외)
      const parentIds = enriched.map((c) => c.id);
      if (parentIds.length > 0) {
        const { data: repData } = await supabase
          .from("comments")
          .select("id, user_id, parent_id, content, likes_count, created_at, author_name, creator_hearted, is_hidden")
          .in("parent_id", parentIds)
          .eq("is_hidden", false)
          .order("created_at", { ascending: true });

        if (repData) {
          const repMap: Record<string, Comment[]> = {};
          repData.forEach((r: any) => {
            if (!repMap[r.parent_id]) repMap[r.parent_id] = [];
            repMap[r.parent_id].push({ ...r, author_name: r.author_name || "익명" });
          });
          enriched.forEach((c) => {
            c.replies = repMap[c.id] || [];
          });
        }
      }

      setComments(enriched);

      // 현재 사용자의 좋아요 상태 일괄 조회
      if (isAuthenticated) {
        const allIds: string[] = [];
        enriched.forEach((c) => {
          allIds.push(c.id);
          c.replies?.forEach((r) => allIds.push(r.id));
        });
        if (allIds.length > 0) {
          const { data: liked } = await supabase.rpc("get_my_comment_likes", { p_comment_ids: allIds });
          if (liked) {
            setLikedComments(new Set((liked as any[]).map((row) => row.comment_id)));
          }
        }
      }
    } catch (err) {
      console.error("[CommentPanel] fetch error:", err);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [videoId, postId, isAuthenticated]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openMenu]);

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
        author_name: user!.name || "익명",
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

      const inserted = data as any;

      // 자동 필터로 숨김된 경우 안내 + 추가하지 않음
      if (inserted.is_hidden) {
        toast.error("작성하신 댓글이 이 채널의 자동 필터에 의해 숨겨졌습니다.");
        setText("");
        setReplyTo(null);
        return;
      }

      const newComment: Comment = {
        ...inserted,
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

  const handleDelete = async (commentId: string, parentId?: string) => {
    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
      if (parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? { ...c, replies: (c.replies || []).filter(r => r.id !== commentId) }
            : c
        ));
      } else {
        setComments(prev => prev.filter(c => c.id !== commentId));
      }
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  };

  const handleLike = async (commentId: string) => {
    if (!isAuthenticated) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    const alreadyLiked = likedComments.has(commentId);

    // Optimistic UI
    setLikedComments((prev) => {
      const next = new Set(prev);
      if (alreadyLiked) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, likes_count: Math.max(0, c.likes_count + (alreadyLiked ? -1 : 1)) }
          : {
              ...c,
              replies: (c.replies || []).map((r) =>
                r.id === commentId
                  ? { ...r, likes_count: Math.max(0, r.likes_count + (alreadyLiked ? -1 : 1)) }
                  : r
              ),
            }
      )
    );

    const { data, error } = await supabase.rpc(
      alreadyLiked ? "unlike_comment" : "like_comment",
      { p_comment_id: commentId }
    );

    if (error) {
      // 롤백
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (alreadyLiked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
      toast.error("좋아요 처리에 실패했습니다.");
      return;
    }

    if (typeof data === "number") {
      const serverCount = data;
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likes_count: serverCount }
            : {
                ...c,
                replies: (c.replies || []).map((r) =>
                  r.id === commentId ? { ...r, likes_count: serverCount } : r
                ),
              }
        )
      );
    }
  };

  const handleTogglePin = async (commentId: string) => {
    const { data, error } = await supabase.rpc("toggle_pin_comment", { p_comment_id: commentId });
    if (error) {
      toast.error("핀 고정에 실패했습니다.");
      return;
    }
    const newPinned = !!data;
    toast.success(newPinned ? "댓글을 핀 고정했습니다." : "핀 고정을 해제했습니다.");
    setComments((prev) => {
      // 다른 댓글의 핀 해제 + 대상 댓글 토글
      const next = prev.map((c) => ({
        ...c,
        is_pinned: c.id === commentId ? newPinned : false,
      }));
      // 핀 우선 정렬 + 그 외 최신순 유지
      next.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return next;
    });
  };

  const handleToggleHeart = async (commentId: string, parentId?: string) => {
    const { data, error } = await supabase.rpc("toggle_creator_heart", { p_comment_id: commentId });
    if (error) {
      toast.error("하트 처리에 실패했습니다.");
      return;
    }
    const newHearted = !!data;
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId && !parentId) return { ...c, creator_hearted: newHearted };
        if (parentId && c.id === parentId) {
          return {
            ...c,
            replies: (c.replies || []).map((r) =>
              r.id === commentId ? { ...r, creator_hearted: newHearted } : r
            ),
          };
        }
        return c;
      })
    );
  };

  const handleBlockUser = async (targetUserId: string, name: string) => {
    if (!confirm(`${name} 사용자를 차단할까요?\n앞으로 이 사용자의 댓글이 자동 숨김 처리됩니다.`)) return;
    const { error } = await supabase.rpc("creator_block_user", {
      p_target_user_id: targetUserId,
      p_reason: "댓글 패널에서 차단",
    });
    if (error) {
      toast.error("차단에 실패했습니다.");
      return;
    }
    toast.success(`${name} 사용자를 차단했습니다.`);
    fetchComments();
  };

  // Phase 24: 차단한 사용자 댓글/대댓글 자동 숨김 (본인 화면에서만)
  const visibleComments = comments
    .filter((c) => !isBlocked(c.user_id))
    .map((c) => ({
      ...c,
      replies: (c.replies || []).filter((r) => !isBlocked(r.user_id)),
    }));

  const totalCount = visibleComments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  const CommentItem = ({ comment, isReply = false, parentId }: { comment: Comment; isReply?: boolean; parentId?: string }) => {
    const isMine = user?.id === comment.user_id;
    const isCommentByCreator = !!videoCreatorId && comment.user_id === videoCreatorId;
    const canCreatorBlock = isVideoOwner && !isCommentByCreator;
    const showMenu = !isMine && isAuthenticated; // 본인 댓글 아니고 로그인 시 메뉴 노출
    const menuOpen = openMenu === comment.id;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex gap-3 ${isReply ? "ml-10 mt-2" : ""} ${comment.is_pinned ? "bg-[#6366f1]/5 -mx-4 px-4 py-2 rounded-lg" : ""}`}
      >
        <Avatar
          name={comment.author_name}
          src={creatorInfo[comment.user_id]?.avatar ?? undefined}
          size={isReply ? 28 : 36}
        />
        <div className="flex-1 min-w-0">
          {comment.is_pinned && !isReply && (
            <div className="flex items-center gap-1 text-[11px] text-[#8b5cf6] font-bold mb-1">
              <Pin className="w-3 h-3" />
              크리에이터 고정
            </div>
          )}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{comment.author_name}</span>
            {isCommentByCreator && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
                크리에이터
              </span>
            )}
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

            {comment.creator_hearted && (
              <span title="크리에이터가 하트를 줬어요" className="relative inline-flex items-center">
                <Heart className="w-3.5 h-3.5 fill-pink-500 text-pink-500" />
              </span>
            )}

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

            {/* 영상 작성자 액션: 핀 (대댓글 제외) / 하트 / 차단 */}
            {isVideoOwner && !isReply && !isCommentByCreator && (
              <button
                onClick={() => handleTogglePin(comment.id)}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  comment.is_pinned ? "text-[#8b5cf6]" : "text-gray-500 hover:text-[#8b5cf6]"
                }`}
                title={comment.is_pinned ? "핀 고정 해제" : "핀 고정"}
              >
                <Pin className={`w-3.5 h-3.5 ${comment.is_pinned ? "fill-[#8b5cf6]" : ""}`} />
              </button>
            )}
            {isVideoOwner && !isCommentByCreator && (
              <button
                onClick={() => handleToggleHeart(comment.id, parentId)}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  comment.creator_hearted ? "text-pink-500" : "text-gray-500 hover:text-pink-500"
                }`}
                title={comment.creator_hearted ? "하트 취소" : "크리에이터 하트"}
              >
                <Heart className={`w-3.5 h-3.5 ${comment.creator_hearted ? "fill-pink-500" : ""}`} />
              </button>
            )}

            {isMine && (
              <button
                onClick={() => handleDelete(comment.id, parentId)}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors flex items-center gap-0.5"
              >
                <Trash2 className="w-3 h-3" />
                삭제
              </button>
            )}

            {showMenu && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(menuOpen ? null : comment.id);
                  }}
                  className="text-gray-600 hover:text-gray-300 transition-colors"
                  title="더보기"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
                {menuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute z-10 right-0 mt-1 bg-[#1c1c1e] border border-white/10 rounded-lg shadow-xl py-1 w-44"
                  >
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        setReportTarget({ id: comment.id, name: comment.author_name });
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-amber-400 transition-colors flex items-center gap-2"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      댓글 신고
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        blockUser(comment.user_id, comment.author_name);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-red-400 transition-colors flex items-center gap-2"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      이 사용자 차단
                    </button>
                    {canCreatorBlock && (
                      <button
                        onClick={() => {
                          setOpenMenu(null);
                          handleBlockUser(comment.user_id, comment.author_name);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-red-400 transition-colors flex items-center gap-2 border-t border-white/5 mt-1 pt-2"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        이 채널에서 차단
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

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
        ) : visibleComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
            <MessageCircle className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-gray-500 text-sm">첫 번째 댓글을 남겨보세요!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleComments.map((comment) => (
              <div key={comment.id}>
                <CommentItem comment={comment} />

                {/* 답글 토글 */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-10 mt-1.5">
                    <button
                      onClick={() =>
                        setExpandedReplies((prev) => {
                          const next = new Set(prev);
                          if (next.has(comment.id)) next.delete(comment.id);
                          else next.add(comment.id);
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
                          <CommentItem key={reply.id} comment={reply} isReply parentId={comment.id} />
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
        <div className="flex gap-2 items-center">
          {user && <Avatar name={user.name} src={profile?.avatar_url ?? undefined} size={36} />}
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
              className="w-full bg-white/5 border border-white/10 rounded-full px-4 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-[#6366f1] transition-colors disabled:opacity-50 leading-9"
              style={{ height: 36, maxHeight: 100 }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting || !isAuthenticated}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white disabled:opacity-40 transition-opacity flex-shrink-0"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Phase 24: 댓글 신고 모달 */}
      <ReportModal
        open={!!reportTarget}
        targetType="comment"
        targetId={reportTarget?.id || ""}
        targetTitle={reportTarget ? `${reportTarget.name}의 댓글` : undefined}
        onClose={() => setReportTarget(null)}
      />
    </div>
  );
}
