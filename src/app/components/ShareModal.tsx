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
import { useTranslation } from "react-i18next";
import { isKakaoConfigured, shareToKakao } from "../utils/kakaoShare";

interface ShareModalProps {
  open: boolean;
  url: string;            // 공유할 URL
  title: string;          // 영상 제목
  text?: string;          // 공유 텍스트 (예: "CREAITE: 우주소녀 정란이")
  thumbnail?: string;     // 카카오 공유 카드 이미지(절대 https URL). 없으면 텍스트 형식.
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

export function ShareModal({ open, url, title, text, thumbnail, onClose }: ShareModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const shareText = text || `CREAITE: ${title}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("shareModal.linkCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("shareModal.copyFailed"));
    }
  };

  const handleShareClick = async (target: ShareTarget) => {
    // 카카오톡: SDK 연동 시 실제 공유 카드 전송, 실패 시 클립보드 폴백
    if (target.key === "kakao" && isKakaoConfigured()) {
      const ok = await shareToKakao({ title, description: shareText, imageUrl: thumbnail, link: url });
      if (ok) return;
      // 실패하면 아래 클립보드 폴백으로 진행
    }

    const shareUrl = target.getUrl(url, shareText);

    if (shareUrl === null) {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${url}`);
        toast.success(t("shareModal.linkCopied"));
      } catch {
        toast.error(t("shareModal.copyFailed"));
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
                <h3 className="font-bold text-base">{t("shareModal.title")}</h3>
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
              <label className="block text-xs font-bold text-muted-foreground mb-1.5">{t("common.copy")}</label>
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
                      {t("common.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {t("common.copy")}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SNS Buttons */}
            <div className="px-5 py-4">
              <label className="block text-xs font-bold text-muted-foreground mb-2.5">{t("shareModal.title")}</label>
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
                💬 Kakao requires copying the link and pasting it manually
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
