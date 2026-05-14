// ════════════════════════════════════════════════════════════════════════════
// 영상 공유 모달 (Phase 19)
//
// 메이저 플랫폼 스타일 — 링크 복사 + 주요 SNS 공유 버튼.
// - 링크 복사 (clipboard) ⭐ 가장 많이 사용
// - X (트위터)
// - 페이스북
// - 카카오톡 — 링크 복사 + 안내 (Kakao SDK 미연동 시)
// - 텔레그램
// - WhatsApp
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Copy, Check, Send } from "lucide-react";
import { toast } from "sonner";

interface ShareModalProps {
  open: boolean;
  url: string;            // 공유할 URL
  title: string;          // 영상 제목
  text?: string;          // 공유 텍스트 (예: "CREAITE: 우주소녀 정란이")
  onClose: () => void;
}

interface ShareTarget {
  key: string;
  label: string;
  bgColor: string;
  textColor?: string;
  icon: string;            // 이모지 또는 SVG (단순)
  getUrl: (url: string, text: string) => string | null;  // null이면 클립보드 복사 안내
}

const TARGETS: ShareTarget[] = [
  {
    key: "x",
    label: "X (트위터)",
    bgColor: "bg-black",
    textColor: "text-white",
    icon: "𝕏",
    getUrl: (url, text) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    key: "facebook",
    label: "페이스북",
    bgColor: "bg-[#1877F2]",
    textColor: "text-white",
    icon: "f",
    getUrl: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    key: "kakao",
    label: "카카오톡",
    bgColor: "bg-[#FEE500]",
    textColor: "text-black",
    icon: "💬",
    getUrl: () => null,    // 클립보드 복사 + 안내 (Kakao SDK 미연동)
  },
  {
    key: "telegram",
    label: "텔레그램",
    bgColor: "bg-[#0088CC]",
    textColor: "text-white",
    icon: "✈️",
    getUrl: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    bgColor: "bg-[#25D366]",
    textColor: "text-white",
    icon: "📱",
    getUrl: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`,
  },
];

export function ShareModal({ open, url, title, text, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const shareText = text || `CREAITE: ${title}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("링크가 복사되었습니다");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("복사 실패 — 직접 선택해서 복사해주세요");
    }
  };

  const handleShareClick = async (target: ShareTarget) => {
    const shareUrl = target.getUrl(url, shareText);

    if (shareUrl === null) {
      // 카카오톡 등 — 링크 복사 + 안내
      try {
        await navigator.clipboard.writeText(`${shareText}\n${url}`);
        toast.success(`${target.label}로 보내려면 링크가 복사됐어요. 직접 붙여넣기 해주세요!`);
      } catch {
        toast.error("복사 실패");
      }
      return;
    }

    // 외부 URL 열기 (새 창)
    window.open(shareUrl, "_blank", "width=600,height=600,noopener,noreferrer");
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[151] mx-auto max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-[#6366f1]" />
                <h3 className="font-bold text-base">공유</h3>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Title */}
            <div className="px-5 py-4 border-b border-border">
              <p className="text-sm font-semibold truncate">{title}</p>
            </div>

            {/* Link Copy */}
            <div className="px-5 py-4 border-b border-border">
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">링크</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="input-base flex-1 text-xs font-mono"
                />
                <button
                  onClick={copyLink}
                  className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${
                    copied
                      ? "bg-green-500/20 text-green-400"
                      : "bg-[#6366f1] text-white hover:opacity-90"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      복사됨
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      복사
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SNS Buttons */}
            <div className="px-5 py-4">
              <label className="block text-xs font-bold text-muted-foreground mb-2.5">SNS 공유</label>
              <div className="grid grid-cols-5 gap-2">
                {TARGETS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => handleShareClick(t)}
                    className={`${t.bgColor} ${t.textColor || ""} flex flex-col items-center gap-1 p-3 rounded-xl hover:opacity-90 active:scale-95 transition-all`}
                    title={t.label}
                  >
                    <span className="text-lg font-bold leading-none">{t.icon}</span>
                    <span className="text-[10px] font-bold leading-tight text-center">{t.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-3 text-center">
                💬 카카오톡은 링크가 복사된 후 직접 붙여넣기로 공유해주세요
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
