import { useState } from "react";
import { Lightbulb, Trophy, MessageCircle, Heart, Bookmark, TrendingUp, Plus, X, Send, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";
import { CommentPanel } from "./CommentPanel";
import { CommunityPostDetail, Post } from "./CommunityPostDetail";
import { CommunityChallengeDetail, Challenge } from "./CommunityChallengeDetail";
import { useAuth } from "../contexts/AuthContext";
import { useBackButton } from "../hooks/useBackButton";
import { toast } from "sonner";

const INITIAL_POSTS: Post[] = [
  {
    id: "1",
    author: "AI Creator Pro",
    avatar: "https://images.unsplash.com/photo-1595745688820-1a8bca9dd00f?w=100&h=100&fit=crop",
    title: "Sora로 영화 같은 영상 만드는 프롬프트 팁 5가지",
    content: "1. 카메라 무브먼트를 구체적으로 명시하세요 (dolly zoom, crane shot 등)\n2. 조명 스타일 지정 (cinematic lighting, golden hour)\n3. 감정을 표현하는 형용사 사용...",
    category: "팁",
    likes: 342,
    comments: 28,
    timestamp: "2시간 전",
    image: "https://images.unsplash.com/photo-1612000656409-16fcf948b2d9?w=400&h=300&fit=crop"
  },
  {
    id: "2",
    author: "VideoMaster",
    avatar: "https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=100&h=100&fit=crop",
    title: "3월 챌린지: '미래 도시' 테마 영상 공모",
    content: "상금 총 500만원! Cyberpunk, 네온, 미래 도시를 주제로 15초 이내 AI 영상을 제작해주세요. 우수작은 메인 피드에 노출됩니다.",
    category: "챌린지",
    likes: 891,
    comments: 156,
    timestamp: "1일 전"
  },
  {
    id: "3",
    author: "NatureLover",
    avatar: "https://images.unsplash.com/photo-1551728715-88730314d185?w=100&h=100&fit=crop",
    title: "Runway Gen-3 vs Pika Labs 실사 비교",
    content: "같은 프롬프트로 두 툴을 사용해봤습니다. 결과가 흥미롭네요. Runway는 디테일이 좋고, Pika는 자연스러운 움직임이 장점입니다.",
    category: "비교",
    likes: 567,
    comments: 89,
    timestamp: "3일 전",
    image: "https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=300&fit=crop"
  },
  {
    id: "4",
    author: "PromptWizard",
    avatar: "https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=100&h=100&fit=crop",
    title: "프롬프트 공유: 네온 사이버펑크 도시 야경",
    content: '"Neon-lit cyberpunk city at night, flying cars, holographic billboards, rain-soaked streets, cinematic wide shot, blade runner style, 8k ultra detailed" - 이 프롬프트로 대박 영상 나왔어요!',
    category: "프롬프트",
    likes: 1203,
    comments: 234,
    timestamp: "5일 전"
  },
  {
    id: "5",
    author: "AnimationStudio",
    avatar: "https://images.unsplash.com/photo-1772371272174-392cf9cfabae?w=100&h=100&fit=crop",
    title: "AI 애니메이션 제작 워크플로우 공유",
    content: "캐릭터 디자인 → AI 생성 → 편집 → 후보정까지 전 과정을 공유합니다. 질문 환영합니다!",
    category: "튜토리얼",
    likes: 678,
    comments: 92,
    timestamp: "1주일 전",
    image: "https://images.unsplash.com/photo-1772371272174-392cf9cfabae?w=400&h=300&fit=crop"
  }
];

const getNextDeadline = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

const challenges: Challenge[] = [
  {
    id: "1",
    title: "미래 도시 챌린지",
    prize: "500만원",
    participants: 342,
    deadline: getNextDeadline(15),
    image: "https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=400&h=200&fit=crop",
    description: "Cyberpunk, 네온, 미래 도시를 주제로 한 15초 이내 AI 영상을 제작해주세요.\n\nBlade Runner, 사이버펑크 2077, 고스트 인 더 셸 같은 작품들에서 영감을 받아 자신만의 미래 도시 비전을 표현해 보세요. 디스토피아든 유토피아든, 어떤 미래를 그리느냐는 자유입니다.\n\n우수작은 CREAITE 메인 피드에 1주일 동안 무료 노출됩니다.",
  },
  {
    id: "2",
    title: "자연 다큐멘터리",
    prize: "300만원",
    participants: 189,
    deadline: getNextDeadline(20),
    image: "https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=200&fit=crop",
    description: "BBC Earth 같은 시네마틱 자연 다큐 스타일 영상을 만들어주세요.\n\n광활한 자연의 경이로움, 야생 동물의 생동감 넘치는 순간, 또는 작은 곤충의 미시 세계까지 — 어떤 자연이든 좋습니다. 시네마틱 연출과 감정적 임팩트가 핵심 평가 요소입니다.",
  },
  {
    id: "3",
    title: "추상 아트 비주얼",
    prize: "200만원",
    participants: 267,
    deadline: getNextDeadline(25),
    image: "https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=400&h=200&fit=crop",
    description: "추상적 비주얼, 컬러, 모션, 패턴을 활용한 실험적인 영상을 제작하세요.\n\n구체적인 주제 없이도 OK. 음악 시각화, 추상 표현주의, 사이키델릭 아트 등 자유롭게 표현해 주세요. 영상미와 독창성이 평가 기준입니다.",
  },
];

const CATEGORIES = ["팁", "챌린지", "비교", "프롬프트", "튜토리얼", "일반", "질문"];

const CATEGORY_COLOR: Record<string, string> = {
  "챌린지": "bg-[#8b5cf6]/20 text-[#8b5cf6]",
  "팁": "bg-[#3b82f6]/20 text-[#3b82f6]",
  "프롬프트": "bg-[#10b981]/20 text-[#10b981]",
  "튜토리얼": "bg-[#f59e0b]/20 text-[#f59e0b]",
  "비교": "bg-[#ef4444]/20 text-[#ef4444]",
  "일반": "bg-[#6366f1]/20 text-[#6366f1]",
  "질문": "bg-[#06b6d4]/20 text-[#06b6d4]",
};

export function Community() {
  const { user, isAuthenticated } = useAuth();
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [showWriteModal, setShowWriteModal] = useState(false);

  // 상세 페이지 state
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);

  // Write modal state
  const [writeTitle, setWriteTitle] = useState("");
  const [writeContent, setWriteContent] = useState("");
  const [writeCategory, setWriteCategory] = useState("일반");
  const [submitting, setSubmitting] = useState(false);

  // 뒤로가기로 모든 모달/패널 닫기 (LIFO)
  useBackButton(showWriteModal, () => setShowWriteModal(false));
  useBackButton(!!commentPostId, () => setCommentPostId(null));
  useBackButton(!!selectedPost, () => setSelectedPost(null));
  useBackButton(!!selectedChallenge, () => setSelectedChallenge(null));

  const toggleLike = (postId: string) => {
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      newSet.has(postId) ? newSet.delete(postId) : newSet.add(postId);
      return newSet;
    });
  };

  const toggleBookmark = (postId: string) => {
    setBookmarkedPosts(prev => {
      const newSet = new Set(prev);
      newSet.has(postId) ? newSet.delete(postId) : newSet.add(postId);
      return newSet;
    });
  };

  const handleWritePost = async () => {
    if (!writeTitle.trim() || !writeContent.trim()) {
      toast.error("제목과 내용을 모두 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      // 로컬 상태에 추가 (Supabase community_posts 테이블 연동은 테이블 생성 후 활성화)
      const newPost: Post = {
        id: `local-${Date.now()}`,
        author: user?.name || "익명",
        avatar: "",
        title: writeTitle.trim(),
        content: writeContent.trim(),
        category: writeCategory,
        likes: 0,
        comments: 0,
        timestamp: "방금 전",
      };
      setPosts(prev => [newPost, ...prev]);
      setWriteTitle("");
      setWriteContent("");
      setWriteCategory("일반");
      setShowWriteModal(false);
      toast.success("게시글이 등록됐습니다!");
    } catch {
      toast.error("게시글 등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const commentPost = commentPostId ? posts.find(p => p.id === commentPostId) : null;

  return (
    <div className="h-full overflow-y-auto bg-background relative">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold">커뮤니티</h2>
          <Button
            onClick={() => {
              if (!isAuthenticated) {
                toast.error("게시글을 작성하려면 로그인이 필요합니다.");
                return;
              }
              setShowWriteModal(true);
            }}
            className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            글쓰기
          </Button>
        </div>

        <Tabs defaultValue="posts" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card mb-6">
            <TabsTrigger value="posts">게시글</TabsTrigger>
            <TabsTrigger value="challenges">챌린지</TabsTrigger>
            <TabsTrigger value="trending">트렌딩</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-0">
            <div className="space-y-4 pb-6 md:pb-8">
              <AnimatePresence initial={false}>
                {posts.map((post) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    onClick={() => setSelectedPost(post)}
                    className="bg-card rounded-lg border border-border overflow-hidden cursor-pointer hover:border-[#6366f1]/50 transition-colors"
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {post.avatar ? (
                            <img src={post.avatar} alt={post.author} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white font-bold text-sm">{post.author.charAt(0)}</span>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{post.author}</p>
                          <p className="text-xs text-muted-foreground">{post.timestamp}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${CATEGORY_COLOR[post.category] || "bg-[#6366f1]/20 text-[#6366f1]"}`}>
                          {post.category}
                        </span>
                      </div>

                      <h3 className="mb-2 font-semibold">{post.title}</h3>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-3 whitespace-pre-line">
                        {post.content}
                      </p>

                      {post.image && (
                        <img
                          src={post.image}
                          alt={post.title}
                          className="w-full h-48 object-cover rounded-lg mb-3"
                        />
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLike(post.id); }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Heart className={`w-5 h-5 ${likedPosts.has(post.id) ? 'fill-[#ef4444] text-[#ef4444]' : ''}`} />
                            <span>{post.likes + (likedPosts.has(post.id) ? 1 : 0)}</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setCommentPostId(post.id); }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <MessageCircle className="w-5 h-5" />
                            <span>{post.comments}</span>
                          </button>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleBookmark(post.id); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Bookmark className={`w-5 h-5 ${bookmarkedPosts.has(post.id) ? 'fill-[#6366f1] text-[#6366f1]' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </TabsContent>

          <TabsContent value="challenges" className="mt-0">
            <div className="space-y-4 pb-6 md:pb-8">
              {challenges.map((challenge) => (
                <div
                  key={challenge.id}
                  onClick={() => setSelectedChallenge(challenge)}
                  className="bg-card rounded-lg border border-border overflow-hidden group cursor-pointer hover:border-[#6366f1]/50 transition-colors"
                >
                  <div className="relative h-32 overflow-hidden">
                    <img src={challenge.image} alt={challenge.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-white mb-1">{challenge.title}</h3>
                      <div className="flex items-center gap-3 text-white/80 text-sm">
                        <div className="flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-[#fbbf24]" />
                          <span>{challenge.prize}</span>
                        </div>
                        <span>•</span>
                        <span>{challenge.participants}명 참여</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">마감: {challenge.deadline}</span>
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setSelectedChallenge(challenge); }}
                      className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
                    >
                      자세히 보기
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trending" className="mt-0">
            <div className="space-y-4 pb-6 md:pb-8">
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-[#6366f1]" />
                  <h3>인기 프롬프트 키워드</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["cyberpunk", "cinematic", "8k", "neon lights", "futuristic", "nature", "abstract", "portrait", "anime style", "realistic"].map((tag) => (
                    <span key={tag} className="px-3 py-1.5 bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10 border border-[#6366f1]/30 rounded-full text-sm cursor-pointer hover:border-[#6366f1] transition-colors">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="mb-4">이번 주 인기 게시글</h3>
                <div className="space-y-3">
                  {posts.slice(0, 3).map((post, i) => (
                    <div key={post.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-medium text-sm">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{post.title}</p>
                        <p className="text-xs text-muted-foreground">{post.likes} likes • {post.comments} comments</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-[#fbbf24]" />
                  <h3>이번 주 추천 팁</h3>
                </div>
                <div className="space-y-3">
                  <div className="p-3 bg-gradient-to-r from-[#6366f1]/5 to-[#8b5cf6]/5 rounded-lg border border-[#6366f1]/20">
                    <p className="text-sm mb-2">💡 프롬프트 작성 시 카메라 앵글을 명시하면 더 극적인 결과를 얻을 수 있습니다</p>
                    <p className="text-xs text-muted-foreground">예: "low angle shot", "bird's eye view"</p>
                  </div>
                  <div className="p-3 bg-gradient-to-r from-[#6366f1]/5 to-[#8b5cf6]/5 rounded-lg border border-[#6366f1]/20">
                    <p className="text-sm mb-2">💡 Negative prompt를 활용하여 원하지 않는 요소를 제거하세요</p>
                    <p className="text-xs text-muted-foreground">예: "no blur, no distortion, no artifacts"</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* 댓글 바텀시트 */}
      <AnimatePresence>
        {commentPostId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCommentPostId(null)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
              style={{ maxHeight: "75vh" }}
            >
              <CommentPanel
                postId={commentPostId}
                title={commentPost?.title}
                onClose={() => setCommentPostId(null)}
                mode="sheet"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 게시글 상세 페이지 */}
      <AnimatePresence>
        {selectedPost && (
          <CommunityPostDetail
            post={selectedPost}
            isLiked={likedPosts.has(selectedPost.id)}
            isBookmarked={bookmarkedPosts.has(selectedPost.id)}
            onLike={() => toggleLike(selectedPost.id)}
            onBookmark={() => toggleBookmark(selectedPost.id)}
            onClose={() => setSelectedPost(null)}
          />
        )}
      </AnimatePresence>

      {/* 챌린지 상세 페이지 */}
      <AnimatePresence>
        {selectedChallenge && (
          <CommunityChallengeDetail
            challenge={selectedChallenge}
            onClose={() => setSelectedChallenge(null)}
          />
        )}
      </AnimatePresence>

      {/* 글쓰기 모달 */}
      <AnimatePresence>
        {showWriteModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWriteModal(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-lg mx-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">게시글 작성</h3>
                <button onClick={() => setShowWriteModal(false)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 카테고리 선택 */}
              <div className="flex flex-wrap gap-2 mb-4">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setWriteCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      writeCategory === cat
                        ? "bg-[#6366f1] text-white"
                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="제목을 입력하세요"
                value={writeTitle}
                onChange={e => setWriteTitle(e.target.value)}
                maxLength={100}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors mb-3"
              />

              <textarea
                placeholder="내용을 입력하세요 (최소 10자)"
                value={writeContent}
                onChange={e => setWriteContent(e.target.value)}
                maxLength={2000}
                rows={5}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors resize-none mb-4"
              />

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{writeContent.length}/2000</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowWriteModal(false)} className="border-white/10">
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleWritePost}
                    disabled={submitting || !writeTitle.trim() || writeContent.trim().length < 10}
                    className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    등록
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
