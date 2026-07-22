// 장바구니 패널 (구 장바구니 — 2026-05-27 결제 흐름 제거 후 단순 장바구니로 명칭 복귀)
// 결제는 ProductDetail 의 "구매하기" 버튼으로 단건 진행. 본 패널은 보관 + 영상 페이지 이동만.
import { X, ShoppingCart, Trash2, Play, Package, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";
import { licenseLabel } from "../utils/licensePricing";

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
  onPurchase?: (item: CartItem) => void;   // 항목별 라이선스 구매(단건 흐름 재사용)
  onClose: () => void;
}

export function CartPanel({ items, onRemove, onViewVideo, onPurchase, onClose }: CartPanelProps) {
  const { t } = useTranslation();
  const total = items.reduce((s, it) => s + (it.price || 0), 0);

  const handleViewVideo = (videoId: string) => {
    onViewVideo(videoId);
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-[#111] border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-[#8b5cf6]" />
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
                      {licenseLabel(item.licenseType)}
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
                <div className="flex gap-2 mt-3">
                  {onPurchase && (
                    <Button
                      onClick={() => onPurchase(item)}
                      className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white text-xs font-bold gap-1.5 h-9"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      {t("cartPanel.buyNow", "구매하기")}
                    </Button>
                  )}
                  <Button
                    onClick={() => handleViewVideo(item.videoId)}
                    variant="ghost"
                    aria-label={t("cartPanel.viewVideo")}
                    className={`bg-white/10 hover:bg-white/20 text-white text-xs font-bold gap-1.5 h-9 ${onPurchase ? "px-3" : "flex-1"}`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    {!onPurchase && t("cartPanel.viewVideo")}
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* 합계 + 안내 — 라이선스는 영상별 개별 구매(일괄 단일결제는 추후) */}
      {items.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/10 px-4 py-3 bg-[#0d0d0d]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-400">{t("cartPanel.total", "합계")} · {items.length}</span>
            <span className="text-base font-black text-white">₩{total.toLocaleString()}</span>
          </div>
          <p className="text-[11px] text-gray-500">{t("cartPanel.perItemNote", "라이선스는 영상별로 구매합니다. 각 항목의 '구매하기'로 결제하세요.")}</p>
        </div>
      )}
    </div>
  );
}
