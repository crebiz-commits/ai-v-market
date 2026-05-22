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
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, X, Loader2, Home } from "lucide-react";
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
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState<string>("");
  const [amount, setAmount] = useState<number | null>(null);

  useEffect(() => {
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
          .then(() => { /* 결과 무시 */ });
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

      // Edge Function에 confirm 요청 (서버에서 토스 API 호출 + DB 갱신)
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const accessToken = session?.access_token;

          const res = await fetch(CONFIRM_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseAnonKey,
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({ orderId, paymentKey, amount: parsedAmount }),
          });

          const body = await res.json().catch(() => ({}));

          if (!res.ok) {
            setStatus("failed");
            setMessage(body?.error || t("paymentResult.failMessage", { message: `HTTP ${res.status}` }));
            return;
          }

          setStatus("success");
          setMessage(body?.message || t("paymentResult.successMessage"));

          // Phase 34 — 영수증 메일 발송 (fire-and-forget)
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id && user.email && parsedAmount) {
              const { subject, html } = buildSubscriptionReceiptEmail({
                orderName: "CREAITE 결제",
                amount: parsedAmount,
                orderId,
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
          setMessage(t("paymentResult.failMessage", { message: err?.message || err }));
        }
      })();
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
