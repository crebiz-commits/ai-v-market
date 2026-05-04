import { useState } from "react";
import { Users, Compass, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";

interface ChannelProps {
  onSignInClick?: () => void;
}

type ChannelTab = "subscribed" | "explore";

/**
 * 채널 피드 — 구독 + 탐색 통합.
 *
 * Phase 2 (현재): 라우팅 + 탭 UI placeholder만.
 * Phase 6에서 다음 기능 연결 예정:
 *   - 구독: 사용자가 팔로우한 크리에이터들의 최신 영상 (creator_followers 테이블)
 *   - 탐색: 인기 크리에이터 추천 + 카테고리별 둘러보기
 */
export function Channel({ onSignInClick }: ChannelProps) {
  const [activeTab, setActiveTab] = useState<ChannelTab>("subscribed");
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-[#8b5cf6]" />
      </div>
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

        {/* 탭별 콘텐츠 */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-[#121212] rounded-2xl border border-white/5 p-8 md:p-12 text-center"
        >
          {activeTab === "subscribed" ? (
            <>
              <div className="inline-flex w-16 h-16 rounded-2xl bg-[#6366f1]/10 items-center justify-center mb-4 border border-[#6366f1]/20">
                <Users className="w-8 h-8 text-[#6366f1]" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {isAuthenticated ? "아직 구독한 채널이 없어요" : "로그인이 필요합니다"}
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto mb-6">
                {isAuthenticated
                  ? "마음에 드는 크리에이터를 구독하면 최신 영상을 여기서 모아 볼 수 있어요."
                  : "로그인 후 좋아하는 크리에이터를 구독해 보세요."}
              </p>
              {!isAuthenticated && (
                <button
                  onClick={onSignInClick}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  로그인 / 회원가입
                </button>
              )}
            </>
          ) : (
            <>
              <div className="inline-flex w-16 h-16 rounded-2xl bg-[#8b5cf6]/10 items-center justify-center mb-4 border border-[#8b5cf6]/20">
                <Compass className="w-8 h-8 text-[#8b5cf6]" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">새 채널 탐색</h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto mb-6">
                인기 크리에이터와 새롭게 떠오르는 채널을 발견해 보세요.
              </p>
            </>
          )}

          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-[#8b5cf6] animate-pulse" />
            Coming Soon — Phase 6에서 콘텐츠 연결 예정
          </div>
        </motion.div>

        {/* TODO Phase 6:
            - 구독: SELECT videos FROM creator_followers JOIN videos ON creator_id ORDER BY created_at DESC
            - 탐색: 인기 크리에이터 (구독자수 기준) + 카테고리별 추천 */}
      </div>
    </div>
  );
}
