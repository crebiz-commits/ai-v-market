// 장바구니 패널 (구 장바구니 — 2026-05-27 결제 흐름 제거 후 단순 장바구니로 명칭 복귀)
// 결제는 ProductDetail 의 "구매하기" 버튼으로 단건 진행. 본 패널은 보관 + 영상 페이지 이동만.
import { X, Gift, Trash2, Play, Package } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";

export interface CartItem {
  id: string;
  videoId: string;
  thumbnail: string;
  title: string;
  creator: string;
  licenseType: "standard" | "commercial" | "extended";
  price: number;
}

interface CartPanelProps {
  items: CartItem[];
  onRemove: (itemId: string) => void;
  onViewVideo: (videoId: string) => void;
  onClose: () => void;
}

export function CartPanel({ items, onRemove, onViewVideo, onClose }: CartPanelProps) {
  const { t } = useTranslation();

  const LICENSE_LABELS: Record<string, string> = {
    standard: "Standard",
    commercial: "Commercial",
    extended: "Extended",
  };

  const handleViewVideo = (videoId: string) => {
    onViewVideo(videoId);
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-[#111] border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-[#8b5cf6]" />
          <span className="font-semibold text-white">{t("cartPanel.title")}</span>
          {items.length > 0 && (
            <span className="px-1.5 py-0.5 bg-[#6366f1] rounded-full text-xs text-white font-bold">
              {items.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-gray-600" />
            </div>
            <p className="text-gray-400 font-medium">{t("cartPanel.empty")}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col mb-3 bg-white/5 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="flex gap-3">
                  <button
                    onClick={() => handleViewVideo(item.videoId)}
                    className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-black hover:opacity-80 transition-opacity"
                    aria-label={item.title}
                  >
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                    <p className="text-xs text-gray-500 mb-1">{item.creator}</p>
                    <span className="inline-block px-2 py-0.5 bg-[#6366f1]/20 text-[#a78bfa] text-xs rounded-full">
                      {LICENSE_LABELS[item.licenseType]}
                    </span>
                    <p className="text-sm font-bold text-white mt-1">
                      ₩{item.price.toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(item.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 transition-colors self-start flex-shrink-0"
                    aria-label={t("cartPanel.remove")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <Button
                  onClick={() => handleViewVideo(item.videoId)}
                  className="w-full mt-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold gap-1.5 h-9"
                  variant="ghost"
                >
                  <Play className="w-3.5 h-3.5" />
                  {t("cartPanel.viewVideo")}
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
