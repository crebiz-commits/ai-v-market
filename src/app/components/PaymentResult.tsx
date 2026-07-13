// ════════════════════════════════════════════════════════════════════════════
// 결제 결과 페이지 (Phase 9)
//
// 진입 경로:
//   - 토스 결제 성공 → /?payment=success&orderId=xxx&paymentKey=xxx&amount=xxx
//   - 토스 결제 실패 → /?payment=fail&code=xxx&message=xxx&orderId=xxx
//
// 동작:
//   - success: Edge Function `toss-confirm` 호출 → 토스 API confirm + DB 업데이트
//   - fail: payments 행을 'failed'로 갱신 + 사용자에게 사유 표시
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { Check, X, Loader2, Home, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import { supabase, supabaseAnonKey } from "../utils/supabaseClient";
import { sendNotification, buildSubscriptionReceiptEmail } from "../utils/sendNotification";
import { useTranslation } from "react-i18next";

const SUPABASE_PROJECT_ID = "tvbpiuwmvrccfnplhwer";
const CONFIRM_ENDPOINT = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/server/toss-confirm`;

interface PaymentResultProps {
  onClose: () => void;  // 홈으로 이동
}

type Status = "processing" | "success" | "failed";

export function PaymentResult({ onClose }: PaymentResultProps) {
  const { t, i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState<string>("");
  const [amount, setAmount] = useState<number | null>(null);
  // 실패 시 "다시 시도" 노출 여부 — 세션 미복원·네트워크 등 재시도로 회복 가능한 경우.
  //   toss-confirm 은 멱등(ALREADY_PROCESSED 성공 수렴 + confirm_payment 멱등)이라 재호출 안전.
  const [canRetry, setCanRetry] = useState(false);
  // P1: 이중 confirm 방지 — StrictMode 재호출/새로고침/리마운트 가드 (BillingResult 와 동일 패턴)
  const processedRef = useRef(false);
  // 재시도용: paymentKey/orderId 를 URL 에서 제거한 뒤에도 재확인 가능하도록 보관 (BillingResult credsRef 패턴)
  const credsRef = useRef<{ orderId: string; paymentKey: string; amount: number } | null>(null);

  // 토스 리다이렉트 복귀 직후엔 Supabase SDK 가 세션을 아직 복원하지 못했을 수 있음 →
  //   토큰이 잡힐 때까지 잠깐 재시도(최대 ~2초). 토큰 없이 서버를 부르면 서버(toss-confirm,
  //   Bearer 필수)가 401 → "결제 실패" 오판되던 버그 예방 (2026-07-13, BillingResult 와 동일 가드).
  const getAccessTokenWithRetry = async (tries = 6, delayMs = 350): Promise<string | undefined> => {
    for (let i = 0; i < tries; i++) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) return session.access_token;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return undefined;
  };

  const confirmPayment = async () => {
    const creds = credsRef.current;
    if (!creds) return;
    setStatus("processing");
    setCanRetry(false);
    setMessage("");
    try {
      const accessToken = await getAccessTokenWithRetry();
      if (!accessToken) {
        // 세션 미복원 — 서버가 인증을 거부하므로 아예 호출하지 않고 재시도 유도(결제는 안전).
        setStatus("failed");
        setCanRetry(true);
        setMessage(isKo
          ? "로그인 세션을 불러오지 못했습니다. 결제는 안전하게 보관되니 잠시 후 '다시 시도'를 눌러 주세요."
          : "Couldn't load your login session. Your payment is safe — please tap 'Try again' in a moment.");
        return;
      }
      const res = await fetch(CONFIRM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ orderId: creds.orderId, paymentKey: creds.paymentKey, amount: creds.amount }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("failed");
        setCanRetry(true); // 서버 멱등 → 재시도가 이중청구를 유발하지 않음
        setMessage(body?.error || t("paymentResult.failMessage", { message: `HTTP ${res.status}` }));
        return;
      }

      setStatus("success");
      setMessage(body?.message || t("paymentResult.successMessage"));

      // Phase 34 — 영수증 메일 발송 (fire-and-forget)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id && user.email && creds.amount) {
          // M5: 서버가 내려준 payment_type 우선 사용(orderId 파싱은 폴백 — 포맷 변경에 취약)
          const orderType = body?.paymentType || creds.orderId.split("-")[1];
          const ORDER_NAMES: Record<string, string> = {
            subscription: "CREAITE 프리미엄 구독 (월)",
            license: "영상 라이선스 구매",
            ad_budget: "광고 예산 충전",
          };
          const { subject, html } = buildSubscriptionReceiptEmail({
            orderName: ORDER_NAMES[orderType] || "CREAITE 결제",
            amount: creds.amount,
            orderId: creds.orderId,
            paymentMethod: body?.method,
          });
          void sendNotification({
            user_id: user.id,
            type: "subscription_receipt",
            to: user.email,
            subject,
            html,
          });
        }
      } catch (mailErr) {
        console.warn("[PaymentResult] 영수증 메일 발송 실패:", mailErr);
      }
    } catch (err: any) {
      setStatus("failed");
      setCanRetry(true);
      setMessage(t("paymentResult.failMessage", { message: err?.message || err }));
    }
  };

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("payment");

    // ── 실패 처리 ──
    if (outcome === "fail") {
      const code = params.get("code") || "UNKNOWN";
      const reason = params.get("message") || t("productDetail.toast.unknownError");
      const orderId = params.get("orderId");

      setStatus("failed");
      setMessage(`${reason} (${code})`);

      // DB에 실패 기록
      if (orderId) {
        supabase
          .rpc("fail_payment", {
            p_order_id: orderId,
            p_failure_code: code,
            p_failure_reason: reason,
          })
          .then(({ error }) => { if (error) console.error("[PaymentResult] fail_payment 실패:", error.message); });  // P6: 무음삼킴 → 로깅
      }
      return;
    }

    // ── 성공 처리 ──
    if (outcome === "success") {
      const orderId = params.get("orderId");
      const paymentKey = params.get("paymentKey");
      const rawAmount = params.get("amount");
      const parsedAmount = rawAmount ? Number(rawAmount) : null;
      if (parsedAmount) setAmount(parsedAmount);

      if (!orderId || !paymentKey || !parsedAmount) {
        setStatus("failed");
        setMessage(t("paymentResult.failMessage", { message: "" }));
        return;
      }

      // P1: paymentKey/orderId 를 URL 에서 즉시 제거 — 새로고침 시 재confirm(이중처리) 방지.
      //   재시도는 credsRef 보관분으로 가능(서버 멱등).
      credsRef.current = { orderId, paymentKey, amount: parsedAmount };
      window.history.replaceState({}, "", window.location.pathname);

      // Edge Function에 confirm 요청 (서버에서 토스 API 호출 + DB 갱신)
      void confirmPayment();
      return;
    }

    // outcome이 success/fail이 아님 → 잘못된 진입
    setStatus("failed");
    setMessage(t("paymentResult.failMessage", { message: "" }));
  }, []);

  const goHome = () => {
    // URL의 쿼리 파라미터 제거 후 홈으로
    window.history.replaceState({}, "", window.location.pathname);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-8 text-center"
      >
        {status === "processing" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#6366f1]/15 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t("app.loading")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("upload.uploadingState")}
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-green-400">{t("paymentResult.successTitle")}</h2>
            {amount && (
              <p className="text-2xl font-black text-[#8b5cf6] mb-2">
                ₩{amount.toLocaleString()}
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-6">{message}</p>
            <Button
              onClick={goHome}
              className="w-full gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
            >
              <Home className="w-4 h-4" />
              {t("paymentResult.goHome")}
            </Button>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/15 flex items-center justify-center">
              <X className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2 text-red-400">{t("paymentResult.failTitle")}</h2>
            <p className="text-sm text-muted-foreground mb-6 break-words">{message}</p>
            {canRetry && (
              <Button
                onClick={() => void confirmPayment()}
                className="w-full gap-2 mb-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
              >
                <RotateCw className="w-4 h-4" />
                {isKo ? "다시 시도" : "Try again"}
              </Button>
            )}
            <Button
              onClick={goHome}
              variant="outline"
              className="w-full gap-2"
            >
              <Home className="w-4 h-4" />
              {t("paymentResult.goHome")}
            </Button>
            <p className="text-[11px] text-muted-foreground/60 mt-4">
              {t("paymentResult.tryAgain")}
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
