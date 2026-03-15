import { useState } from "react";
import { Lightbulb, Trophy, MessageCircle, Heart, Bookmark, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Avatar } from "./ui/avatar";

interface Post {
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

const mockPosts: Post[] = [
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

const challenges = [
  {
    id: "1",
    title: "미래 도시 챌린지",
    prize: "500만원",
    participants: 342,
    deadline: "2026.03.15",
    image: "https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=400&h=200&fit=crop"
  },
  {
    id: "2",
    title: "자연 다큐멘터리",
    prize: "300만원",
    participants: 189,
    deadline: "2026.03.20",
    image: "https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=200&fit=crop"
  },
  {
    id: "3",
    title: "추상 아트 비주얼",
    prize: "200만원",
    participants: 267,
    deadline: "2026.03.25",
    image: "https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=400&h=200&fit=crop"
  }
];

export function Community() {
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());

  const toggleLike = (postId: string) => {
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const toggleBookmark = (postId: string) => {
    setBookmarkedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">커뮤니티</h2>
        
        <Tabs defaultValue="posts" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-card mb-6">
            <TabsTrigger value="posts">게시글</TabsTrigger>
            <TabsTrigger value="challenges">챌린지</TabsTrigger>
            <TabsTrigger value="trending">트렌딩</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-0">
            <div className="space-y-4 pb-6 md:pb-8">
              {mockPosts.map((post) => (
                <div key={post.id} className="bg-card rounded-lg border border-border overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] overflow-hidden">
                        <img src={post.avatar} alt={post.author} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{post.author}</p>
                        <p className="text-xs text-muted-foreground">{post.timestamp}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs ${
                        post.category === "챌린지" 
                          ? "bg-[#8b5cf6]/20 text-[#8b5cf6]" 
                          : post.category === "팁"
                          ? "bg-[#3b82f6]/20 text-[#3b82f6]"
                          : "bg-[#6366f1]/20 text-[#6366f1]"
                      }`}>
                        {post.category}
                      </span>
                    </div>

                    <h3 className="mb-2">{post.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
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
                          onClick={() => toggleLike(post.id)}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Heart 
                            className={`w-5 h-5 ${
                              likedPosts.has(post.id) 
                                ? 'fill-[#ef4444] text-[#ef4444]' 
                                : ''
                            }`}
                          />
                          <span>{post.likes + (likedPosts.has(post.id) ? 1 : 0)}</span>
                        </button>
                        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                          <MessageCircle className="w-5 h-5" />
                          <span>{post.comments}</span>
                        </button>
                      </div>
                      <button 
                        onClick={() => toggleBookmark(post.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Bookmark 
                          className={`w-5 h-5 ${
                            bookmarkedPosts.has(post.id) 
                              ? 'fill-[#6366f1] text-[#6366f1]' 
                              : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="challenges" className="mt-0">
            <div className="space-y-4 pb-6 md:pb-8">
              {challenges.map((challenge) => (
                <div key={challenge.id} className="bg-card rounded-lg border border-border overflow-hidden group cursor-pointer">
                  <div className="relative h-32 overflow-hidden">
                    <img 
                      src={challenge.image} 
                      alt={challenge.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
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
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        마감: {challenge.deadline}
                      </span>
                      <Button size="sm" className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
                        참여하기
                      </Button>
                    </div>
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
                  {["cyberpunk", "cinematic", "8k", "neon lights", "futuristic", "nature", "abstract", "portrait", "anime style", "realistic"].map((tag, idx) => (
                    <span 
                      key={tag}
                      className="px-3 py-1.5 bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10 border border-[#6366f1]/30 rounded-full text-sm cursor-pointer hover:border-[#6366f1] transition-colors"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="mb-4">이번 주 인기 게시글</h3>
                <div className="space-y-3">
                  {mockPosts.slice(0, 3).map((post, idx) => (
                    <div key={post.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-medium">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{post.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {post.likes} likes • {post.comments} comments
                        </p>
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
    </div>
  );
}
