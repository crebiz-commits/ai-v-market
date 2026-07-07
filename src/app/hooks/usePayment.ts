// ════════════════════════════════════════════════════════════════════════════
// 토스페이먼츠 결제 훅 (Phase 9)
//
// 사용법:
//   const { startSubscription, startLicensePurchase, startAdBudgetTopUp } = usePayment();
//   await startSubscription();  // 구독 결제 (₩4,900)
//
// 결제 흐름:
//   1. start_payment RPC 호출 → 우리 DB에 pending 결제 행 + order_id 발급
//   2. 토스 SDK requestPayment → 토스 결제창으로 이동 (별도 URL)
//   3. 결제 완료 → successUrl(/?payment=success)로 redirect → PaymentResult가 처리
//   4. 결제 실패/취소 → failUrl(/?payment=fail)로 redirect
// ════════════════════════════════════════════════════════════════════════════
import { loadTossPayments } from "@tosspayments/payment-sdk";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

const TOSS_CLIENT_KEY = (import.meta as any).env?.VITE_TOSS_CLIENT_KEY || "";

interface StartPaymentOptions {
  paymentType: "subscription" | "license" | "ad_budget";
  amount: number;
  orderName: string;       // 토스 결제창에 표시될 주문명
  targetId?: string;       // license=video_id, ad_budget=ad_id
  customerEmail?: string;
  customerName?: string;
}

async function startTossPayment(options: StartPaymentOptions) {
  if (!TOSS_CLIENT_KEY) {
    toast.error("결제 키가 설정되지 않았습니다. 관리자에게 문의하세요.");
    throw new Error("VITE_TOSS_CLIENT_KEY 미설정");
  }

  // 1) 우리 DB에 pending 결제 행 생성 + order_id 발급
  const { data: orderId, error } = await supabase.rpc("start_payment", {
    p_payment_type: options.paymentType,
    p_amount: options.amount,
    p_target_id: options.targetId ?? null,
  });

  if (error || !orderId) {
    toast.error("결제 시작 실패: " + (error?.message || "알 수 없는 오류"));
    throw error || new Error("orderId 발급 실패");
  }

  // 2) 토스페이먼츠 SDK 로드 + 결제 요청
  const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);

  const origin = window.location.origin;
  await tossPayments.requestPayment("카드", {
    amount: options.amount,
    orderId,
    orderName: options.orderName,
    customerEmail: options.customerEmail,
    customerName: options.customerName,
    successUrl: `${origin}/?payment=success`,
    failUrl: `${origin}/?payment=fail`,
  });
  // 위 함수가 호출되면 토스 결제 페이지로 이동 (또는 결제창 띄움) — 여기 이후 코드는 실행 안 됨
}

/** 자동결제(빌링) 카드 등록 시작 — 성공 시 ?billing=success&authKey=&customerKey= 로 리다이렉트 */
async function startBillingAuth(customerKey: string, customerEmail?: string) {
  if (!TOSS_CLIENT_KEY) {
    toast.error("결제 키가 설정되지 않았습니다. 관리자에게 문의하세요.");
    throw new Error("VITE_TOSS_CLIENT_KEY 미설정");
  }
  // B-2(2026-07-08): 결제 게이트 — live 키 전환 전(payments_enabled=0)엔 카드창 열기 전에 안내.
  //   서버(billing-auth-confirm)에도 같은 게이트가 있어 우회 불가 — 여기는 UX용 사전 차단.
  //   조회 실패 시 진행(fail-open) — 서버 게이트가 최종 방어선.
  try {
    const { data: payGate } = await supabase.rpc("get_platform_setting", { p_key: "payments_enabled" });
    if (payGate !== null && payGate !== undefined && Number(payGate) < 1) {
      toast.info("결제 기능 준비 중입니다. 정식 오픈 후 이용해 주세요.");
      throw Object.assign(new Error("결제 기능 준비 중"), { code: "PAYMENTS_DISABLED" });
    }
  } catch (e: any) {
    if (e?.code === "PAYMENTS_DISABLED") throw e;
    /* 설정 조회 실패는 무시하고 진행 */
  }
  const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
  const origin = window.location.origin;
  await (tossPayments as any).requestBillingAuth("카드", {
    customerKey,
    customerEmail,
    successUrl: `${origin}/?billing=success`,
    failUrl: `${origin}/?billing=fail`,
  });
  // 토스 카드 등록 페이지로 이동 — 이후 코드 실행 안 됨
}

export function usePayment() {
  /** 프리미엄 구독 결제 시작 (월 ₩4,900) */
  const startSubscription = async (params?: { email?: string; name?: string }) => {
    // platform_settings에서 가격 조회
    let amount = 4900;
    try {
      const { data } = await supabase.rpc("get_platform_setting", {
        p_key: "subscription_price_krw",
      });
      if (data && Number(data) > 0) amount = Number(data);
    } catch {
      // 정책 조회 실패 시 기본값 사용
    }

    await startTossPayment({
      paymentType: "subscription",
      amount,
      orderName: `CREAITE 프리미엄 구독 (월)`,
      customerEmail: params?.email,
      customerName: params?.name,
    });
  };

  /** 영상 라이선스 결제 시작 */
  const startLicensePurchase = async (params: {
    videoId: string;
    amount: number;
    videoTitle: string;
    email?: string;
    name?: string;
  }) => {
    await startTossPayment({
      paymentType: "license",
      amount: params.amount,
      orderName: `라이선스 — ${params.videoTitle}`,
      targetId: params.videoId,
      customerEmail: params.email,
      customerName: params.name,
    });
  };

  /** 광고 예산 충전 (광고주가 본인 광고 예산 증액) */
  const startAdBudgetTopUp = async (params: {
    adId: string;
    amount: number;
    adTitle: string;
    email?: string;
    name?: string;
  }) => {
    await startTossPayment({
      paymentType: "ad_budget",
      amount: params.amount,
      orderName: `광고 예산 충전 — ${params.adTitle}`,
      targetId: params.adId,
      customerEmail: params.email,
      customerName: params.name,
    });
  };

  /** 자동결제(정기구독) 카드 등록 시작 */
  const startAutoBilling = async (params: { customerKey: string; email?: string }) => {
    await startBillingAuth(params.customerKey, params.email);
  };

  return { startSubscription, startLicensePurchase, startAdBudgetTopUp, startAutoBilling };
}
