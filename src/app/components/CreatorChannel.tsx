import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, Play, Sparkles, Eye, Users, Film, Filter, Flag, UserX, MoreVertical } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { FollowButton } from "./FollowButton";
import { CommentSettings } from "./CommentSettings";
import { ReportModal } from "./ReportModal";
import { useBlockedUsers } from "../hooks/useBlockedUsers";

interface CreatorChannelProps {
  creatorId: string;
  onBack: () => void;
  onSignInClick?: () => void;
  onProductClick?: (video: any) => void;
}

interface CreatorProfile {
  creator_id: string;
  creator_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  video_count: number;
  follower_count: number;
  total_views: number;
  am_i_following: boolean;
}

type SortOrder = "latest" | "oldest";

interface CreatorVideo {
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function mapVideoForDetail(v: CreatorVideo) {
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

export function CreatorChannel({ creatorId, onBack, onSignInClick, onProductClick }: CreatorChannelProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [showCommentSettings, setShowCommentSettings] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const { isBlocked, blockUser, unblockUser } = useBlockedUsers();
  const blockedHere = isBlocked(creatorId);

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handler = () => setMoreMenuOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [moreMenuOpen]);

  const sortedVideos = [...videos].sort((a, b) => {
    const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return sortOrder === "latest" ? diff : -diff;
  });

  const isMyChannel = user?.id === creatorId;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [profileRes, videosRes] = await Promise.all([
      supabase.rpc("get_creator_profile", { p_creator_id: creatorId }),
      supabase.rpc("get_creator_videos", { p_creator_id: creatorId, p_limit: 30 }),
    ]);
    if (profileRes.error) {
      console.warn("[CreatorChannel] get_creator_profile 실패:", profileRes.error.message);
    } else {
      const rows = (profileRes.data || []) as CreatorProfile[];
      setProfile(rows[0] || null);
    }
    if (videosRes.error) {
      console.warn("[CreatorChannel] get_creator_videos 실패:", videosRes.error.message);
      setVideos([]);
    } else {
      setVideos((videosRes.data || []) as CreatorVideo[]);
    }
    setLoading(false);
  }, [creatorId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 팔로우 토글 후 follower_count 즉시 반영
  const handleFollowChange = (following: boolean) => {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            am_i_following: following,
            follower_count: prev.follower_count + (following ? 1 : -1),
          }
        : prev,
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-10 h-10 animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a] p-6">
        <div className="text-center max-w-md">
          <p className="text-gray-400 mb-6">크리에이터 정보를 찾을 수 없습니다.</p>
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold border border-white/10"
          >
            ← 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      {isMyChannel && (
        <CommentSettings open={showCommentSettings} onClose={() => setShowCommentSettings(false)} />
      )}
      {!isMyChannel && (
        <ReportModal
          open={reportOpen}
          targetType="user"
          targetId={creatorId}
          targetTitle={`${profile.creator_name} 채널`}
          onClose={() => setReportOpen(false)}
          onSignInClick={onSignInClick}
        />
      )}
      {!isMyChannel && blockedHere && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
          <p className="text-xs text-amber-300 text-center">
            🚫 차단한 채널입니다. 이 채널의 콘텐츠는 회원님의 피드에 보이지 않습니다.
          </p>
        </div>
      )}
      {/* 뒤로가기 띠 */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            채널 목록
          </button>
        </div>
      </div>

      {/* 채널 헤더 */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative bg-[#121212] rounded-2xl overflow-hidden border border-white/5 shadow-xl mt-4 mb-6"
        >
          <div className="relative h-28 md:h-40 overflow-hidden">
            {profile.banner_url ? (
              <img
                src={profile.banner_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] opacity-90" />
            )}
          </div>
          <div className="px-5 md:px-6 pb-6">
            <div className="relative -mt-14 mb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div className="flex items-end gap-4">
                <div className="w-24 h-24 md:w-28 md:h-28 rounded-full border-[6px] border-[#121212] bg-gradient-to-br from-[#1E1E24] to-[#2B2B36] flex items-center justify-center shadow-lg overflow-hidden shrink-0">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.creator_name} className="w-full h-full object-cover" />
                  ) : (
                    <Sparkles className="w-10 h-10 text-gray-400" />
                  )}
                </div>
              </div>
              {isMyChannel ? (
                <button
                  onClick={() => setShowCommentSettings(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white text-sm font-bold shadow-md shadow-[#8b5cf6]/30 transition-opacity"
                >
                  <Filter className="w-4 h-4" />
                  댓글 관리
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <FollowButton
                    creatorId={creatorId}
                    initialFollowing={profile.am_i_following}
                    onSignInClick={onSignInClick}
                    onChange={handleFollowChange}
                    size="md"
                  />
                  {/* 더보기: 신고 / 차단 */}
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMoreMenuOpen((v) => !v); }}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      aria-label="더보기"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {moreMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute z-30 right-0 mt-1 bg-[#1c1c1e] border border-white/10 rounded-lg shadow-xl py-1 w-44"
                      >
                        <button
                          onClick={() => { setMoreMenuOpen(false); setReportOpen(true); }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-amber-400 transition-colors flex items-center gap-2"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          채널 신고
                        </button>
                        {blockedHere ? (
                          <button
                            onClick={() => { setMoreMenuOpen(false); unblockUser(creatorId); }}
                            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-[#10b981] transition-colors flex items-center gap-2"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            차단 해제
                          </button>
                        ) : (
                          <button
                            onClick={() => { setMoreMenuOpen(false); blockUser(creatorId, profile.creator_name); }}
                            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 hover:text-red-400 transition-colors flex items-center gap-2"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            이 채널 차단
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white mb-2">{profile.creator_name}</h1>
            {profile.bio && (
              <p className="text-sm text-gray-400 leading-relaxed mb-4 max-w-2xl whitespace-pre-line">
                {profile.bio}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-md">
              <Stat icon={Film} label="영상" value={profile.video_count} color="text-[#6366f1]" />
              <Stat icon={Users} label="팔로워" value={profile.follower_count} color="text-[#8b5cf6]" />
              <Stat icon={Eye} label="총 조회수" value={profile.total_views} color="text-[#10b981]" />
            </div>
          </div>
        </motion.div>

        {/* 영상 그리드 헤더: 제목 + 정렬 토글 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">등록 영상</h2>
          {videos.length > 1 && (
            <div className="flex items-center gap-1 p-1 bg-[#1c1c1e] rounded-lg border border-white/5">
              <button
                onClick={() => setSortOrder("latest")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  sortOrder === "latest"
                    ? "bg-[#6366f1] text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                최신순
              </button>
              <button
                onClick={() => setSortOrder("oldest")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  sortOrder === "oldest"
                    ? "bg-[#6366f1] text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                오래된순
              </button>
            </div>
          )}
        </div>
        {videos.length === 0 ? (
          <div className="bg-[#121212] rounded-2xl border border-white/5 p-8 md:p-12 text-center">
            <Film className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">등록된 영상이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {sortedVideos.map((v) => (
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
                  <h3 className="font-bold text-white mb-1 line-clamp-2 leading-snug">{v.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
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
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-[#1c1c1e] rounded-xl border border-white/5 p-3 text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
      <p className={`text-lg font-black ${color}`}>{formatNumber(value)}</p>
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}
