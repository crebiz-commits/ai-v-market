import { motion } from "motion/react";
import { UserAvatar } from "./UserAvatar";
import { ArrowLeft, Heart, MessageCircle, Bookmark, Send, Share2, Flag, Pencil, Trash2, Play, Copy, Megaphone, Terminal } from "lucide-react";
import { toast } from "sonner";
import { CommentPanel } from "./CommentPanel";
import { ReportModal } from "./ReportModal";
import { useBackButton } from "../hooks/useBackButton";
import { useAuth } from "../contexts/AuthContext";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export interface Post {
  id: string;
  ownerId?: string;        // 작성자 user_id (본인 글 수정·삭제 판별)
  author: string;
  avatar: string;
  title: string;
  content: string;
  category: string;
  likes: number;
  comments: number;
  timestamp: string;
  image?: string;
  isNotice?: boolean;      // 공지 (어드민 등록, 목록 상단 고정)
  videoId?: string;        // 임베드한 내 영상
  videoTitle?: string;
  videoThumbnail?: string;
  promptText?: string;     // 프롬프트 공유 (복사 가능 블록)
}

const CATEGORY_COLOR: Record<string, string> = {
  "챌린지": "bg-[#8b5cf6]/20 text-[#8b5cf6]",
  "팁": "bg-[#3b82f6]/20 text-[#3b82f6]",
  "프롬프트": "bg-[#10b981]/20 text-[#10b981]",
  "튜토리얼": "bg-[#f59e0b]/20 text-[#f59e0b]",
  "비교": "bg-[#ef4444]/20 text-[#ef4444]",
  "일반": "bg-[#6366f1]/20 text-[#6366f1]",
  "질문": "bg-[#06b6d4]/20 text-[#06b6d4]",
};

const COMMUNITY_CATEGORY_KEY: Record<string, string> = {
  "팁": "communityCategory.tip",
  "챌린지": "communityCategory.challenge",
  "비교": "communityCategory.compare",
  "프롬프트": "communityCategory.prompt",
  "튜토리얼": "communityCategory.tutorial",
  "일반": "communityCategory.general",
  "질문": "communityCategory.question",
};

interface CommunityPostDetailProps {
  post: Post;
  isLiked: boolean;
  isBookmarked: boolean;
  onLike: () => void;
  onBookmark: () => void;
  onClose: () => void;
  onEdit?: () => void;                       // 본인 글 수정 (글쓰기 모달 재사용)
  onDelete?: () => void;                     // 본인 글 삭제
  onPlayVideo?: (videoId: string) => void;   // 임베드 영상 재생
  onCommentCountChange?: (delta: number) => void;   // 댓글 ±N → 목록 카운트 갱신(작성 +1 / 삭제 -removed)
}

export function CommunityPostDetail({
  post,
  isLiked,
  isBookmarked,
  onLike,
  onBookmark,
  onClose,
  onEdit,
  onDelete,
  onPlayVideo,
  onCommentCountChange,
}: CommunityPostDetailProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isMine = !!post.ownerId && user?.id === post.ownerId;
  const [showComments, setShowComments] = useState(false);
  const [showReport, setShowReport] = useState(false);  // M7: 커뮤니티 글 신고

  const handleCopyPrompt = async () => {
    if (!post.promptText) return;
    try {
      await navigator.clipboard.writeText(post.promptText);
      toast.success(t("communityPostDetail.promptCopied"));
    } catch {
      toast.error(t("shareModal.copyFailed"));
    }
  };

  // 뒤로가기로 댓글 패널/신고 모달 → 상세 페이지 → 목록 순서로 닫힘
  useBackButton(showComments, () => setShowComments(false));
  useBackButton(showReport, () => setShowReport(false));   // 신고 모달도 하드웨어 백으로 닫기(없으면 상세가 통째로 닫히던 것)

  const handleShare = async () => {
    // R3(2026-06-11): App.tsx 딥링크 핸들러와 일치하는 표준 형식 (단축형 ?post= 도 지원됨)
    const url = `${window.location.origin}/?tab=community&sub=posts&post=${post.id}`;
    const shareData = { title: post.title, text: `CREAITE Community: ${post.title}`, url };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t("shareModal.linkCopied"));
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(url);
          toast.success(t("shareModal.linkCopied"));
        } catch {
          toast.error(t("shareModal.copyFailed"));
        }
      }
    }
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-0 bg-background z-[60] overflow-y-auto"
    >
      {/* 헤더 */}
      <header className="sticky top-0 bg-background/90 backdrop-blur-xl z-10 border-b border-white/10">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 transition-colors text-white"
            aria-label={t("creatorChannel.back")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold">{t("community.tabPosts")}</span>
          <div className="flex-1" />
          {isMine && onEdit && (
            <button
              onClick={onEdit}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
              aria-label={t("common.edit", "수정")}
            >
              <Pencil className="w-5 h-5" />
            </button>
          )}
          {isMine && onDelete && (
            <button
              onClick={onDelete}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-red-400"
              aria-label={t("common.delete")}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => { if (!user) { toast.error(t("auth.loginRequired")); return; } setShowReport(true); }}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t("common.report", "신고")}
          >
            <Flag className="w-5 h-5" />
          </button>
          <button
            onClick={handleShare}
            className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors text-foreground"
            aria-label={t("common.share")}
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 본문 */}
      <article className="max-w-2xl mx-auto px-4 md:px-6 py-6 pb-40">
        {/* 작성자 정보 */}
        <div className="flex items-center gap-3 mb-5">
          <UserAvatar src={post.avatar} name={post.author === "CREAITE 운영팀" ? t("community.officialTeam") : post.author} className="w-12 h-12" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{post.author === "CREAITE 운영팀" ? t("community.officialTeam") : post.author}</p>
            <p className="text-xs text-muted-foreground">{post.timestamp}</p>
          </div>
          {post.isNotice && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#f59e0b]/20 text-[#fbbf24] border border-[#f59e0b]/30">
              <Megaphone className="w-3 h-3" />
              {t("community.noticeBadge")}
            </span>
          )}
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${CATEGORY_COLOR[post.category] || "bg-[#6366f1]/20 text-[#6366f1]"}`}>
            {COMMUNITY_CATEGORY_KEY[post.category] ? t(COMMUNITY_CATEGORY_KEY[post.category]) : post.category}
          </span>
        </div>

        {/* 제목 */}
        <h1 className="text-2xl md:text-3xl font-extrabold mb-5 leading-tight text-foreground">
          {post.title}
        </h1>

        {/* 본문 */}
        <div className="text-base leading-relaxed whitespace-pre-line mb-6 text-foreground/90">
          {post.content}
        </div>

        {/* 프롬프트 블록 (복사 가능) */}
        {post.promptText && (
          <div className="mb-6 rounded-2xl border border-[#10b981]/30 bg-[#10b981]/5 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#10b981]/10 border-b border-[#10b981]/20">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#34d399]">
                <Terminal className="w-3.5 h-3.5" />
                {t("communityCategory.prompt")}
              </span>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#34d399] hover:bg-[#10b981]/20 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {t("common.copy")}
              </button>
            </div>
            <pre className="px-4 py-3 text-sm text-[#a7f3d0] font-mono whitespace-pre-wrap break-words leading-relaxed">{post.promptText}</pre>
          </div>
        )}

        {/* 임베드 영상 */}
        {post.videoId && (
          <button
            onClick={() => onPlayVideo?.(post.videoId!)}
            className="group relative w-full rounded-2xl mb-6 border border-white/10 overflow-hidden bg-black/40 text-left"
          >
            <div className="relative aspect-video">
              {post.videoThumbnail ? (
                <img src={post.videoThumbnail} alt={post.videoTitle || post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play className="w-10 h-10 text-muted-foreground/40" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <span className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                </span>
              </div>
            </div>
            {post.videoTitle && (
              <p className="px-4 py-2.5 text-sm font-medium text-foreground truncate">🎬 {post.videoTitle}</p>
            )}
          </button>
        )}

        {/* 이미지 */}
        {post.image && (
          <img
            src={post.image}
            alt={post.title}
            className="w-full rounded-2xl mb-6 border border-white/10"
          />
        )}

        {/* 인터랙션 통계 */}
        <div className="flex items-center gap-5 py-4 border-y border-white/10 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Heart className="w-4 h-4" />
            <span>{post.likes} {t("common.like")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4" />
            <span>{post.comments} {t("common.comment")}</span>
          </div>
        </div>

        {/* 댓글 보기 버튼 */}
        <button
          onClick={() => setShowComments(true)}
          className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-4 h-4" />
          {t("common.comment")}
        </button>
      </article>

      {/* 하단 액션 바 (sticky) */}
      <footer className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur-xl border-t border-white/10 z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <button
            onClick={onLike}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
              isLiked
                ? "bg-red-500/20 text-red-400"
                : "hover:bg-white/10 text-muted-foreground hover:text-foreground"
            }`}
            aria-label={t("common.like")}
          >
            <Heart className={`w-5 h-5 ${isLiked ? "fill-red-400" : ""}`} />
            <span className="text-sm font-medium">{post.likes}</span>
          </button>
          <button
            onClick={() => setShowComments(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t("common.comment")}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm font-medium">{post.comments}</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={onBookmark}
            className={`p-2.5 rounded-full transition-colors ${
              isBookmarked
                ? "bg-[#6366f1]/20 text-[#6366f1]"
                : "hover:bg-white/10 text-muted-foreground hover:text-foreground"
            }`}
            aria-label="Bookmark"
          >
            <Bookmark className={`w-5 h-5 ${isBookmarked ? "fill-[#6366f1]" : ""}`} />
          </button>
          <button
            onClick={handleShare}
            className="p-2.5 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            aria-label={t("common.share")}
          >
            <Send className="w-5 h-5 -rotate-12" />
          </button>
        </div>
      </footer>

      {/* 댓글 시트 */}
      {showComments && (
        <>
          <div
            onClick={() => setShowComments(false)}
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
            style={{ height: "75vh" }}
          >
            <CommentPanel
              postId={post.id}
              title={post.title}
              onClose={() => setShowComments(false)}
              onCommentPosted={() => onCommentCountChange?.(1)}
              onCommentDeleted={(removed) => onCommentCountChange?.(-removed)}
              mode="sheet"
            />
          </motion.div>
        </>
      )}

      {/* M7: 커뮤니티 글 신고 */}
      <ReportModal
        open={showReport}
        targetType="community_post"
        targetId={post.id}
        targetTitle={post.title}
        onClose={() => setShowReport(false)}
      />
    </motion.div>
  );
}
