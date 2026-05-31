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
import { supabase } from "./supabaseClient";

const serverUrl = `https://${projectId}.supabase.co/functions/v1/server`;

export type NotificationType =
  | "welcome"
  | "subscription_receipt"
  | "new_video_from_followed"
  | "comment_reply"
  | "new_follower"
  | "revenue_settled"
  | "report_result"
  | "ad_budget_low"
  | "refund_completed";

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
  /** 인앱 알림(벨)/웹 푸시 클릭 시 이동할 경로. 생략 시 Edge Function이 타입별 기본값 사용 */
  link?: string;
}): Promise<SendNotificationResult> {
  try {
    // H1: /send-email 은 호출자 인증을 요구 → 사용자 access token 전달 (anon key 아님)
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    const res = await fetch(`${serverUrl}/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publicAnonKey,
        Authorization: `Bearer ${accessToken || publicAnonKey}`,
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
  <p style="font-size: 12px; color: #999; margin: 0 0 4px 0;">CREAITE • 세계 최초 AI 시네마 OTT</p>
  <p style="font-size: 11px; color: #aaa; line-height: 1.7; margin: 0 0 4px 0;">
    상호 크레비즈 · 대표자 이현우 · 사업자등록번호 107-10-27099<br>
    통신판매업 신고 제 2020-경기파주-0327호 · 호스팅 Vercel Inc.<br>
    주소 경기도 파주시 평화로342번길 71-5, A동 (검산동)<br>
    고객문의 <a href="mailto:support@creaite.net" style="color: #a78bfa;">support@creaite.net</a>
  </p>
  <p style="font-size: 12px; color: #999; margin: 8px 0 0 0;">알림 설정은 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지 → 설정</a>에서 변경 가능합니다.</p>
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
// 정산 완료 알림 메일 템플릿 (크리에이터)
// ────────────────────────────────────────────────────────────────────────────
export interface RevenueSettledInfo {
  year: number;
  month: number;
  totalAmount: number;
  saleAmount?: number;
  adAmount?: number;
  subscriptionAmount?: number;
  taxWithholding?: number;  // 원천징수액 (비사업자 3.3%)
  netAmount?: number;       // 세후 실지급액
}

export function buildRevenueSettledEmail(info: RevenueSettledInfo): { subject: string; html: string } {
  const totalText = (info.totalAmount || 0).toLocaleString("ko-KR");
  const saleText = (info.saleAmount || 0).toLocaleString("ko-KR");
  const adText = (info.adAmount || 0).toLocaleString("ko-KR");
  const subText = (info.subscriptionAmount || 0).toLocaleString("ko-KR");
  const hasTax = (info.taxWithholding || 0) > 0;
  const netAmount = info.netAmount ?? info.totalAmount ?? 0;
  const netText = netAmount.toLocaleString("ko-KR");
  const withholdingText = (info.taxWithholding || 0).toLocaleString("ko-KR");

  const subject = `[CREAITE] ${info.year}년 ${info.month}월 정산 완료 — ₩${netText} 지급`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #a78bfa;">🎉 정산이 완료되었습니다</h1>
  <p>축하합니다! <strong>${info.year}년 ${info.month}월</strong> 수익 정산이 완료되어 지급되었습니다.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0; border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">판매 수익</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₩${saleText}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">광고 수익</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₩${adText}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">구독 수익</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₩${subText}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">총 수익</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">₩${totalText}</td>
    </tr>
    ${hasTax ? `<tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600; color: #b45309;">원천징수 (3.3%)</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; color: #b45309;">− ₩${withholdingText}</td>
    </tr>` : ``}
    <tr style="background: #faf7ff;">
      <th style="text-align: left; padding: 14px 12px; font-weight: 700; color: #6b46c1;">지급액${hasTax ? " (세후)" : ""}</th>
      <td style="padding: 14px 12px; text-align: right; font-weight: 700; color: #a78bfa; font-size: 18px;">₩${netText}</td>
    </tr>
  </table>

  <p>지급은 마이페이지에 등록된 계좌로 처리되었습니다. 입금 확인은 1~2영업일 소요될 수 있습니다.</p>
  <p style="font-size: 13px; color: #666;">정산 내역에 대한 문의는 <a href="mailto:support@creaite.net" style="color: #a78bfa;">support@creaite.net</a>으로 부탁드립니다.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">CREAITE • 세계 최초 AI 시네마 OTT</p>
  <p style="font-size: 12px; color: #999;">알림 설정은 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지 → 설정 → 알림 설정</a>에서 변경 가능합니다.</p>
</body>
</html>`;
  return { subject, html };
}

// ────────────────────────────────────────────────────────────────────────────
// 신고 처리 결과 알림 메일 템플릿
// ────────────────────────────────────────────────────────────────────────────
export interface ReportResultInfo {
  action: "keep" | "remove";  // dismiss(악성 반려)는 발송 안 함
  targetTypeLabel: string;    // "영상" / "댓글" / "사용자" / "커뮤니티 글"
}

export function buildReportResultEmail(info: ReportResultInfo): { subject: string; html: string } {
  const safeTarget = escapeHtml(info.targetTypeLabel || "콘텐츠");
  const isRemoved = info.action === "remove";

  const subject = isRemoved
    ? `[CREAITE] 신고 검토 결과 — ${safeTarget} 제거 완료`
    : `[CREAITE] 신고 검토 결과 — ${safeTarget} 유지`;

  const headerColor = isRemoved ? "#dc2626" : "#16a34a";
  const headerEmoji = isRemoved ? "🛡️" : "✓";
  const headerText = isRemoved ? "신고하신 콘텐츠가 제거되었습니다" : "신고하신 콘텐츠는 유지됩니다";

  const bodyText = isRemoved
    ? `신고하신 ${safeTarget}이(가) 검토 결과 <strong>정책 위반으로 확인되어 제거</strong>되었습니다. 신고해 주셔서 감사합니다 — 커뮤니티를 더 안전하게 만드는 데 도움이 됩니다.`
    : `신고하신 ${safeTarget}을(를) 검토했으나 <strong>정책 위반이 아닌 것으로 판단되어 유지</strong>됩니다. 검토 기준에 대한 의문이 있으시면 언제든 문의해 주세요.`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: ${headerColor};">${headerEmoji} ${headerText}</h1>
  <p>${bodyText}</p>

  <div style="background: #f5f5f5; padding: 14px 16px; border-left: 3px solid #ddd; margin: 20px 0; border-radius: 6px;">
    <p style="margin: 0; font-size: 13px; color: #666;">
      <strong>대상 종류:</strong> ${safeTarget}<br>
      <strong>처리 결과:</strong> ${isRemoved ? "제거" : "유지"}
    </p>
  </div>

  <p style="font-size: 13px; color: #666;">처리 결과에 대한 추가 문의는 <a href="mailto:support@creaite.net" style="color: #a78bfa;">support@creaite.net</a>으로 부탁드립니다.</p>

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

// ────────────────────────────────────────────────────────────────────────────
// 환불 완료 알림 메일 템플릿
// ────────────────────────────────────────────────────────────────────────────
export interface RefundCompletedInfo {
  orderName: string;        // "CREAITE 프리미엄 구독 (월)" 등
  amount: number;           // 환불 금액 (원)
  refundReason?: string;    // 환불 사유 (어드민 입력)
  refundedAt?: string;      // 환불 일시
  paymentMethod?: string;   // 결제 방식 (카드 등)
}

export function buildRefundCompletedEmail(info: RefundCompletedInfo): { subject: string; html: string } {
  const safeOrderName = escapeHtml(info.orderName);
  const safeReason = escapeHtml(info.refundReason || "환불 요청 처리");
  const safeMethod = escapeHtml(info.paymentMethod || "결제 수단");
  const safeDate = escapeHtml(info.refundedAt || formatReceiptDate());
  const amountText = (info.amount || 0).toLocaleString("ko-KR");

  const subject = `[CREAITE] 환불이 완료되었습니다 — ${info.orderName}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #16a34a;">✓ 환불이 완료되었습니다</h1>
  <p>요청하신 환불이 처리되었습니다. 아래는 환불 내역입니다.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0; border: 1px solid #eee; border-radius: 6px; overflow: hidden;">
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; width: 35%; font-weight: 600;">결제 항목</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${safeOrderName}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">환불 금액</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #16a34a; font-size: 16px;">₩${amountText}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">환불 방식</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${safeMethod} (결제 시와 동일)</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; border-bottom: 1px solid #eee; font-weight: 600;">처리 일시</th>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${safeDate}</td>
    </tr>
    <tr>
      <th style="text-align: left; padding: 12px; background: #f9f9f9; font-weight: 600;">처리 사유</th>
      <td style="padding: 12px; color: #555;">${safeReason}</td>
    </tr>
  </table>

  <div style="background: #f0fdf4; border-left: 3px solid #16a34a; padding: 12px 16px; margin: 20px 0; border-radius: 6px;">
    <p style="margin: 0; font-size: 13px; color: #555;">
      카드 환불은 카드사 정책에 따라 영업일 기준 <strong>3~7일</strong> 이내 명세서에 반영됩니다.
      해당 결제로 부여된 권한(구독·라이선스·광고 예산)은 즉시 회수됩니다.
    </p>
  </div>

  <p style="font-size: 13px; color: #666;">환불 관련 문의는 <a href="mailto:support@creaite.net" style="color: #a78bfa;">support@creaite.net</a>으로 부탁드립니다.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999; margin: 0 0 4px 0;">CREAITE • 세계 최초 AI 시네마 OTT</p>
  <p style="font-size: 11px; color: #aaa; line-height: 1.7; margin: 0 0 4px 0;">
    상호 크레비즈 · 대표자 이현우 · 사업자등록번호 107-10-27099<br>
    통신판매업 신고 제 2020-경기파주-0327호 · 호스팅 Vercel Inc.<br>
    주소 경기도 파주시 평화로342번길 71-5, A동 (검산동)<br>
    고객문의 <a href="mailto:support@creaite.net" style="color: #a78bfa;">support@creaite.net</a>
  </p>
  <p style="font-size: 12px; color: #999; margin: 8px 0 0 0;">알림 설정은 <a href="https://www.creaite.net" style="color: #a78bfa;">마이페이지 → 설정 → 알림 설정</a>에서 변경 가능합니다.</p>
</body>
</html>`;
  return { subject, html };
}
