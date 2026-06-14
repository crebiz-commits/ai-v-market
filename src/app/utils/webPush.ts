// ════════════════════════════════════════════════════════════════════════════
// 웹 푸시 구독 유틸 (2026-05-31)
//
// 사용: NotificationSettings 의 "이 기기에서 푸시 받기" 토글에서 호출.
//   await subscribeToPush()   → 권한요청 + 구독 + DB 저장(save_push_subscription)
//   await unsubscribeFromPush()
// 발송은 Edge Function /send-push 가 service_role 로 push_subscriptions 조회 후 web-push.
//
// iOS 한계: 사파리 일반 탭은 미지원. "홈 화면에 추가"한 PWA + iOS 16.4+ 에서만 동작.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabaseClient";

// VAPID 공개키 — 브라우저에 공개되는 값이라 코드 내장 안전(비밀은 private key뿐, Edge 시크릿 보관).
// 환경변수(VITE_VAPID_PUBLIC_KEY)가 있으면 우선, 없으면 아래 기본값 사용 → Vercel env 누락에도 푸시 동작.
const VAPID_PUBLIC =
  (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY ||
  "BFfca01CqmKW4GngZAPbUIntj4a39HHIhgN2-Wjw-RDAU-0r2eKPil3-2CUGVwoBm3fZMJCCC-AREEM-dXhgC4Y";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) throw new Error("이 브라우저/기기는 웹 푸시를 지원하지 않습니다. (iOS는 홈화면에 설치한 PWA만 가능)");
  if (!VAPID_PUBLIC) throw new Error("푸시 설정(VAPID 공개키)이 없습니다. 관리자에게 문의하세요.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
  }
  const json: any = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    // supabase rpc 빌더는 .catch 가 없으므로 try/catch 로 (이전 .catch 체이닝이 런타임 에러였음)
    try { await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint }); } catch { /* ignore */ }
    try { await sub.unsubscribe(); } catch { /* ignore */ }
  }
}
