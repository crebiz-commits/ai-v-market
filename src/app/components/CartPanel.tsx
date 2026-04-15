import { X, ShoppingCart, Trash2, CreditCard, Package } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { toast } from "sonner";

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
  onClose: () => void;
}

const LICENSE_LABELS: Record<string, string> = {
  standard: "스탠다드",
  commercial: "상업용",
  extended: "확장",
};

export function CartPanel({ items, onRemove, onClose }: CartPanelProps) {
  const total = items.reduce((sum, item) => sum + item.price, 0);

  const handleCheckout = () => {
    toast.info("결제 기능은 준비 중입니다. 곧 오픈됩니다!", {
      duration: 3000,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#111] border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-[#8b5cf6]" />
          <span className="font-semibold text-white">장바구니</span>
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
            <p className="text-gray-400 font-medium">장바구니가 비어있습니다</p>
            <p className="text-gray-600 text-sm mt-1">마음에 드는 영상을 담아보세요</p>
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
                className="flex gap-3 mb-3 bg-white/5 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-black">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
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
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/10 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-400 text-sm">총 {items.length}개</span>
            <span className="text-white font-bold text-lg">₩{total.toLocaleString()}</span>
          </div>
          <Button
            onClick={handleCheckout}
            className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold gap-2 shadow-lg shadow-[#6366f1]/20"
          >
            <CreditCard className="w-4 h-4" />
            구매하기
          </Button>
          <p className="text-center text-xs text-gray-600 mt-2">결제 기능 준비 중</p>
        </div>
      )}
    </div>
  );
}
