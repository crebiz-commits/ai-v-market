import { Crown, Lock, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";

interface PremiumOTTProps {
  onSignInClick?: () => void;
}

/**
 * 프리미엄 OTT 피드 — 10분+ 영상 전용 페이지.
 *
 * Phase 2 (현재): 라우팅 + placeholder UI만 잡아둠.
 * Phase 3에서 영상 목록 (videos.show_on_ott=true) 연결 예정.
 * Phase 4에서 비구독자 재생 차단 + 구독 안내 모달 연결 예정.
 */
export function PremiumOTT({ onSignInClick: _onSignInClick }: PremiumOTTProps) {
  const { isAuthenticated, isSubscriber, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
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

        {/* Phase 2 Placeholder */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-[#121212] to-[#1a1a1c] rounded-2xl border border-white/10 p-8 md:p-12 text-center"
        >
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 items-center justify-center mb-4 border border-amber-500/30">
            {!isAuthenticated || !isSubscriber ? (
              <Lock className="w-8 h-8 text-amber-400" />
            ) : (
              <Crown className="w-8 h-8 text-amber-400" />
            )}
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">
            프리미엄 OTT 출시 준비 중
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto mb-6">
            10분 이상 길이의 시네마틱 콘텐츠가 곧 추가됩니다.<br />
            구독 시 모든 OTT 영상을 무제한으로 시청할 수 있습니다.
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Coming Soon — Phase 3에서 콘텐츠 연결 예정
          </div>
        </motion.div>

        {/* 향후 콘텐츠 영역 (Phase 3) */}
        {/* TODO Phase 3: videos.show_on_ott=true 영상들을 가로 스크롤 캐러셀 + 그리드로 표시 */}
      </div>
    </div>
  );
}
