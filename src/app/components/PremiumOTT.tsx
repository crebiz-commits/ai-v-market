import { useEffect, useState } from "react";
import { Crown, Lock, Loader2, Play, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";

interface OttVideo {
  id: string;
  title: string;
  thumbnail: string;
  creator: string;
  duration: string;
  resolution?: string;
  tool: string;
  category?: string;
  genre?: string;
  videoUrl: string;
  description?: string;
  director?: string;
  productionYear?: number;
  // 라이선스 (ProductDetail prop 호환)
  price: number;
  priceStandard?: number;
  priceCommercial?: number;
  priceExclusive?: number;
  // AI 메타
  aiModelVersion?: string;
  prompt?: string;
  seed?: string;
  // 시네마 메타
  writer?: string;
  composer?: string;
  castCredits?: string;
  language?: string;
  subtitleLanguage?: string;
  // 하이라이트
  highlightStart?: number;
  highlightEnd?: number;
}

interface PremiumOTTProps {
  onSignInClick?: () => void;
  onProductClick?: (video: OttVideo) => void;
}

/**
 * 프리미엄 OTT 피드 — show_on_ott=true 영상만 표시.
 *
 * Phase 3 (현재): 영상 목록 표시 + 클릭 시 ProductDetail 오픈.
 * Phase 4에서 비구독자 재생 시도 시 구독 안내 모달 추가 예정.
 */
export function PremiumOTT({ onSignInClick, onProductClick }: PremiumOTTProps) {
  const { isAuthenticated, isSubscriber, loading: authLoading } = useAuth();
  const [videos, setVideos] = useState<OttVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchOttVideos() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .or("visibility.eq.public,visibility.is.null")
          .eq("show_on_ott", true)
          .order("created_at", { ascending: false })
          .limit(24);

        if (error) {
          console.warn("[PremiumOTT] 영상 조회 실패:", error.message);
          return;
        }
        if (cancelled || !data) return;

        const mapped: OttVideo[] = data.map((item: any) => ({
          id: item.id,
          title: item.title,
          thumbnail: item.thumbnail,
          creator: item.creator || "AI Creator",
          duration: item.duration || "0:00",
          resolution: item.resolution,
          tool: item.ai_tool || "AI Tool",
          category: item.category,
          genre: item.genre,
          videoUrl: item.video_url || "",
          description: item.description,
          director: item.director,
          productionYear: item.production_year,
          price: item.price_standard || 0,
          priceStandard: item.price_standard || 0,
          priceCommercial: item.price_commercial || 0,
          priceExclusive: item.price_exclusive || 0,
          aiModelVersion: item.ai_model_version,
          prompt: item.prompt,
          seed: item.seed,
          writer: item.writer,
          composer: item.composer,
          castCredits: item.cast_credits,
          language: item.language,
          subtitleLanguage: item.subtitle_language,
          highlightStart: item.highlight_start,
          highlightEnd: item.highlight_end,
        }));
        setVideos(mapped);
      } catch (err) {
        console.warn("[PremiumOTT] 예외:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOttVideos();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authLoading || loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white">프리미엄 OTT</h1>
          </div>
          <p className="text-gray-400 text-sm md:text-base">
            10분 이상 시네마틱 작품 — AI가 만든 진짜 영화 같은 경험
          </p>
        </motion.div>

        {/* 구독 상태 배너 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className={`mb-6 p-4 md:p-5 rounded-2xl border ${
            isSubscriber
              ? "bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30"
              : "bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10 border-[#6366f1]/30"
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {isSubscriber ? (
                <Crown className="w-6 h-6 text-amber-400 shrink-0" />
              ) : (
                <Sparkles className="w-6 h-6 text-[#8b5cf6] shrink-0" />
              )}
              <div>
                <p className="text-sm md:text-base font-bold text-white">
                  {isSubscriber
                    ? "프리미엄 구독 활성화 — 모든 OTT 영상 무제한"
                    : "구독하면 모든 OTT 영상 무제한"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isSubscriber
                    ? "원하는 영상을 자유롭게 시청하세요"
                    : "월 ₩2,900 — 홈/시네마/OTT 전체 콘텐츠"}
                </p>
              </div>
            </div>
            {!isSubscriber && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (!isAuthenticated) {
                    onSignInClick?.();
                    return;
                  }
                  // TODO Phase 4: 결제 모달 — 지금은 안내만
                  alert("구독 결제 기능은 곧 출시됩니다.");
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg text-sm font-bold shadow-lg shadow-[#6366f1]/20 hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                구독하기
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* 영상 그리드 */}
        {videos.length === 0 ? (
          // 영상 0개 — placeholder
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-[#121212] to-[#1a1a1c] rounded-2xl border border-white/10 p-8 md:p-12 text-center"
          >
            <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 items-center justify-center mb-4 border border-amber-500/30">
              <Lock className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">
              곧 시네마틱 콘텐츠가 추가됩니다
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
              10분 이상의 영상이 등록되면 자동으로 이곳에 노출됩니다.<br />
              크리에이터 분들의 멋진 작품을 기대해주세요.
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.05 } },
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5"
          >
            {videos.map((video) => (
              <motion.button
                key={video.id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0 },
                }}
                whileHover={{ y: -4 }}
                onClick={() => onProductClick?.(video)}
                className="group relative bg-[#121212] rounded-2xl overflow-hidden border border-white/5 hover:border-amber-500/30 transition-all text-left shadow-lg hover:shadow-amber-500/10"
              >
                {/* 썸네일 */}
                <div className="relative aspect-video bg-black overflow-hidden">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  {/* OTT 배지 */}
                  <div className="absolute top-3 left-3 px-2 py-1 bg-gradient-to-r from-amber-500 to-orange-500 rounded text-[10px] font-black text-white shadow-md tracking-wider">
                    PREMIUM
                  </div>
                  {/* 길이 배지 */}
                  <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-[10px] font-bold text-white">
                    {video.duration}
                  </div>
                  {/* 재생 버튼 오버레이 */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                    <div className="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100">
                      <Play className="w-6 h-6 text-black ml-1" fill="currentColor" />
                    </div>
                  </div>
                </div>
                {/* 정보 */}
                <div className="p-4">
                  <h3 className="font-bold text-white mb-1 line-clamp-2 leading-snug">
                    {video.title}
                  </h3>
                  <p className="text-xs text-gray-400 mb-2">
                    {video.director ? `감독 ${video.director}` : video.creator}
                    {video.productionYear ? ` · ${video.productionYear}` : ""}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {video.category && (
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-medium text-gray-400">
                        {video.category}
                      </span>
                    )}
                    {video.tool && (
                      <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-medium text-amber-400">
                        {video.tool}
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
