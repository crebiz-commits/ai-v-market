// ════════════════════════════════════════════════════════════════════════════
// 자동결제 카드 등록 결과 페이지 (2026-06-12)
//   토스 빌링 인증 후 진입:
//     성공 → /?billing=success&customerKey=xxx&authKey=xxx
//     실패 → /?billing=fail&code=xxx&message=xxx
//   성공 시 Edge Function billing-auth-confirm 호출 → 빌링키 발급 + 첫 결제 + 구독 활성
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, X, Loader2, Home, Crown, RotateCw } from "lucide-react";
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
  // 실패 시 "다시 시도" 노출 여부 (세션 미복원·네트워크·일시 오류 등 재시도로 회복 가능한 경우)
  const [canRetry, setCanRetry] = useState(false);
  // C5(2026-06-14): 이중 청구 방지 — 한 번만 자동 처리(StrictMode 재호출/재마운트 가드)
  const processedRef = useRef(false);
  // 재시도용: authKey 를 URL 에서 제거한 뒤에도 재확인 가능하도록 보관.
  //   서버가 멱등(billing-auth-confirm: P5 활성구독 스킵 + Idempotency-Key)이라 재호출해도 이중청구 없음.
  const credsRef = useRef<{ authKey: string; customerKey: string } | null>(null);

  // 토스 리다이렉트 복귀 직후엔 Supabase SDK 가 세션을 아직 복원하지 못했을 수 있음 →
  //   토큰이 잡힐 때까지 잠깐 재시도(최대 ~2초). 못 잡으면 undefined 반환.
  //   토큰 없이 서버를 부르면 401 로 "설정 실패" 오판 → 카드가 등록됐는데도 실패로 보이는 버그를 예방.
  const getAccessTokenWithRetry = async (tries = 6, delayMs = 350): Promise<string | undefined> => {
    for (let i = 0; i < tries; i++) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) return session.access_token;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return undefined;
  };

  const confirmBilling = async () => {
    const creds = credsRef.current;
    if (!creds) return;
    setStatus("processing");
    setCanRetry(false);
    setMessage("");
    try {
      const accessToken = await getAccessTokenWithRetry();
      if (!accessToken) {
        // 세션 미복원 — 서버가 인증을 거부하므로 아예 호출하지 않고 재시도 유도(카드는 안전).
        setStatus("failed");
        setCanRetry(true);
        setMessage(isKo
          ? "로그인 세션을 불러오지 못했습니다. 카드는 안전하게 처리되니 잠시 후 다시 시도해 주세요."
          : "Couldn't load your login session. Your card is safe — please try again in a moment.");
        return;
      }
      const res = await fetch(BILLING_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(creds),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("failed");
        // 서버가 멱등이라 재시도가 이중청구를 유발하지 않음 → 실패 시 항상 재시도 허용.
        setCanRetry(true);
        setMessage(body?.error || (isKo ? "자동결제 설정에 실패했습니다." : "Setup failed."));
        return;
      }
      setStatus("success");
      setMessage(body?.message || (isKo ? "자동결제가 설정되었습니다. 매월 자동으로 갱신됩니다." : "Auto-pay is set up."));
    } catch (err: any) {
      setStatus("failed");
      setCanRetry(true);
      setMessage(err?.message || String(err));
    }
  };

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

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
      credsRef.current = { authKey, customerKey };
      // authKey 를 URL 에서 즉시 제거 — 새로고침 시 재처리(이중 청구) 방지.
      // 처리 중 화면은 state 로 유지되고, 새로고침하면 쿼리가 없어 일반 앱 홈으로.
      window.history.replaceState({}, "", window.location.pathname);
      confirmBilling();
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
            {canRetry && (
              <Button onClick={confirmBilling} className="w-full gap-2 mb-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">
                <RotateCw className="w-4 h-4" /> {isKo ? "다시 시도" : "Try again"}
              </Button>
            )}
            <Button onClick={onClose} variant="outline" className="w-full gap-2">
              <Home className="w-4 h-4" /> {isKo ? "홈으로" : "Home"}
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
}
