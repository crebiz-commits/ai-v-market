// 크리에이터 초대(레퍼럴) 카드 — 마이페이지 설정 탭.
// get_my_referral RPC로 내 초대코드/초대수를 읽어 링크 복사·공유 제공.
// 마이그레이션(referral_20260618.sql) 미적용 시 RPC가 없어 code가 비면 안전하게 숨김.
import { useEffect, useState } from "react";
import { Gift, Copy, Share2, Check } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function ReferralCard() {
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "ko").startsWith("ko");
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_my_referral");
      if (!alive || error || !data) return;
      setCode((data as any).code ?? null);
      setCount((data as any).count ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!code) return null; // 비로그인/마이그레이션 미적용 시 숨김

  const link = `${window.location.origin}/?ref=${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(isKo ? "초대 링크가 복사되었어요" : "Invite link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(isKo ? "복사에 실패했어요" : "Copy failed");
    }
  };

  const share = async () => {
    const text = isKo
      ? "AI 영상 올리고 수익 만드세요 — 플랫폼은 가져가고, CREAITE는 돌려드립니다."
      : "Upload your AI videos and earn — big platforms take, CREAITE gives it back.";
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: "CREAITE", text, url: link });
      } catch {
        /* 사용자가 취소 */
      }
    } else {
      void copy();
    }
  };

  return (
    <div className="bg-gradient-to-br from-[#6366f1]/10 to-[#ec4899]/10 p-5 md:p-6 rounded-2xl border border-white/10 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Gift className="w-5 h-5 text-[#a78bfa]" />
        <h3 className="font-bold text-white">{isKo ? "크리에이터 초대하기" : "Invite creators"}</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        {isKo ? "친구를 초대하면 함께 배급사가 됩니다. 지금까지 초대: " : "Invite friends to become distributors together. Invited so far: "}
        <span className="font-bold text-white">{count}</span>
        {isKo ? "명" : ""}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 px-3 py-3 rounded-xl bg-black/30 border border-white/10 text-sm text-gray-300 truncate">
          {link}
        </div>
        <Button
          onClick={copy}
          className="shrink-0 h-11 px-4 bg-white/10 hover:bg-white/20 border border-white/10"
          aria-label={isKo ? "링크 복사" : "Copy link"}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
        <Button
          onClick={share}
          className="shrink-0 h-11 px-4 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
          aria-label={isKo ? "공유" : "Share"}
        >
          <Share2 className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-[11px] text-gray-500 mt-3">
        {isKo
          ? "※ 초대 보상은 노출·배지로 우선 제공되며, 결제 오픈 후 현금 보상으로 확대됩니다."
          : "※ Rewards start as exposure & badges, expanding to cash after payments launch."}
      </p>
    </div>
  );
}
