// 공지/알림 발송 페이지 (Phase 10.7)
import { useState } from "react";
import { Loader2, Megaphone, Send, Users, Crown, Film } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

const SEGMENTS = [
  { key: "all",      label: "전체 사용자",  icon: Users,  desc: "정지된 계정 제외 모든 사용자" },
  { key: "premium",  label: "프리미엄만",   icon: Crown,  desc: "구독 중인 사용자" },
  { key: "free",     label: "무료 사용자만", icon: Users,  desc: "구독 안 한 사용자" },
  { key: "creators", label: "크리에이터만",  icon: Film,   desc: "영상 1개 이상 업로드한 사용자" },
];

export function AdminBroadcast() {
  const [segment, setSegment] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ count: number; segment: string } | null>(null);

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
      p_link: link || null,
      p_segment: segment,
    });
    setSending(false);

    if (error) {
      toast.error("발송 실패: " + error.message);
      return;
    }
    const count = data as number;
    toast.success(`${count}명에게 발송됨`);
    setLastResult({ count, segment: segLabel });
    setTitle("");
    setBody("");
    setLink("");
  };

  return (
    <div className="space-y-5">
      {/* 안내 */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
        <p className="font-semibold mb-1">📢 공지 발송 안내</p>
        <ul className="text-blue-200/80 space-y-0.5">
          <li>• 인앱 알림으로 발송됩니다 (notifications 테이블 INSERT)</li>
          <li>• 사용자는 종 아이콘(🔔)에서 확인합니다</li>
          <li>• 정지된 계정에는 발송하지 않습니다</li>
          <li>• 이메일/푸시는 향후 별도 작업 (Resend/FCM 연동)</li>
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

      {/* 링크 */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground mb-1.5">클릭 시 이동 링크 (선택)</label>
        <input
          className="input-base"
          placeholder="/?video=video_id 또는 /about 등"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
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
