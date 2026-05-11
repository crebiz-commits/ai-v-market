import { useState, useEffect, useCallback } from "react";
import { Users, Compass, Loader2, Play, Eye, Crown, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { FollowButton } from "./FollowButton";
import { CreatorChannel } from "./CreatorChannel";

interface ChannelProps {
  onSignInClick?: () => void;
  onProductClick?: (video: any) => void;
  // 외부(ProductDetail "채널 보기" 등)에서 채널 탭으로 진입할 때 자동 열 크리에이터 ID
  initialCreatorId?: string | null;
  // 위 ID로 채널 페이지가 열린 직후 App.tsx state 클리어 신호
  onCreatorOpened?: () => void;
}

type ChannelTab = "subscribed" | "explore";

interface FollowingVideo {
  id: string;
  title: string;
  thumbnail: string;
  creator_id: string;
  creator_name: string;
  duration: string | null;
  duration_seconds: number | null;
  views: string | null;
  category: string | null;
  ai_tool: string | null;
  video_url: string | null;
  created_at: string;
}

interface PopularCreator {
  creator_id: string;
  creator_name: string;
  avatar_url: string | null;
  video_count: number;
  follower_count: number;
  total_views: number;
  recent_thumbnails: string[];
}

// RPC 결과 → ProductDetail이 기대하는 형식
function mapVideoForDetail(v: FollowingVideo) {
  return {
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnail,
    creator: v.creator_name,
    creatorId: v.creator_id,
    price: 0,
    duration: v.duration || "0:00",
    durationSeconds: v.duration_seconds || 0,
    tool: v.ai_tool || "AI",
    category: v.category || undefined,
    videoUrl: v.video_url || "",
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function Channel({ onSignInClick, onProductClick, initialCreatorId, onCreatorOpened }: ChannelProps) {
  const [activeTab, setActiveTab] = useState<ChannelTab>("subscribed");
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // 외부에서 채널 진입 신호 들어오면 채택
  useEffect(() => {
    if (initialCreatorId) {
      setSelectedCreatorId(initialCreatorId);
      onCreatorOpened?.();
    }
  }, [initialCreatorId, onCreatorOpened]);

  // 구독 탭 데이터
  const [followingVideos, setFollowingVideos] = useState<FollowingVideo[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);

  // 탐색 탭 데이터
  const [creators, setCreators] = useState<PopularCreator[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);

  // 내가 팔로우 중인 creator_id 집합 (FollowButton 초기값용)
  const [myFollows, setMyFollows] = useState<Set<string>>(new Set());

  // 1. 내 팔로우 목록 (한 번 조회 → FollowButton에 전달)
  const fetchMyFollows = useCallback(async () => {
    if (!user) {
      setMyFollows(new Set());
      return;
    }
    const { data, error } = await supabase
      .from("creator_followers")
      .select("creator_id")
      .eq("follower_id", user.id);
    if (error) {
      console.warn("[Channel] 내 팔로우 조회 실패:", error.message);
      return;
    }
    setMyFollows(new Set((data || []).map((r: any) => r.creator_id)));
  }, [user]);

  // 2. 구독 영상 피드
  const fetchFollowingVideos = useCallback(async () => {
    if (!isAuthenticated) {
      setFollowingVideos([]);
      return;
    }
    setFollowingLoading(true);
    const { data, error } = await supabase.rpc("get_my_following_videos", { p_limit: 30 });
    if (error) {
      console.warn("[Channel] get_my_following_videos 실패:", error.message);
      setFollowingVideos([]);
    } else {
      setFollowingVideos((data || []) as FollowingVideo[]);
    }
    setFollowingLoading(false);
  }, [isAuthenticated]);

  // 3. 인기 크리에이터
  const fetchPopularCreators = useCallback(async () => {
    setCreatorsLoading(true);
    const { data, error } = await supabase.rpc("get_popular_creators", { p_limit: 20 });
    if (error) {
      console.warn("[Channel] get_popular_creators 실패:", error.message);
      setCreators([]);
    } else {
      setCreators((data || []) as PopularCreator[]);
    }
    setCreatorsLoading(false);
  }, []);

  useEffect(() => {
    fetchMyFollows();
  }, [fetchMyFollows]);

  useEffect(() => {
    if (activeTab === "subscribed") {
      fetchFollowingVideos();
    } else {
      fetchPopularCreators();
    }
  }, [activeTab, fetchFollowingVideos, fetchPopularCreators]);

  // 팔로우 토글 시 로컬 set 갱신 + 구독 탭이면 영상 목록 재조회
  const handleFollowChange = (creatorId: string, following: boolean) => {
    setMyFollows((prev) => {
      const next = new Set(prev);
      if (following) next.add(creatorId);
      else next.delete(creatorId);
      return next;
    });
    if (activeTab === "subscribed") {
      fetchFollowingVideos();
    }
  };

  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  // 선택된 크리에이터가 있으면 채널 페이지 표시
  if (selectedCreatorId) {
    return (
      <CreatorChannel
        creatorId={selectedCreatorId}
        onBack={() => {
          setSelectedCreatorId(null);
          fetchMyFollows(); // 채널 페이지에서 팔로우 변경 후 돌아오면 동기화
        }}
        onSignInClick={onSignInClick}
        onProductClick={onProductClick}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">채널</h1>
          <p className="text-gray-400 text-sm md:text-base">
            구독한 크리에이터의 새 영상과 새로운 채널을 발견하세요
          </p>
        </motion.div>

        {/* 탭 */}
        <div className="flex items-center gap-2 mb-6 p-1 bg-[#1c1c1e] rounded-xl border border-white/5 max-w-md">
          <button
            onClick={() => setActiveTab("subscribed")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all text-sm font-bold
              ${activeTab === "subscribed"
                ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"}
            `}
          >
            <Users className="w-4 h-4" />
            구독
          </button>
          <button
            onClick={() => setActiveTab("explore")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all text-sm font-bold
              ${activeTab === "explore"
                ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"}
            `}
          >
            <Compass className="w-4 h-4" />
            탐색
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "subscribed" ? (
              <SubscribedTab
                isAuthenticated={isAuthenticated}
                loading={followingLoading}
                videos={followingVideos}
                onSignInClick={onSignInClick}
                onProductClick={onProductClick}
              />
            ) : (
              <ExploreTab
                loading={creatorsLoading}
                creators={creators}
                myFollows={myFollows}
                onSignInClick={onSignInClick}
                onFollowChange={handleFollowChange}
                onCreatorClick={setSelectedCreatorId}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 구독 탭: 팔로우한 크리에이터들의 최신 영상 그리드
// ──────────────────────────────────────────────────────────────
function SubscribedTab({
  isAuthenticated,
  loading,
  videos,
  onSignInClick,
  onProductClick,
}: {
  isAuthenticated: boolean;
  loading: boolean;
  videos: FollowingVideo[];
  onSignInClick?: () => void;
  onProductClick?: (video: any) => void;
}) {
  if (!isAuthenticated) {
    return (
      <div className="bg-[#121212] rounded-2xl border border-white/5 p-8 md:p-12 text-center">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-[#6366f1]/10 items-center justify-center mb-4 border border-[#6366f1]/20">
          <Users className="w-8 h-8 text-[#6366f1]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">로그인이 필요합니다</h2>
        <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto mb-6">
          로그인 후 좋아하는 크리에이터를 구독해 보세요.
        </p>
        <button
          onClick={onSignInClick}
          className="px-6 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
        >
          로그인 / 회원가입
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="bg-[#121212] rounded-2xl border border-white/5 p-8 md:p-12 text-center">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-[#6366f1]/10 items-center justify-center mb-4 border border-[#6366f1]/20">
          <Users className="w-8 h-8 text-[#6366f1]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">아직 구독한 채널이 없어요</h2>
        <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
          "탐색" 탭에서 마음에 드는 크리에이터를 팔로우하면<br />
          여기에 최신 영상이 모입니다.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
      {videos.map((v) => (
        <motion.button
          key={v.id}
          whileHover={{ y: -4 }}
          onClick={() => onProductClick?.(mapVideoForDetail(v))}
          className="group relative bg-[#121212] rounded-2xl overflow-hidden border border-white/5 hover:border-[#8b5cf6]/30 transition-all text-left shadow-sm"
        >
          <div className="relative aspect-video bg-black overflow-hidden">
            <img
              src={v.thumbnail}
              alt={v.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {v.duration && (
              <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-[10px] font-bold text-white">
                {v.duration}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
              <div className="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100">
                <Play className="w-6 h-6 text-black ml-1" fill="currentColor" />
              </div>
            </div>
          </div>
          <div className="p-4">
            <h3 className="font-bold text-white mb-1 line-clamp-2 leading-snug">
              {v.title}
            </h3>
            <p className="text-xs text-gray-400 mb-2">{v.creator_name}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {v.category && (
                <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-medium text-gray-400">
                  {v.category}
                </span>
              )}
              {v.ai_tool && (
                <span className="px-2 py-0.5 bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 rounded text-[10px] font-medium text-[#8b5cf6]">
                  {v.ai_tool}
                </span>
              )}
            </div>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 탐색 탭: 인기 크리에이터 카드 그리드
// ──────────────────────────────────────────────────────────────
function ExploreTab({
  loading,
  creators,
  myFollows,
  onSignInClick,
  onFollowChange,
  onCreatorClick,
}: {
  loading: boolean;
  creators: PopularCreator[];
  myFollows: Set<string>;
  onSignInClick?: () => void;
  onFollowChange: (creatorId: string, following: boolean) => void;
  onCreatorClick: (creatorId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  if (creators.length === 0) {
    return (
      <div className="bg-[#121212] rounded-2xl border border-white/5 p-8 md:p-12 text-center">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-[#8b5cf6]/10 items-center justify-center mb-4 border border-[#8b5cf6]/20">
          <Compass className="w-8 h-8 text-[#8b5cf6]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">표시할 채널이 없어요</h2>
        <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
          영상을 등록한 크리에이터가 늘어나면 이곳에서 추천이 시작됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
      {creators.map((c, idx) => {
        const isTop = idx < 3;
        return (
          <motion.div
            key={c.creator_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            onClick={() => onCreatorClick(c.creator_id)}
            className="relative bg-[#121212] rounded-2xl border border-white/5 shadow-sm hover:border-white/10 hover:-translate-y-1 cursor-pointer transition-all p-5"
          >
            {/* TOP 배지 */}
            {isTop && (
              <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 bg-amber-500/90 backdrop-blur-sm rounded text-[10px] font-black text-white shadow-md z-10">
                <Crown className="w-3 h-3" />
                TOP {idx + 1}
              </div>
            )}

            {/* 큰 아바타 + 이름 + 통계 (중앙 정렬) */}
            <div className="flex flex-col items-center mt-3 mb-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1E1E24] to-[#2B2B36] border-2 border-white/10 flex items-center justify-center shadow-lg overflow-hidden mb-3">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt={c.creator_name} className="w-full h-full object-cover" />
                ) : (
                  <Sparkles className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <h3 className="font-bold text-white text-base mb-1.5 line-clamp-1 text-center px-2">
                {c.creator_name}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                <span>영상 {c.video_count}개</span>
                <span className="w-1 h-1 rounded-full bg-gray-700" />
                <span>팔로워 {formatNumber(c.follower_count)}</span>
                <span className="w-1 h-1 rounded-full bg-gray-700" />
                <span className="inline-flex items-center gap-0.5">
                  <Eye className="w-3 h-3" />
                  {formatNumber(c.total_views)}
                </span>
              </div>
            </div>

            {/* 최근 영상 3개 미니 썸네일 */}
            {c.recent_thumbnails.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="aspect-video bg-[#1c1c1e] rounded-md overflow-hidden">
                    {c.recent_thumbnails[i] && (
                      <img
                        src={c.recent_thumbnails[i]}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 팔로우 버튼 (카드 클릭 버블링 차단은 FollowButton 내부에서 처리) */}
            <div className="flex justify-center">
              <FollowButton
                creatorId={c.creator_id}
                initialFollowing={myFollows.has(c.creator_id)}
                onSignInClick={onSignInClick}
                onChange={(f) => onFollowChange(c.creator_id, f)}
                size="md"
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
