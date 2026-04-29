import { motion } from "motion/react";
import { ArrowLeft, Heart, MessageCircle, Bookmark, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { CommentPanel } from "./CommentPanel";
import { useBackButton } from "../hooks/useBackButton";
import { useState } from "react";

export interface Post {
  id: string;
  author: string;
  avatar: string;
  title: string;
  content: string;
  category: string;
  likes: number;
  comments: number;
  timestamp: string;
  image?: string;
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

interface CommunityPostDetailProps {
  post: Post;
  isLiked: boolean;
  isBookmarked: boolean;
  onLike: () => void;
  onBookmark: () => void;
  onClose: () => void;
}

export function CommunityPostDetail({
  post,
  isLiked,
  isBookmarked,
  onLike,
  onBookmark,
  onClose,
}: CommunityPostDetailProps) {
  const [showComments, setShowComments] = useState(false);

  // 뒤로가기로 댓글 패널 → 상세 페이지 → 목록 순서로 닫힘
  useBackButton(showComments, () => setShowComments(false));

  const handleShare = async () => {
    const url = `${window.location.origin}?post=${post.id}`;
    const shareData = { title: post.title, text: `CREAITE 커뮤니티: ${post.title}`, url };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크가 클립보드에 복사됐습니다!");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("링크가 클립보드에 복사됐습니다!");
        } catch {
          toast.error("공유에 실패했습니다.");
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
      className="fixed inset-0 bg-background z-40 overflow-y-auto"
    >
      {/* 헤더 */}
      <header className="sticky top-0 bg-background/90 backdrop-blur-xl z-20 border-b border-white/10">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors text-foreground"
            aria-label="뒤로가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold">게시글</span>
          <div className="flex-1" />
          <button
            onClick={handleShare}
            className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors text-foreground"
            aria-label="공유"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 본문 */}
      <article className="max-w-2xl mx-auto px-4 md:px-6 py-6 pb-40">
        {/* 작성자 정보 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] overflow-hidden flex-shrink-0 flex items-center justify-center">
            {post.avatar ? (
              <img src={post.avatar} alt={post.author} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold">{post.author.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{post.author}</p>
            <p className="text-xs text-muted-foreground">{post.timestamp}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${CATEGORY_COLOR[post.category] || "bg-[#6366f1]/20 text-[#6366f1]"}`}>
            {post.category}
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
            <span>{post.likes + (isLiked ? 1 : 0)} 좋아요</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4" />
            <span>{post.comments} 댓글</span>
          </div>
        </div>

        {/* 댓글 보기 버튼 */}
        <button
          onClick={() => setShowComments(true)}
          className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-4 h-4" />
          댓글 보기 / 작성하기
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
            aria-label="좋아요"
          >
            <Heart className={`w-5 h-5 ${isLiked ? "fill-red-400" : ""}`} />
            <span className="text-sm font-medium">{post.likes + (isLiked ? 1 : 0)}</span>
          </button>
          <button
            onClick={() => setShowComments(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            aria-label="댓글"
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
            aria-label="북마크"
          >
            <Bookmark className={`w-5 h-5 ${isBookmarked ? "fill-[#6366f1]" : ""}`} />
          </button>
          <button
            onClick={handleShare}
            className="p-2.5 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            aria-label="공유"
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
              mode="sheet"
            />
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
