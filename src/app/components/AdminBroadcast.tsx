// 공지/알림 발송 페이지 (Phase 10.7)
import { useState } from "react";
import { Loader2, Megaphone, Send, Users, Crown, Film } from "lucide-react";
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

export function AdminBroadcast() {
  const [segment, setSegment] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkChoice, setLinkChoice] = useState("");   // LINK_OPTIONS 의 key
  const [videoId, setVideoId] = useState("");          // linkChoice === "video" 일 때만 사용
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ count: number; segment: string } | null>(null);

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
    if (!confirm(
      `${segLabel}에게 공지를 발송합니다.\n\n제목: ${title}\n\n계속하시겠습니까?`
    )) return;

    setSending(true);
    const { data, error } = await supabase.rpc("admin_broadcast_notification", {
      p_title: title,
      p_body: body || null,
      p_link: resolvedLink,
      p_segment: segment,
    });
    setSending(false);

    if (error) {
      toast.error("발송 실패: " + error.message);
      return;
    }
    const count = data as number;
    toast.success(`${count}명에게 인앱 발송됨`);
    setLastResult({ count, segment: segLabel });

    // 잠금화면 푸시도 발송 (구독 기기 대상) — 실패해도 인앱 발송은 이미 성공
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
      if (res.ok && typeof pd?.pushed === "number" && pd.pushed > 0) {
        toast.success(`잠금화면 푸시 ${pd.pushed}대 발송`);
      }
    } catch (e) {
      console.warn("[broadcast] 푸시 발송 실패:", e);
    }

    setTitle("");
    setBody("");
    setLinkChoice("");
    setVideoId("");
  };

  return (
    <div className="space-y-5">
      {/* 안내 */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
        <p className="font-semibold mb-1">📢 공지 발송 안내</p>
        <ul className="text-blue-200/80 space-y-0.5">
          <li>• 인앱 알림(🔔) + 잠금화면 푸시로 발송됩니다</li>
          <li>• 푸시는 "이 기기에서 푸시 받기"를 켠 구독 기기에만 도달합니다</li>
          <li>• 정지된 계정에는 발송하지 않습니다</li>
          <li>• 이메일 발송은 향후 별도 작업 (Resend 연동)</li>
        </ul>
      </div>

      {/* 세그먼트 선택 */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-2">발송 대상</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {SEGMENTS.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setSegment(s.key)}
                className={`p-3 rounded-lg border-2 text-left transition-all flex items-start gap-3 ${
                  segment === s.key
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
        />
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">{body.length}/500</p>
      </div>

      {/* 클릭 시 이동 위치 (선택형) */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-2">클릭 시 이동 위치 (선택)</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {LINK_OPTIONS.map(opt => (
            <button
              key={opt.key || "none"}
              onClick={() => setLinkChoice(opt.key)}
              className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                linkChoice === opt.key
                  ? "border-[#6366f1] bg-[#6366f1]/10"
                  : "border-border hover:border-[#6366f1]/40"
              }`}
            >
              <p className="font-semibold text-sm">{opt.label}</p>
              {opt.desc && <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>}
            </button>
          ))}
        </div>

        {/* "특정 영상" 선택 시 영상 ID 입력 */}
        {linkChoice === "video" && (
          <div className="mt-2">
            <input
              className="input-base"
              placeholder="영상 ID 입력 (예: abc123) — 비우면 이동 없음"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
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

      {/* 마지막 결과 */}
      {lastResult && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm">
          ✅ <span className="font-bold">{lastResult.segment}</span>에게 <span className="font-bold">{lastResult.count}건</span> 공지 발송 완료
        </div>
      )}
    </div>
  );
}
