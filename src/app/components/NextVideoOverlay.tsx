// ════════════════════════════════════════════════════════════════════════════
// 다음 영상 오버레이 (Phase 16 — 연속 재생/큐 MVP)
//
// 영상이 끝나면 추천 영상 1개를 카운트다운(5초)과 함께 표시.
// YouTube/Netflix 패턴 — 5초 후 자동 재생, 사용자가 "취소" or "지금 재생" 선택 가능.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, X, SkipForward } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SimilarVideo {
  id: string;
  title: string;
  thumbnail?: string | null;
  creator?: string | null;
  duration?: string | null;
  views?: number | null;
}

interface NextVideoOverlayProps {
  open: boolean;
  nextVideo: SimilarVideo | null;
  countdownSeconds?: number;     // 기본 8초
  onPlayNow: () => void;          // 즉시 재생
  onCancel: () => void;           // 자동재생 취소 (오버레이 닫기)
}

export function NextVideoOverlay({
  open,
  nextVideo,
  countdownSeconds = 8,
  onPlayNow,
  onCancel,
}: NextVideoOverlayProps) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(countdownSeconds);

  useEffect(() => {
    if (!open || !nextVideo) {
      setRemaining(countdownSeconds);
      return;
    }
    setRemaining(countdownSeconds);
    const timer = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nextVideo?.id]);

  // remaining 이 0 도달 시 다음 영상 재생 (setState 부수효과 분리)
  useEffect(() => {
    if (open && nextVideo && remaining === 0) {
      onPlayNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, open, nextVideo?.id]);

  // N키 → 즉시 다음, Esc → 취소
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        onPlayNow();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const progress = ((countdownSeconds - remaining) / countdownSeconds) * 100;

  return (
    <AnimatePresence>
      {open && nextVideo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative w-full max-w-sm bg-[#0f0f12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Header — 컴팩트 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <div className="flex items-center gap-1.5">
                <SkipForward className="w-3.5 h-3.5 text-[#8b5cf6]" />
                <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">{t("nextVideo.label")}</span>
                <span className="text-[10px] font-black text-[#ec4899]">{t("nextVideo.countdownSuffix", { seconds: remaining })}</span>
              </div>
              <button
                onClick={onCancel}
                className="p-1 rounded-md hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title={t("nextVideo.cancelAutoplayTitle")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 본문: 썸네일(좌) + 텍스트/버튼(우) — 가로 레이아웃 */}
            <div className="flex gap-3 p-3">
              {/* 썸네일 — 작게 */}
              <button
                onClick={onPlayNow}
                className="relative flex-shrink-0 w-28 aspect-video bg-black overflow-hidden rounded-lg group"
                title={t("nextVideo.playNowTitle")}
              >
                {nextVideo.thumbnail ? (
                  <img
                    src={nextVideo.thumbnail}
                    alt={nextVideo.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#1c1c1e] to-[#2d2d30]" />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-lg shadow-[#8b5cf6]/50 group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                  </div>
                </div>
                {nextVideo.duration && (
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-white text-[10px] font-bold">
                    {nextVideo.duration}
                  </div>
                )}
              </button>

              {/* 우측: 제목 + 크리에이터 + 버튼 */}
              <div className="flex-1 min-w-0 flex flex-col">
                <h3 className="text-sm font-bold text-white line-clamp-2 mb-0.5 leading-tight">
                  {nextVideo.title}
                </h3>
                {nextVideo.creator && (
                  <p className="text-[11px] text-white/60 font-medium line-clamp-1 mb-2">
                    {nextVideo.creator}
                  </p>
                )}
                <div className="flex gap-1.5 mt-auto">
                  <button
                    onClick={onCancel}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold transition-colors"
                  >
                    {t("nextVideo.cancel")}
                  </button>
                  <button
                    onClick={onPlayNow}
                    className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] hover:opacity-90 text-white text-[11px] font-bold flex items-center justify-center gap-1"
                  >
                    <Play className="w-3 h-3 fill-white" />
                    {t("nextVideo.playNow")}
                  </button>
                </div>
              </div>
            </div>

            {/* 진행바 — 카드 하단 */}
            <div className="h-1 bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] transition-all duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
