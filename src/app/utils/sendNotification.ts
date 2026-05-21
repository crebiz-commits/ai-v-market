// ════════════════════════════════════════════════════════════════════════════
// Phase 34 — 알림 발송 utility
//
// 사용:
//   import { sendNotification, buildWelcomeEmail } from '../utils/sendNotification';
//   void sendNotification({ user_id, type: 'welcome', to, subject, html });
//
// 동작:
//   - Edge Function /server/send-email 호출
//   - should_send_notification RPC가 사용자 설정 확인 (서버측)
//   - Resend로 발송 + notification_log 기록
//   - 실패해도 호출자 흐름 방해 안 함 (fire-and-forget 권장)
// ════════════════════════════════════════════════════════════════════════════

import { projectId, publicAnonKey } from "../../../utils/supabase/info";

const serverUrl = `https://${projectId}.supabase.co/functions/v1/server`;

export type NotificationType =
  | "welcome"
  | "subscription_receipt"
  | "new_video_from_followed"
  | "comment_reply"
  | "new_follower"
  | "revenue_settled"
  | "report_result"
  | "ad_budget_low";

interface SendNotificationResult {
  success: boolean;
  skipped?: boolean;
  message_id?: string;
  error?: string;
}

// HTML 본문에 사용자 입력 삽입 시 XSS 방어
export function escapeHtml(str: string | null | undefined): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendNotification(params: {
  user_id: string;
  type: NotificationType;
  to: string;
  subject: string;
  html: string;
}): Promise<SendNotificationResult> {
  try {
    const res = await fetch(`${serverUrl}/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn("[sendNotification] 발송 실패:", data);
      return { success: false, error: data?.error || "Unknown error" };
    }
    return data;
  } catch (err: any) {
    console.warn("[sendNotification] 예외:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 환영 메일 템플릿
// ────────────────────────────────────────────────────────────────────────────
export function buildWelcomeEmail(name: string): { subject: string; html: string } {
  const safeName = escapeHtml(name || "CREAITE 회원");
  const subject = "CREAITE에 오신 것을 환영합니다";
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #a78bfa;">CREAITE에 오신 것을 환영합니다!</h1>
  <p>${safeName}님, 가입을 환영합니다.</p>
  <p>CREAITE는 세계 최초 AI 시네마 OTT 서비스입니다. AI 크리에이터의 영화를 감상하고, 광고·판매 수익을 받는 새로운 플랫폼입니다.</p>
  <h2 style="color: #555;">이렇게 시작해보세요</h2>
  <ul>
    <li><a href="https://www.creaite.net" style="color: #a78bfa;">홈에서 추천 영상 둘러보기</a></li>
    <li>관심 가는 크리에이터 팔로우하기</li>
    <li>본인의 AI 영상 업로드하기</li>
  </ul>
  <p>문의는 <a href="mailto:support@creaite.net" style="color: #a78bfa;">support@creaite.net</a>으로 부탁드립니다.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">CREAITE • 세계 최초 AI 시네마 OTT</p>
  <p style="font-size: 12px; color: #999;">알림 설정은 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지 → 설정</a>에서 변경 가능합니다.</p>
</body>
</html>`;
  return { subject, html };
}
