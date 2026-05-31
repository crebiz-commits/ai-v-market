import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronRight } from "lucide-react";
import { getActiveEventBanners, type EventBanner as Banner } from "../data/eventBanners";

// ════════════════════════════════════════════════════════════════════════════
// 이벤트/프로모 배너 — 슬림 가로 배너. 재사용 가능(홈/시네마/OTT 어디든 배치).
//  - 활성 배너 없거나 모두 닫혔으면 아무것도 렌더 안 함(빈 공간 없음)
//  - 여러 개면 6초마다 자동 회전 + 점(dot) 네비
//  - ✕ 로 닫으면 localStorage 에 기록(해당 배너만 다시 안 뜸)
//  - CTA/배너 클릭 → 내부 경로(?tab=)면 onNavigate, 외부 URL 이면 새 창
// ════════════════════════════════════════════════════════════════════════════

const DISMISS_KEY = "creaite_event_banner_dismissed";

function getDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

interface EventBannerProps {
  /** 내부 탭 이동 (CTA link 가 /?tab=... 일 때) */
  onNavigate?: (tab: string) => void;
}

export function EventBanner({ onNavigate }: EventBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => getDismissed());
  const [idx, setIdx] = useState(0);

  const banners = useMemo<Banner[]>(
    () => getActiveEventBanners().filter((b) => !dismissed.has(b.id)),
    [dismissed]
  );

  // 여러 개면 6초마다 자동 회전
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 6000);
    return () => clearInterval(t);
  }, [banners.length]);

  // 배너 수 변동 시 인덱스 보정
  useEffect(() => {
    if (idx >= banners.length) setIdx(0);
  }, [banners.length, idx]);

  if (banners.length === 0) return null;
  const b = banners[Math.min(idx, banners.length - 1)];

  const handleClick = () => {
    if (!b.link) return;
    if (/^https?:\/\//i.test(b.link)) {
      window.open(b.link, "_blank", "noopener");
      return;
    }
    try {
      const url = new URL(b.link, window.location.origin);
      const tab = url.searchParams.get("tab");
      if (tab) onNavigate?.(tab);
    } catch {
      /* 잘못된 link 무시 */
    }
  };

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 mt-3">
      {/* 그라데이션 테두리(1px) + 어두운 내부 → 슬림하고 프리미엄, CoverFlow 안 누름 */}
      <div className={`relative rounded-xl p-[1.5px] bg-gradient-to-r ${b.gradient || "from-[#6366f1] to-[#8b5cf6]"}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={b.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="rounded-[10px] bg-[#0d0d0f]/90 backdrop-blur px-3.5 py-2.5 md:px-4 md:py-3 flex items-center gap-3"
          >
            {b.emoji && (
              <div className={`hidden sm:flex w-9 h-9 rounded-lg items-center justify-center text-lg bg-gradient-to-br ${b.gradient || "from-[#6366f1] to-[#8b5cf6]"} flex-shrink-0`}>
                {b.emoji}
              </div>
            )}
            <button onClick={handleClick} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-bold text-white line-clamp-1">
                {b.emoji && <span className="sm:hidden mr-1">{b.emoji}</span>}
                {b.title}
              </p>
              {b.subtitle && (
                <p className="text-[11px] md:text-xs text-gray-400 line-clamp-1 mt-0.5">{b.subtitle}</p>
              )}
            </button>

            {b.ctaLabel && (
              <button
                onClick={handleClick}
                className="hidden sm:flex flex-shrink-0 items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold hover:bg-gray-200 transition-colors"
              >
                {b.ctaLabel}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* 점 네비 (여러 개일 때) */}
            {banners.length > 1 && (
              <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    aria-label={`배너 ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
                  />
                ))}
              </div>
            )}

            <button
              onClick={() => dismiss(b.id)}
              aria-label="닫기"
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
