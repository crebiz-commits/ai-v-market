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
  /** 수신자 이메일. 생략 시 Edge Function이 user_id로 자동 조회 (타인 알림에 유용) */
  to?: string;
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

// ────────────────────────────────────────────────────────────────────────────
// 영수증 메일 템플릿 (결제·구독·라이선스·광고예산 충전 공통)
// ────────────────────────────────────────────────────────────────────────────
export interface ReceiptInfo {
  orderName: string;       // 결제 항목명 (예: "CREAITE 결제")
  amount: number;          // 결제 금액 (원)
  orderId: string;         // 주문 ID
  paymentMethod?: string;  // 결제 방식 (카드, 카카오페이 등)
  paymentDate?: string;    // 결제 일시 (YYYY-MM-DD HH:mm 또는 ISO)
}

function formatReceiptDate(date?: string): string {
  if (date) return date;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function buildSubscriptionReceiptEmail(info: ReceiptInfo): { subject: string; html: string } {
  const safeOrderName = escapeHtml(info.orderName);
  const safeMethod = escapeHtml(info.paymentMethod || "카드");
  const safeOrderId = escapeHtml(info.orderId);
  const safeDate = escapeHtml(formatReceiptDate(info.paymentDate));
  const amountText = (info.amount || 0).toLocaleString("ko-KR");

  const subject = `[CREAITE] ${info.orderName} 결제 영수증`;
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #a78bfa;">결제가 완료되었습니다</h1>
  <p>결제가 정상적으로 처리되었습니다. 아래는 결제 내역입니다.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0; border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; width: 35%; font-weight: 600;">결제 항목</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${safeOrderName}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">결제 금액</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #a78bfa; font-size: 16px;">₩${amountText}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">결제 방식</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${safeMethod}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">결제 일시</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${safeDate}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; font-weight: 600;">주문 번호</th>
      <td style="padding: 12px; font-family: monospace; font-size: 12px; color: #666; word-break: break-all;">${safeOrderId}</td>
    </tr>
  </table>

  <p>구매하신 항목은 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지</a>에서 확인하실 수 있습니다.</p>
  <p style="font-size: 13px; color: #666;">환불·문의는 <a href="mailto:support@creaite.net" style="color: #a78bfa;">support@creaite.net</a>으로 부탁드립니다. <br/>(전자상거래법에 따라 콘텐츠 미사용 시 7일 이내 청약철회 가능합니다.)</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">CREAITE • 세계 최초 AI 시네마 OTT</p>
  <p style="font-size: 12px; color: #999;">알림 설정은 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지 → 설정</a>에서 변경 가능합니다.</p>
</body>
</html>`;
  return { subject, html };
}

// ────────────────────────────────────────────────────────────────────────────
// 댓글 답글 알림 메일 템플릿
// ────────────────────────────────────────────────────────────────────────────
export interface CommentReplyInfo {
  replyAuthorName: string;       // 답글 작성자 이름
  parentCommentContent: string;  // 원댓글 내용 (인용)
  replyContent: string;          // 답글 내용
  videoId?: string;              // 영상 ID (있으면 링크로 사용)
}

export function buildCommentReplyEmail(info: CommentReplyInfo): { subject: string; html: string } {
  const safeReplyAuthor = escapeHtml(info.replyAuthorName || "익명");
  const safeParent = escapeHtml((info.parentCommentContent || "").slice(0, 150));
  const safeReply = escapeHtml((info.replyContent || "").slice(0, 250));

  const subject = `[CREAITE] ${info.replyAuthorName || "익명"}님이 댓글에 답글을 남겼습니다`;
  const videoLink = info.videoId
    ? `https://www.creaite.net/?video=${encodeURIComponent(info.videoId)}`
    : "https://www.creaite.net";

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #a78bfa;">새 답글이 달렸습니다</h1>
  <p><strong>${safeReplyAuthor}</strong>님이 회원님의 댓글에 답글을 남겼습니다.</p>

  <div style="background: #f5f5f5; padding: 14px 16px; border-left: 3px solid #ddd; margin: 18px 0; border-radius: 6px;">
    <p style="font-size: 12px; color: #888; margin: 0 0 6px 0; font-weight: 600;">내 댓글</p>
    <p style="margin: 0; color: #555; font-size: 14px;">${safeParent}</p>
  </div>

  <div style="background: #f0eaff; padding: 14px 16px; border-left: 3px solid #a78bfa; margin: 18px 0; border-radius: 6px;">
    <p style="font-size: 12px; color: #6b46c1; margin: 0 0 6px 0; font-weight: 600;">${safeReplyAuthor}님의 답글</p>
    <p style="margin: 0; color: #333; font-size: 14px;">${safeReply}</p>
  </div>

  <p style="margin: 24px 0;">
    <a href="${escapeHtml(videoLink)}" style="display: inline-block; padding: 10px 24px; background: #a78bfa; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
      대화 보기
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">CREAITE • 세계 최초 AI 시네마 OTT</p>
  <p style="font-size: 12px; color: #999;">이 알림이 부담스러우시면 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지 → 설정 → 알림 설정</a>에서 끄실 수 있습니다.</p>
</body>
</html>`;
  return { subject, html };
}

// ────────────────────────────────────────────────────────────────────────────
// 새 팔로워 알림 메일 템플릿
// ────────────────────────────────────────────────────────────────────────────
export interface NewFollowerInfo {
  followerName: string;       // 팔로워 이름
}

export function buildNewFollowerEmail(info: NewFollowerInfo): { subject: string; html: string } {
  const safeName = escapeHtml(info.followerName || "익명");

  const subject = `[CREAITE] ${info.followerName || "익명"}님이 회원님을 팔로우하기 시작했습니다`;
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #a78bfa;">🎉 새 팔로워가 생겼습니다</h1>
  <p><strong>${safeName}</strong>님이 회원님의 채널을 팔로우하기 시작했습니다.</p>
  <p style="color: #666; font-size: 14px;">앞으로 회원님이 새 영상을 올릴 때마다 ${safeName}님께 자동으로 알림이 전달됩니다.</p>

  <p style="margin: 24px 0;">
    <a href="https://www.creaite.net" style="display: inline-block; padding: 10px 24px; background: #a78bfa; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
      마이 채널 보기
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">CREAITE • 세계 최초 AI 시네마 OTT</p>
  <p style="font-size: 12px; color: #999;">이 알림이 부담스러우시면 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지 → 설정 → 알림 설정</a>에서 끄실 수 있습니다.</p>
</body>
</html>`;
  return { subject, html };
}
