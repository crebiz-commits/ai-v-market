import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction, type RefObject } from "react";
import { X, Send, Heart, ChevronDown, ChevronUp, Loader2, MessageCircle, Trash2, Pin, MoreVertical, Ban, Flag, UserX, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useLikes } from "../contexts/LikesContext";
import { useCreatorInfo } from "../hooks/useCreatorInfo";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { ReportModal } from "./ReportModal";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { timeAgo } from "../utils/timeAgo";
import { sendNotification, buildCommentReplyEmail } from "../utils/sendNotification";

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
  replyCount?: number;   // 서버 집계(대댓글 전량 선로드 폐지) — 펼치기 전엔 replies 가 비어 있음
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
  /** 댓글/답글 삭제 성공 시 호출(제거된 개수 = 댓글 1 + 답글 N). 부모가 카운트 차감. */
  onCommentDeleted?: (removed: number) => void;
  /**
   * 댓글 작성자 아바타/이름 클릭 시 호출. 채널 페이지로 이동.
   * 호출자가 ProductDetail/DiscoveryFeed 등에서 자체 닫고 채널 라우팅.
   */
  onViewCreator?: (creatorId: string) => void;
  // 특정 댓글로 스크롤+하이라이트 (관리자 딥링크 ?video=id&comment={commentId})
  targetCommentId?: string;
  // 모바일: 바텀시트, 데스크탑: 사이드패널
  mode?: "sheet" | "panel";
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
      className={`relative rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold overflow-hidden`}
    >
      {/* 이니셜(아래) + 사진(위) — 구글사진 핫링크 대비 no-referrer, 실패 시 onError 로 숨겨 이니셜 노출 */}
      <span style={{ fontSize: size * 0.4 }}>{getInitials(name)}</span>
      {src && (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
    </div>
  );
}

// CommentItem 은 모듈 스코프 컴포넌트로 분리한다. CommentPanel 내부에 정의하면 부모가 렌더될
// 때마다 새 함수(=새 컴포넌트 타입)가 되어 댓글 목록 전체가 리마운트됨 → 메인 입력 타이핑마다
// 진입 애니메이션 깜빡임 + 인라인 수정 상태(editing/draft) 소실. ctx 로 부모 핸들러/상태를 주입해
// 안정된 컴포넌트 식별자를 유지한다(로직·JSX 는 이전 인라인판과 동일).
interface CommentItemCtx {
  user: { id: string } | null | undefined;
  videoCreatorId?: string;
  isVideoOwner: boolean;
  isAuthenticated: boolean;
  isKo: boolean;
  t: (key: string, opts?: any) => string;
  creatorInfo: Record<string, { name?: string; avatar?: string | null } | undefined>;
  likedComments: Set<string>;
  openMenu: string | null;
  setOpenMenu: (v: string | null) => void;
  onViewCreator?: (creatorId: string) => void;
  setReplyTo: (v: { id: string; name: string } | null) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  setReportTarget: (v: { id: string; name: string } | null) => void;
  setComments: Dispatch<SetStateAction<Comment[]>>;
  blockUser: (userId: string, name: string) => void;
  handleLike: (commentId: string) => void;
  handleTogglePin: (commentId: string) => void;
  handleToggleHeart: (commentId: string, parentId?: string) => void;
  handleDelete: (commentId: string, parentId?: string) => void;
  handleBlockUser: (targetUserId: string, name: string) => void;
  highlightId?: string | null;
}

function CommentItemView({ comment, isReply = false, parentId, ctx }: { comment: Comment; isReply?: boolean; parentId?: string; ctx: CommentItemCtx }) {
  const {
    user, videoCreatorId, isVideoOwner, isAuthenticated, isKo, t, creatorInfo, likedComments,
    openMenu, setOpenMenu, onViewCreator, setReplyTo, inputRef, setReportTarget, setComments,
    blockUser, handleLike, handleTogglePin, handleToggleHeart, handleDelete, handleBlockUser, highlightId,
  } = ctx;
  const isMine = user?.id === comment.user_id;
  const isCommentByCreator = !!videoCreatorId && comment.user_id === videoCreatorId;
  const canCreatorBlock = isVideoOwner && !isCommentByCreator;
  const showMenu = !isMine && isAuthenticated; // 본인 댓글 아니고 로그인 시 메뉴 노출
  const menuOpen = openMenu === comment.id;
  // 표시 이름은 프로필 display_name(라이브 해석, 크리에잇) 우선 → 없으면 저장된 author_name 폴백.
  //   저장값은 작성 시점 user_metadata.name(예: crebiz크레비즈)이라 프로필명과 어긋날 수 있음.
  const displayName = creatorInfo[comment.user_id]?.name ?? comment.author_name;

  // 본인 댓글 수정 — 상태를 CommentItemView 로컬로 둬서 타이핑 중 패널 리렌더 방지
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [savingEdit, setSavingEdit] = useState(false);

  const saveEdit = async () => {
    const newContent = draft.trim();
    if (!newContent || newContent === comment.content) {
      setEditing(false);
      setDraft(comment.content);
      return;
    }
    setSavingEdit(true);
    const { data, error } = await supabase
      .from("comments")
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq("id", comment.id)
      .select("id, is_hidden")
      .single();
    setSavingEdit(false);
    if (error || !data) {
      toast.error(t("commentPanel.postFailed"));
      return;
    }
    // 자동 필터에 걸려 숨김된 경우 — 목록에서 제거 + 안내
    if ((data as any).is_hidden) {
      toast.error(t("comment.filtered"));
      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: (c.replies || []).filter((r) => r.id !== comment.id) }
              : c
          )
        );
      } else {
        setComments((prev) => prev.filter((c) => c.id !== comment.id));
      }
      return;
    }
    setComments((prev) =>
      prev.map((c) => {
        if (!parentId && c.id === comment.id) return { ...c, content: newContent };
        if (parentId && c.id === parentId) {
          return {
            ...c,
            replies: (c.replies || []).map((r) =>
              r.id === comment.id ? { ...r, content: newContent } : r
            ),
          };
        }
        return c;
      })
    );
    setEditing(false);
  };

  return (
    <motion.div
      id={`comment-${comment.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 scroll-mt-4 ${isReply ? "ml-10 mt-2" : ""} ${comment.is_pinned ? "bg-[#6366f1]/5 -mx-4 px-4 py-2 rounded-lg" : ""} ${comment.id === highlightId ? "ring-2 ring-[#818cf8] bg-[#818cf8]/10 rounded-xl px-2 py-1 transition-all duration-500" : ""}`}
    >
      {onViewCreator ? (
        <button
          onClick={() => onViewCreator(comment.user_id)}
          className="flex-shrink-0 hover:opacity-80 transition-opacity"
          aria-label={displayName}
        >
          <Avatar
            name={displayName}
            src={creatorInfo[comment.user_id]?.avatar ?? undefined}
            size={isReply ? 28 : 36}
          />
        </button>
      ) : (
        <Avatar
          name={displayName}
          src={creatorInfo[comment.user_id]?.avatar ?? undefined}
          size={isReply ? 28 : 36}
        />
      )}
      <div className="flex-1 min-w-0">
        {comment.is_pinned && !isReply && (
          <div className="flex items-center gap-1 text-[11px] text-[#8b5cf6] font-bold mb-1">
            <Pin className="w-3 h-3" />
            {t("commentPanel.pinned")}
          </div>
        )}
        <div className="flex items-baseline gap-2 flex-wrap">
          {onViewCreator ? (
            <button
              onClick={() => onViewCreator(comment.user_id)}
              className="text-sm font-semibold text-white hover:text-[#a78bfa] transition-colors"
            >
              {displayName}
            </button>
          ) : (
            <span className="text-sm font-semibold text-white">{displayName}</span>
          )}
          {isCommentByCreator && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
              {t("mypage.account.creator")}
            </span>
          )}
          <span className="text-xs text-gray-500">{timeAgo(comment.created_at, isKo)}</span>
        </div>
        {editing ? (
          <div className="mt-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              rows={2}
              autoFocus
              className="w-full bg-white/5 border border-[#6366f1]/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-[#6366f1] transition-colors"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={saveEdit}
                disabled={savingEdit || !draft.trim()}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white disabled:opacity-40 flex items-center gap-1"
              >
                {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
                {t("common.save")}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(comment.content); }}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-300 mt-0.5 leading-relaxed break-words">{comment.content}</p>
        )}
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
            <span title={t("commentPanel.creatorHearted")} className="relative inline-flex items-center">
              <Heart className="w-3.5 h-3.5 fill-pink-500 text-pink-500" />
            </span>
          )}

          {!isReply && (
            <button
              onClick={() => {
                setReplyTo({ id: comment.id, name: displayName });
                inputRef.current?.focus();
              }}
              className="text-xs text-gray-500 hover:text-[#8b5cf6] transition-colors"
            >
              {t("commentPanel.reply")}
            </button>
          )}

          {/* 영상 작성자 액션: 핀 (대댓글 제외) / 하트 / 차단 */}
          {isVideoOwner && !isReply && !isCommentByCreator && (
            <button
              onClick={() => handleTogglePin(comment.id)}
              className={`flex items-center gap-1 text-xs transition-colors ${
                comment.is_pinned ? "text-[#8b5cf6]" : "text-gray-500 hover:text-[#8b5cf6]"
              }`}
              title={comment.is_pinned ? t("commentPanel.unpin") : t("commentPanel.pin")}
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
              title={comment.creator_hearted ? t("commentPanel.unheart") : t("commentPanel.heart")}
            >
              <Heart className={`w-3.5 h-3.5 ${comment.creator_hearted ? "fill-pink-500" : ""}`} />
            </button>
          )}

          {isMine && !editing && (
            <button
              onClick={() => { setDraft(comment.content); setEditing(true); }}
              className="text-xs text-gray-600 hover:text-[#8b5cf6] transition-colors flex items-center gap-0.5"
            >
              <Pencil className="w-3 h-3" />
              {t("common.edit")}
            </button>
          )}
          {isMine && (
            <button
              onClick={() => handleDelete(comment.id, parentId)}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors flex items-center gap-0.5"
            >
              <Trash2 className="w-3 h-3" />
              {t("common.delete")}
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
                title={t("creatorChannel.more")}
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
                      setReportTarget({ id: comment.id, name: displayName });
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-amber-400 transition-colors flex items-center gap-2"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {t("comment.reportComment")}
                  </button>
                  <button
                    onClick={() => {
                      setOpenMenu(null);
                      blockUser(comment.user_id, displayName);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-red-400 transition-colors flex items-center gap-2"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    {t("commentPanel.block")}
                  </button>
                  {canCreatorBlock && (
                    <button
                      onClick={() => {
                        setOpenMenu(null);
                        handleBlockUser(comment.user_id, displayName);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-red-400 transition-colors flex items-center gap-2 border-t border-white/5 mt-1 pt-2"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {t("commentPanel.blockHere")}
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
}

// 댓글 페이지 크기 — 기존 .limit(50) 하드캡은 51번째부터 영구 미노출이었음(2026-07-21)
const COMMENTS_PAGE = 30;
// 대댓글 페이지 크기 — 기존엔 최상위 전체의 대댓글을 .in() 으로 **무제한** 한 번에 받아왔다.
//   이제 '펼치기' 한 부모의 답글만 페이지 단위로 가져온다.
const REPLIES_PAGE = 20;

export function CommentPanel({ videoId, postId, title, videoCreatorId, onClose, onCommentPosted, onCommentDeleted, onViewCreator, targetCommentId, mode = "sheet" }: CommentPanelProps) {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language?.startsWith("ko");
  const { user, isAuthenticated, profile } = useAuth();
  const { seedComments, bumpComments } = useLikes();
  const isVideoOwner = !!(videoId && videoCreatorId && user?.id === videoCreatorId);

  // 영상 댓글 총계를 정확히 세어 전역 스토어에 seed-once → 모든 피드의 "댓글 N" 통일
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("video_id", videoId)
        .is("parent_id", null)
        .eq("is_hidden", false);
      if (!cancelled && typeof count === "number") seedComments(videoId, count);
    })();
    return () => { cancelled = true; };
  }, [videoId, seedComments]);

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
  const [hasMore, setHasMore] = useState(false);            // 최상위 댓글 다음 페이지 존재
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverTotal, setServerTotal] = useState(0);        // 헤더 "댓글 N"(서버 집계 — 페이지와 무관)
  const [repliesLoading, setRepliesLoading] = useState<Set<string>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const { isBlocked, blockUser } = useBlockedUsers();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const deletingRef = useRef<Set<string>>(new Set());   // 삭제 in-flight 가드(더블탭 이중 차감 방지)
  const fetchIdRef = useRef(0);                          // fetch 경쟁 방지(늦게 온 stale 응답 폐기)

  // 내 좋아요 상태를 주어진 id 들에 대해 조회해 기존 집합에 합침(페이지·답글 로드마다 호출)
  const mergeMyLikes = useCallback(async (ids: string[]) => {
    if (!isAuthenticated || ids.length === 0) return;
    const { data: liked } = await supabase.rpc("get_my_comment_likes", { p_comment_ids: ids });
    if (liked) setLikedComments((prev) => new Set([...prev, ...(liked as any[]).map((row) => row.comment_id)]));
  }, [isAuthenticated]);

  // 최상위 댓글 한 페이지. 대댓글은 **개수만**(임베드 집계) 받고 본문은 펼칠 때 가져온다.
  //   기존엔 페이지의 모든 부모에 대해 .in("parent_id", ids) 로 답글을 무제한 선로드했다.
  const fetchPage = useCallback(async (offset: number) => {
    const cols = "id, user_id, video_id, post_id, parent_id, content, likes_count, created_at, author_name, is_pinned, creator_hearted, is_hidden";
    let q = supabase
      .from("comments")
      .select(cols + ", replies:comments!parent_id(count)")
      .is("parent_id", null)
      .eq("is_hidden", false)
      .eq("replies.is_hidden", false)   // 숨김 답글은 개수에서 제외
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")                      // tiebreaker: 동시각 댓글 페이지 경계 안정
      .range(offset, offset + COMMENTS_PAGE - 1);
    if (videoId) q = q.eq("video_id", videoId);
    else if (postId) q = q.eq("post_id", postId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((c: any) => ({
      ...c,
      author_name: c.author_name || t("community.anonymous"),
      replies: [],
      replyCount: Number(c.replies?.[0]?.count) || 0,
    })) as Comment[];
  }, [videoId, postId, t]);

  // 헤더 "댓글 N" — 목록이 페이지 단위라 화면에서 셀 수 없어 서버 집계로 받는다.
  //   영상 배지 = 최상위만 / 커뮤니티 배지 = 답글 포함 (기존 totalCount 규칙 유지)
  const fetchTotal = useCallback(async () => {
    let q = supabase.from("comments").select("id", { count: "exact", head: true }).eq("is_hidden", false);
    if (videoId) q = q.eq("video_id", videoId).is("parent_id", null);
    else if (postId) q = q.eq("post_id", postId);
    const { count } = await q;
    return count ?? 0;
  }, [videoId, postId]);

  const fetchComments = useCallback(async () => {
    const myId = ++fetchIdRef.current;   // 이 fetch 세션 id — 늦게 온 응답이 최신 상태를 덮지 않게
    setLoading(true);
    try {
      const [rows, total] = await Promise.all([fetchPage(0), fetchTotal()]);
      if (myId !== fetchIdRef.current) return;   // 그 사이 videoId/postId 전환 → 이 응답 폐기
      setComments(rows);
      setServerTotal(total);
      setHasMore(rows.length === COMMENTS_PAGE);
      setExpandedReplies(new Set());   // 대상 전환 시 펼침 초기화
      setLikedComments(new Set());
      await mergeMyLikes(rows.map((c) => c.id));
    } catch (err) {
      console.error("[CommentPanel] fetch error:", err);
      if (myId === fetchIdRef.current) { setComments([]); setHasMore(false); }
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }, [fetchPage, fetchTotal, mergeMyLikes]);

  // 최상위 더 보기 — 새 댓글이 위에 끼면 offset 이 밀리므로 id 로 dedup
  const loadMoreComments = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchPage(comments.length);
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...next.filter((c) => !seen.has(c.id))];
      });
      setHasMore(next.length === COMMENTS_PAGE);
      await mergeMyLikes(next.map((c) => c.id));
    } catch {
      setHasMore(false);   // 실패 시 반응 없는 버튼이 남지 않게
    } finally {
      setLoadingMore(false);
    }
  };

  // 한 부모의 답글만 페이지 단위로 로드(펼칠 때 / '답글 더 보기')
  const loadReplies = useCallback(async (parentId: string) => {
    if (repliesLoading.has(parentId)) return;
    setRepliesLoading((prev) => new Set([...prev, parentId]));
    try {
      const offset = comments.find((c) => c.id === parentId)?.replies?.length || 0;
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, parent_id, content, likes_count, created_at, author_name, creator_hearted, is_hidden")
        .eq("parent_id", parentId)
        .eq("is_hidden", false)
        .order("created_at", { ascending: true })
        .order("id")
        .range(offset, offset + REPLIES_PAGE - 1);
      if (error) throw error;
      const rows = (data || []).map((r: any) => ({ ...r, author_name: r.author_name || t("community.anonymous") })) as Comment[];
      setComments((prev) => prev.map((c) => {
        if (c.id !== parentId) return c;
        const seen = new Set((c.replies || []).map((r) => r.id));
        return { ...c, replies: [...(c.replies || []), ...rows.filter((r) => !seen.has(r.id))] };
      }));
      await mergeMyLikes(rows.map((r) => r.id));
    } catch (err) {
      console.warn("[CommentPanel] 답글 조회 실패:", err);
    } finally {
      setRepliesLoading((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    }
  }, [comments, repliesLoading, mergeMyLikes, t]);

  // 답글 펼치기/접기 — 처음 펼칠 때 서버에서 로드
  const toggleReplies = useCallback((parentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
    const parent = comments.find((c) => c.id === parentId);
    if (parent && (parent.replies?.length || 0) === 0 && (parent.replyCount || 0) > 0) void loadReplies(parentId);
  }, [comments, loadReplies]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // 관리자 딥링크(?video=id&comment={id}) — 로드 완료 후 해당 댓글로 스크롤 + 하이라이트.
  //   타겟이 답글이면 부모를 먼저 펼쳐 DOM 에 렌더시킨 뒤 스크롤. 못 찾으면(페이지네이션·삭제) 무동작.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const scrolledToRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !targetCommentId || comments.length === 0) return;
    if (scrolledToRef.current === targetCommentId) return;   // 타겟당 1회만
    // 대댓글은 지연 로드라 아직 안 받았을 수 있음 → 타겟이 화면에 없으면 서버에서 부모를 조회해 펼친다.
    //   (기존엔 답글이 전량 선로드돼 있어 로컬 탐색만으로 됐음)
    const loadedParent = comments.find((c) => c.replies?.some((r) => r.id === targetCommentId));
    if (loadedParent) {
      setExpandedReplies((prev) => (prev.has(loadedParent.id) ? prev : new Set([...prev, loadedParent.id])));
    } else if (!comments.some((c) => c.id === targetCommentId)) {
      // 최상위도 아니고 로드된 답글도 아님 → 답글일 가능성. 부모를 물어보고 그 부모가 이 페이지에 있으면 펼침.
      void (async () => {
        const { data } = await supabase.from("comments").select("parent_id").eq("id", targetCommentId).maybeSingle();
        const pid = (data as any)?.parent_id;
        if (!pid) return;                                   // 삭제됐거나 최상위 → 무동작(기존과 동일)
        if (!comments.some((c) => c.id === pid)) return;     // 부모가 아직 페이지 밖 → 무동작(기존과 동일)
        setExpandedReplies((prev) => (prev.has(pid) ? prev : new Set([...prev, pid])));
        await loadReplies(pid);
      })();
    }
    const timer = setTimeout(() => {
      const el = document.getElementById(`comment-${targetCommentId}`);
      if (!el) return;   // 아직 미렌더/미로드 → comments 변화 시 재시도
      scrolledToRef.current = targetCommentId;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(targetCommentId);
      setTimeout(() => setHighlightId((cur) => (cur === targetCommentId ? null : cur)), 2600);
    }, 220);   // 답글 펼침 리렌더 반영 대기
    return () => clearTimeout(timer);
  }, [loading, targetCommentId, comments]);

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
      toast.error(t("comment.loginToComment"));
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        user_id: user!.id,
        author_name: profile?.display_name || user!.name || t("community.anonymous"),
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
        toast.error(t("comment.filtered"));
        setText("");
        setReplyTo(null);
        return;
      }

      const newComment: Comment = {
        ...inserted,
        // 낙관적 표시명도 payload(위)와 동일한 익명 폴백을 둔다 — display_name·name 이 모두 비면
        //   author_name 이 undefined 가 되어 getInitials(undefined) 가 크래시하던 것 방지.
        author_name: profile?.display_name || user!.name || t("community.anonymous"),
        replies: [],
      };

      if (replyTo) {
        // 아직 답글을 안 받은 부모면 먼저 로드해야 새 답글만 덩그러니 보이지 않는다
        const parentState = comments.find((c) => c.id === replyTo.id);
        if (parentState && (parentState.replies?.length || 0) === 0 && (parentState.replyCount || 0) > 0) {
          await loadReplies(replyTo.id);
        }
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo.id
              ? { ...c, replies: [...(c.replies || []), newComment], replyCount: (c.replyCount || 0) + 1 }
              : c
          )
        );
        setExpandedReplies((prev) => new Set([...prev, replyTo.id]));
        setServerTotal((n) => (postId ? n + 1 : n));   // 커뮤니티 배지는 답글 포함

        // Phase 34 — 원댓글 작성자에게 답글 알림 메일 (fire-and-forget)
        try {
          const parentComment = comments.find((c) => c.id === replyTo.id);
          if (parentComment && parentComment.user_id && parentComment.user_id !== user!.id) {
            const { subject, html } = buildCommentReplyEmail({
              replyAuthorName: user!.name || t("community.anonymous"),
              parentCommentContent: parentComment.content,
              replyContent: text.trim(),
              videoId: videoId || undefined,
            });
            void sendNotification({
              user_id: parentComment.user_id,
              type: "comment_reply",
              // to 생략 — Edge Function이 user_id로 자동 조회
              subject,
              html,
              // 벨/푸시 클릭 시 해당 영상(+댓글창) 또는 커뮤니티 글로 직행 (R9, 2026-06-11)
              link: videoId
                ? `/?video=${encodeURIComponent(videoId)}&comment=1`
                : postId
                ? `/?tab=community&sub=posts&post=${encodeURIComponent(postId)}`
                : undefined,
            });
          }
        } catch (mailErr) {
          console.warn("[CommentPanel] 답글 알림 메일 실패:", mailErr);
        }
      } else {
        setComments((prev) => [newComment, ...prev]);
        // 최상위 댓글만 피드의 "댓글 N" 에 반영(+1). 답글은 미집계.
        if (videoId) bumpComments(videoId, 1);
      }

      onCommentPosted?.();
      setText("");
      setReplyTo(null);
    } catch (err: any) {
      toast.error(t("commentPanel.postFailed"));
      console.error("[CommentPanel] submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string, parentId?: string) => {
    if (deletingRef.current.has(commentId)) return;   // 더블탭 중복 삭제 방지(bumpComments 이중 -1 차단)
    deletingRef.current.add(commentId);
    try {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
      // 제거 개수: 답글이면 1, 최상위면 1 + (DB cascade 로 함께 삭제되는 답글 수)
      let removed = 1;
      if (parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? { ...c, replies: (c.replies || []).filter(r => r.id !== commentId),
                replyCount: Math.max(0, (c.replyCount || 0) - 1) }
            : c
        ));
        setServerTotal(n => (postId ? Math.max(0, n - 1) : n));
      } else {
        const target = comments.find(c => c.id === commentId);
        // 답글은 지연 로드라 replies.length 가 0 일 수 있음 → 서버 집계(replyCount)로 계산해야
        //   cascade 삭제된 답글 수가 피드 카운트에 정확히 반영된다
        removed = 1 + (target?.replyCount ?? target?.replies?.length ?? 0);
        setComments(prev => prev.filter(c => c.id !== commentId));
        setServerTotal(n => Math.max(0, n - (postId ? removed : 1)));
        // 최상위 댓글 삭제만 피드 카운트 -1 (답글 삭제는 top-level 수 불변)
        if (videoId) bumpComments(videoId, -1);
      }
      onCommentDeleted?.(removed);
    } catch {
      toast.error(t("commentPanel.deleteFailed"));
    } finally {
      deletingRef.current.delete(commentId);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!isAuthenticated) {
      toast.error(t("auth.loginRequired"));
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
      toast.error(t("productDetail.toast.likeFailed"));
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
      toast.error(t("commentPanel.pinFailed"));
      return;
    }
    const newPinned = !!data;
    toast.success(newPinned ? t("commentPanel.pinned") : t("commentPanel.unpin"));
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
      toast.error(t("commentPanel.heartFailed"));
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
    if (!confirm(t("commentPanel.confirmBlock", { name }))) return;
    const { error } = await supabase.rpc("creator_block_user", {
      p_target_user_id: targetUserId,
      p_reason: "Blocked from comment panel",
    });
    if (error) {
      toast.error(t("commentPanel.blockFailed"));
      return;
    }
    toast.success(t("commentPanel.blockSuccess"));
    fetchComments();
  };

  // Phase 24: 차단한 사용자 댓글/대댓글 자동 숨김 (본인 화면에서만)
  const visibleComments = comments
    .filter((c) => !isBlocked(c.user_id))
    .map((c) => ({
      ...c,
      replies: (c.replies || []).filter((r) => !isBlocked(r.user_id)),
    }));

  // 헤더 "댓글 N" 을 각 컨텍스트의 피드 배지와 같은 의미로 맞춘다(불일치 해소):
  //   · 영상 배지 = 최상위만(seedComments·bumpComments·DiscoveryFeed 전부 parent_id null 기준) → 답글 제외.
  //   · 커뮤니티 배지 = 트리거가 답글 포함 전체 재계산 → 답글 포함.
  // 목록이 페이지 단위라 화면에서 세면 "이 페이지까지의 수"가 된다 → 서버 집계 사용.
  //   (차단 사용자 제외분은 반영되지 않지만, 기존엔 50건 상한 때문에 어차피 부정확했다)
  const totalCount = serverTotal;

  // CommentItemView(모듈 스코프)에 주입할 핸들러/상태 번들 — 인라인 재정의 제거로 리마운트 방지.
  // (매 렌더 새 객체지만 컴포넌트 타입은 고정 → 리렌더는 되어도 언마운트/리마운트는 안 일어남)
  const itemCtx: CommentItemCtx = {
    user, videoCreatorId, isVideoOwner, isAuthenticated, isKo, t, creatorInfo, likedComments,
    openMenu, setOpenMenu, onViewCreator, setReplyTo, inputRef, setReportTarget, setComments,
    blockUser, handleLike, handleTogglePin, handleToggleHeart, handleDelete, handleBlockUser, highlightId,
  };

  const containerClass =
    mode === "panel"
      ? "flex flex-col h-full bg-[#111] border-l border-white/10 w-80"
      : "flex flex-col h-full bg-[#111] rounded-t-2xl";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-5 h-5 text-[#8b5cf6] flex-shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-white">
              {t("commentPanel.title")} {!loading && totalCount > 0 ? totalCount : ""}
            </span>
            {/* 어떤 글/영상의 댓글인지 맥락 표시 (caller 가 title 을 넘김 — 이전엔 destructure 누락으로 사장) */}
            {title && <p className="text-[11px] text-gray-500 truncate leading-tight max-w-[220px]">{title}</p>}
          </div>
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
            <p className="text-gray-500 text-sm">{t("commentPanel.empty")}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleComments.map((comment) => (
              <div key={comment.id}>
                <CommentItemView comment={comment} ctx={itemCtx} />

                {/* 답글 토글 — 개수는 서버 집계(replyCount), 본문은 펼칠 때 로드 */}
                {(comment.replyCount || 0) > 0 && (
                  <div className="ml-10 mt-1.5">
                    <button
                      onClick={() => toggleReplies(comment.id)}
                      className="flex items-center gap-1 text-xs text-[#8b5cf6] hover:text-[#a78bfa] transition-colors"
                    >
                      {expandedReplies.has(comment.id) ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      {t("commentPanel.reply")} {comment.replyCount}
                      {repliesLoading.has(comment.id) && <Loader2 className="w-3 h-3 animate-spin ml-0.5" />}
                    </button>
                    <AnimatePresence>
                      {expandedReplies.has(comment.id) &&
                        (comment.replies || []).map((reply) => (
                          <CommentItemView key={reply.id} comment={reply} isReply parentId={comment.id} ctx={itemCtx} />
                        ))}
                    </AnimatePresence>
                    {/* 답글이 페이지 크기를 넘으면 이어서 로드 */}
                    {expandedReplies.has(comment.id)
                      && (comment.replies?.length || 0) > 0
                      && (comment.replies?.length || 0) < (comment.replyCount || 0) && (
                      <button
                        onClick={() => void loadReplies(comment.id)}
                        disabled={repliesLoading.has(comment.id)}
                        className="mt-1 text-[11px] text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
                      >
                        {t("common.more")} ({comment.replies?.length}/{comment.replyCount})
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </AnimatePresence>
        )}
        {/* 댓글 더 보기 — 기존 50건 하드캡으로 오래된 댓글이 영구 매몰되던 문제 해소(2026-07-21) */}
        {!loading && hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={() => void loadMoreComments()}
              disabled={loadingMore}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t("common.more")}
            </button>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
        {replyTo && (
          <div className="flex items-center justify-between text-xs text-[#8b5cf6] mb-2 bg-[#6366f1]/10 px-3 py-1.5 rounded-lg">
            <span>{t("commentPanel.replyTo", { name: `@${replyTo.name}` })}</span>
            <button onClick={() => setReplyTo(null)} className="hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-center">
          {user && <Avatar name={profile?.display_name || user.name} src={profile?.avatar_url ?? undefined} size={36} />}
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
              placeholder={isAuthenticated ? t("commentPanel.placeholder") : t("commentPanel.loginToComment")}
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
        targetTitle={reportTarget ? reportTarget.name : undefined}
        onClose={() => setReportTarget(null)}
      />
    </div>
  );
}
