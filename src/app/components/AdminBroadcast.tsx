// 공지/알림 발송 페이지 (Phase 10.7)
import { useState } from "react";
import { Loader2, Send, Users, Crown, Film } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { Button } from "./ui/button";
import { toast } from "sonner";

const SEGMENTS = [
  { key: "all",      label: "전체 사용자",  icon: Users,  desc: "정지된 계정 제외 모든 사용자" },
  { key: "premium",  label: "프리미엄만",   icon: Crown,  desc: "구독 중인 사용자" },
  { key: "free",     label: "무료 사용자만", icon: Users,  desc: "구독 안 한 사용자" },
  { key: "creators", label: "크리에이터만",  icon: Film,   desc: "영상 1개 이상 업로드한 사용자" },
];

// 클릭 시 이동 위치 — 선택형. key 가 그대로 link 값이 됨("" = 이동 없음, "video" = 영상ID 입력)
const LINK_OPTIONS = [
  { key: "",                 label: "이동 없음", desc: "공지 내용만 표시 (기본)" },
  { key: "/?tab=discovery",  label: "홈",        desc: "" },
  { key: "/?tab=market",     label: "시네마",     desc: "" },
  { key: "/?tab=ott",        label: "OTT",       desc: "" },
  { key: "/?tab=community",  label: "커뮤니티",   desc: "" },
  { key: "/?tab=mypage",     label: "마이페이지", desc: "" },
  { key: "video",            label: "특정 영상",  desc: "영상 ID 입력" },
];

interface BroadcastResult {
  count: number;                 // 인앱 발송 수
  segment: string;               // 세그먼트 라벨
  pushed: number | null;         // 잠금화면 푸시 발송 대수 (null=미시도)
  pushError: boolean;            // 푸시 발송 실패
  emailSent: number | null;      // 이메일 발송 수 (null=미시도)
  emailFailedCount: number;      // 이메일 부분 실패 건수
  emailError: boolean;           // 이메일 하드 실패(응답 없음/전량 실패)
}

export function AdminBroadcast() {
  const [segment, setSegment] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkChoice, setLinkChoice] = useState("");   // LINK_OPTIONS 의 key
  const [videoId, setVideoId] = useState("");          // linkChoice === "video" 일 때만 사용
  const [sending, setSending] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);   // 이메일도 함께 발송
  const [lastResult, setLastResult] = useState<BroadcastResult | null>(null);

  // 선택값 → 실제 link 문자열 (없으면 null)
  const resolvedLink =
    linkChoice === "video"
      ? (videoId.trim() ? `/?video=${encodeURIComponent(videoId.trim())}` : null)
      : (linkChoice || null);

  const send = async () => {
    if (!title.trim()) {
      toast.error("공지 제목을 입력해주세요");
      return;
    }
    const segLabel = SEGMENTS.find(s => s.key === segment)?.label || segment;
    // FE3: 이메일 동시발송이면 confirm 에 명시(의도치 않은 전체 이메일 방지)
    const emailNote = sendEmail ? "\n\n⚠️ 이메일도 전체 대상에게 함께 발송됩니다." : "";
    if (!confirm(
      `${segLabel}에게 공지를 발송합니다.\n\n제목: ${title}${emailNote}\n\n계속하시겠습니까?`
    )) return;

    setSending(true);
    try {
      // ── 1) 인앱 벨 발송 (RPC) ──
      const { data, error } = await supabase.rpc("admin_broadcast_notification", {
        p_title: title,
        p_body: body || null,
        p_link: resolvedLink,
        p_segment: segment,
      });
      if (error) {
        toast.error("발송 실패: " + error.message);
        return;
      }
      const count = (data as number) ?? 0;

      // FE2: 대상 0명이면 경고 + 폼 보존(작성내용 소실·오선택 미인지 방지)
      if (count === 0) {
        toast.warning("대상 사용자가 0명입니다 — 세그먼트를 확인하세요");
        setLastResult({ count: 0, segment: segLabel, pushed: null, pushError: false, emailSent: null, emailFailedCount: 0, emailError: false });
        return;
      }
      toast.success(`${count}명에게 인앱 발송됨`);

      // ── 2) 잠금화면 푸시 (구독 기기 대상) — 실패해도 인앱은 이미 성공 ──
      let pushed: number | null = null;
      let pushError = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/broadcast-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: publicAnonKey,
            Authorization: `Bearer ${session?.access_token || publicAnonKey}`,
          },
          body: JSON.stringify({ segment, title, body: body || null, link: resolvedLink }),
        });
        const pd = await res.json();
        if (res.ok && typeof pd?.pushed === "number") {
          pushed = pd.pushed;
          if (pd.pushed > 0) toast.success(`잠금화면 푸시 ${pd.pushed}대 발송`);
        } else {
          pushError = true;
          toast.warning("잠금화면 푸시 발송 실패 (인앱은 정상)");
        }
      } catch (e) {
        pushError = true;
        console.warn("[broadcast] 푸시 발송 실패:", e);
        toast.warning("잠금화면 푸시 발송 실패 (인앱은 정상)");
      }

      // ── 3) 이메일 (체크 시) — 수신거부자 제외 Resend 배치 ──
      let emailSent: number | null = null;
      let emailFailedCount = 0;
      let emailError = false;
      if (sendEmail) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch(`https://${projectId}.supabase.co/functions/v1/server/broadcast-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: publicAnonKey,
              Authorization: `Bearer ${session?.access_token || publicAnonKey}`,
            },
            body: JSON.stringify({ segment, title, body: body || null, link: resolvedLink }),
          });
          const ed = await res.json();
          if (res.ok && typeof ed?.sent === "number") {
            emailSent = ed.sent;
            emailFailedCount = ed.failed ?? 0;
            const total = ed.total ?? 0;
            if (ed.sent === 0 && total > 0) {
              // FE4: 전량 실패를 성공으로 오표시 금지
              emailError = true;
              toast.error("이메일 전량 발송 실패 — 재시도가 필요합니다");
            } else if (emailFailedCount > 0) {
              // FE-a2: 부분 실패도 명확히
              toast.warning(`이메일 ${ed.sent}건 발송 · ${emailFailedCount}건 실패`);
            } else {
              toast.success(`이메일 ${ed.sent}건 발송 (수신거부 제외)`);
            }
          } else {
            emailError = true;
            toast.error("이메일 발송 실패: " + (ed?.error || res.status));
          }
        } catch (e) {
          emailError = true;
          console.warn("[broadcast] 이메일 발송 실패:", e);
          toast.error("이메일 발송 중 오류");
        }
      }

      setLastResult({ count, segment: segLabel, pushed, pushError, emailSent, emailFailedCount, emailError });

      // 성공 후 폼 초기화 — FE3: 이메일 체크도 해제(다음 공지 오발송 방지)
      setTitle("");
      setBody("");
      setLinkChoice("");
      setVideoId("");
      setSendEmail(false);
    } finally {
      // FE1: 인앱·푸시·이메일 전 파이프라인 종료 후에만 잠금 해제(중복 발송 창 제거)
      setSending(false);
    }
  };

  const anyChannelError = !!lastResult && (lastResult.pushError || lastResult.emailError || lastResult.emailFailedCount > 0);

  return (
    <div className="space-y-5">
      {/* 안내 */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
        <p className="font-semibold mb-1">📢 공지 발송 안내</p>
        <ul className="text-blue-200/80 space-y-0.5">
          <li>• 인앱 알림(🔔) + 잠금화면 푸시로 발송됩니다</li>
          <li>• 푸시는 "이 기기에서 푸시 받기"를 켠 구독 기기에만 도달합니다</li>
          <li>• 정지된 계정에는 발송하지 않습니다</li>
          <li>• 이메일도 발송하려면 아래 「이메일도 발송」을 체크하세요 (수신거부자 제외)</li>
        </ul>
      </div>

      {/* 세그먼트 선택 */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-2">발송 대상</label>
        <div role="radiogroup" aria-label="발송 대상" className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {SEGMENTS.map(s => {
            const Icon = s.icon;
            const active = segment === s.key;
            return (
              <button
                key={s.key}
                role="radio"
                aria-checked={active}
                disabled={sending}
                onClick={() => setSegment(s.key)}
                className={`p-3 rounded-lg border-2 text-left transition-all flex items-start gap-3 disabled:opacity-50 disabled:cursor-not-allowed ${
                  active
                    ? "border-[#6366f1] bg-[#6366f1]/10"
                    : "border-border hover:border-[#6366f1]/40"
                }`}
              >
                <Icon className="w-5 h-5 mt-0.5 flex-shrink-0 text-[#6366f1]" />
                <div>
                  <p className="font-semibold text-sm">{s.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 제목 */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-1.5">공지 제목 *</label>
        <input
          className="input-base"
          placeholder="예: 5/20 서비스 점검 안내"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          disabled={sending}
        />
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">{title.length}/100</p>
      </div>

      {/* 본문 */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-1.5">본문 (선택)</label>
        <textarea
          className="input-base min-h-[120px]"
          placeholder="공지 상세 내용"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          disabled={sending}
        />
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">{body.length}/500</p>
      </div>

      {/* 클릭 시 이동 위치 (선택형) */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-2">클릭 시 이동 위치 (선택)</label>
        <div role="radiogroup" aria-label="클릭 시 이동 위치" className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {LINK_OPTIONS.map(opt => {
            const active = linkChoice === opt.key;
            return (
              <button
                key={opt.key || "none"}
                role="radio"
                aria-checked={active}
                disabled={sending}
                onClick={() => setLinkChoice(opt.key)}
                className={`p-2.5 rounded-lg border-2 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  active
                    ? "border-[#6366f1] bg-[#6366f1]/10"
                    : "border-border hover:border-[#6366f1]/40"
                }`}
              >
                <p className="font-semibold text-sm">{opt.label}</p>
                {opt.desc && <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>}
              </button>
            );
          })}
        </div>

        {/* "특정 영상" 선택 시 영상 ID 입력 */}
        {linkChoice === "video" && (
          <div className="mt-2">
            <input
              className="input-base"
              placeholder="영상 ID 입력 (예: abc123) — 비우면 이동 없음"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              disabled={sending}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              영상 ID는 해당 영상 페이지 주소의 <span className="font-mono text-blue-300/90">?video=</span> 뒤 값입니다.
            </p>
          </div>
        )}

        {/* 현재 적용될 링크 미리보기 */}
        <p className="mt-2 text-[11px] text-muted-foreground">
          적용 링크: <span className="font-mono text-blue-300/90">{resolvedLink || "(이동 없음)"}</span>
        </p>
      </div>

      {/* 이메일 동시 발송 */}
      <label className={`flex items-start gap-2.5 p-3 rounded-lg border-2 border-border hover:border-[#6366f1]/40 ${sending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} disabled={sending} className="mt-0.5 w-4 h-4 accent-[#6366f1]" />
        <div>
          <p className="font-semibold text-sm">📧 이메일도 발송</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">인앱·푸시에 더해 이메일도 발송합니다. 공지 이메일 수신을 끈 사용자는 자동 제외됩니다. (제목·본문 그대로 사용)</p>
        </div>
      </label>

      {/* 발송 버튼 */}
      <Button
        onClick={send}
        disabled={sending || !title.trim()}
        className="w-full h-12 gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold disabled:opacity-50"
      >
        {sending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            발송 중...
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            발송하기
          </>
        )}
      </Button>

      {/* 마지막 결과 — 채널별 종합(FE5) */}
      {lastResult && (
        <div className={`p-3 rounded-lg border text-sm ${
          lastResult.count === 0 || anyChannelError
            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
            : "bg-green-500/10 border-green-500/30 text-green-300"
        }`}>
          {lastResult.count === 0 ? (
            <>⚠️ <span className="font-bold">{lastResult.segment}</span> — 대상 0명, 발송되지 않음</>
          ) : (
            <>
              {anyChannelError ? "⚠️" : "✅"} <span className="font-bold">{lastResult.segment}</span> 발송 —{" "}
              인앱 <span className="font-bold">{lastResult.count}건</span>
              {(lastResult.pushed !== null || lastResult.pushError) && (
                <> · 푸시 {lastResult.pushError
                  ? <span className="font-bold text-red-400">실패</span>
                  : <span className="font-bold">{lastResult.pushed}대</span>}</>
              )}
              {(lastResult.emailSent !== null || lastResult.emailError) && (
                <> · 이메일 {lastResult.emailError
                  ? <span className="font-bold text-red-400">실패</span>
                  : <span className="font-bold">
                      {lastResult.emailSent}건
                      {lastResult.emailFailedCount > 0 && <span className="text-red-400"> ({lastResult.emailFailedCount} 실패)</span>}
                    </span>}</>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
