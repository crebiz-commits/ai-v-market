// ════════════════════════════════════════════════════════════════════════════
// 자동결제 카드 등록 결과 페이지 (2026-06-12)
//   토스 빌링 인증 후 진입:
//     성공 → /?billing=success&customerKey=xxx&authKey=xxx
//     실패 → /?billing=fail&code=xxx&message=xxx
//   성공 시 Edge Function billing-auth-confirm 호출 → 빌링키 발급 + 첫 결제 + 구독 활성
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, X, Loader2, Home, Crown } from "lucide-react";
import { Button } from "./ui/button";
import { supabase, supabaseAnonKey } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";

const SUPABASE_PROJECT_ID = "tvbpiuwmvrccfnplhwer";
const BILLING_ENDPOINT = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/server/billing-auth-confirm`;

interface Props {
  onClose: () => void;
}
type Status = "processing" | "success" | "failed";

export function BillingResult({ onClose }: Props) {
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("billing");

    if (outcome === "fail") {
      const reason = params.get("message") || (isKo ? "카드 등록이 취소되었거나 실패했습니다." : "Card registration failed.");
      setStatus("failed");
      setMessage(reason);
      return;
    }

    if (outcome === "success") {
      const authKey = params.get("authKey");
      const customerKey = params.get("customerKey");
      if (!authKey || !customerKey) {
        setStatus("failed");
        setMessage(isKo ? "잘못된 접근입니다." : "Invalid request.");
        return;
      }
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const accessToken = session?.access_token;
          const res = await fetch(BILLING_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseAnonKey,
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({ authKey, customerKey }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setStatus("failed");
            setMessage(body?.error || (isKo ? "자동결제 설정에 실패했습니다." : "Setup failed."));
            return;
          }
          setStatus("success");
          setMessage(body?.message || (isKo ? "자동결제가 설정되었습니다. 매월 자동으로 갱신됩니다." : "Auto-pay is set up."));
        } catch (err: any) {
          setStatus("failed");
          setMessage(err?.message || String(err));
        }
      })();
      return;
    }

    // 알 수 없는 진입
    setStatus("failed");
    setMessage(isKo ? "잘못된 접근입니다." : "Invalid request.");
  }, []);

  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0a] p-6">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center">
        {status === "processing" && (
          <>
            <Loader2 className="w-12 h-12 text-[#6366f1] animate-spin mx-auto mb-4" />
            <p className="text-foreground font-semibold">{isKo ? "자동결제 설정 중…" : "Setting up…"}</p>
            <p className="text-xs text-muted-foreground mt-1">{isKo ? "잠시만 기다려 주세요." : "Please wait."}</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
              <Crown className="w-8 h-8 text-white" />
            </div>
            <p className="text-xl font-black text-white mb-1">{isKo ? "프리미엄 시작!" : "Premium activated!"}</p>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button onClick={onClose} className="w-full gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
              <Check className="w-4 h-4" /> {isKo ? "완료" : "Done"}
            </Button>
          </>
        )}
        {status === "failed" && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-xl font-black text-white mb-1">{isKo ? "설정 실패" : "Failed"}</p>
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button onClick={onClose} variant="outline" className="w-full gap-2">
              <Home className="w-4 h-4" /> {isKo ? "홈으로" : "Home"}
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
