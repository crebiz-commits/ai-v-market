// 관리자 — 프리미엄 수동 지급 (챌린지 우승 보상 등)
//   이메일 + 개월수 입력 → admin_grant_premium RPC 호출.
//   RPC 가 관리자 인증 + 구독 컬럼 업데이트(protect 트리거 우회는 SECURITY DEFINER 소유자=postgres) + 감사로그.
import { useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";
import { Crown, Loader2 } from "lucide-react";

interface GrantResult {
  display_name: string | null;
  email: string;
  subscription_tier: string;
  subscription_expires_at: string;
}

export function AdminGrantPremium() {
  const [email, setEmail] = useState("");
  const [months, setMonths] = useState(6);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GrantResult | null>(null);

  // 이달의 크리에이터 임명 (뱃지 + 홈 히어로)
  const [crownEmail, setCrownEmail] = useState("");
  const [crownVideo, setCrownVideo] = useState("");
  const [crownBusy, setCrownBusy] = useState(false);
  const [crownDone, setCrownDone] = useState<{ video_title?: string | null } | null>(null);

  const extractVideoId = (s: string): string => {
    const t = s.trim();
    if (!t) return "";
    try { const q = new URL(t).searchParams.get("video"); if (q) return q; } catch { /* URL 아님 */ }
    const m = t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : "";   // 인식 실패 시 빈 문자열(원문 반환 금지 — 서버 uuid 캐스트 에러 방지)
  };

  const crown = async () => {
    const e = crownEmail.trim();
    if (!e) { toast.error("우승자 이메일을 입력하세요"); return; }
    const vid = extractVideoId(crownVideo);
    // 우승작을 입력했는데 인식 못하면 raw 문자열 대신 친절히 안내(히어로는 선택사항)
    if (crownVideo.trim() && !vid) {
      toast.error("영상 URL(...?video=ID) 또는 UUID를 인식하지 못했어요. 비워두면 히어로 없이 임명합니다.");
      return;
    }
    setCrownBusy(true); setCrownDone(null);
    try {
      const { data, error } = await supabase.rpc("admin_crown_creator", {
        p_email: e, p_video_id: vid || null, p_badge_months: 1, p_hero_days: 30,
      });
      if (error) throw error;
      setCrownDone((data as any) || {});
      toast.success("이달의 크리에이터 임명 완료 👑" + (vid ? " · 홈 히어로 고정" : ""));
    } catch (err: any) {
      toast.error(err?.message || "임명 실패");
    } finally { setCrownBusy(false); }
  };

  const grant = async () => {
    const e = email.trim();
    if (!e) { toast.error("이메일을 입력하세요"); return; }
    if (!months || months < 1 || months > 60) { toast.error("개월수는 1~60 사이여야 합니다"); return; }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc("admin_grant_premium", { p_email: e, p_months: months });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as GrantResult | undefined;
      if (!row) {
        toast.error("해당 이메일의 사용자를 찾을 수 없습니다");
        return;
      }
      setResult(row);
      toast.success(
        `${row.display_name || e} 프리미엄 지급 완료 (만료 ${new Date(row.subscription_expires_at).toLocaleDateString("ko-KR")})`,
      );
    } catch (err: any) {
      toast.error(err?.message || "지급 실패");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "h-10 rounded-lg bg-card border border-border px-3 text-sm outline-none focus:border-[#6366f1]";

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-[#a78bfa] font-bold">
          <Crown className="w-5 h-5" /> 프리미엄 수동 지급
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">사용자 이메일</label>
          <input
            className={inputCls}
            type="email"
            placeholder="winner@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") grant(); }}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">지급 개월수</label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className={`${inputCls} w-24`}
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            />
            <div className="flex gap-1.5">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`px-3 h-10 rounded-lg text-sm font-semibold border transition-colors ${
                    months === m
                      ? "bg-[#6366f1]/15 border-[#6366f1] text-[#a5b4fc]"
                      : "bg-card border-border text-muted-foreground hover:border-white/30"
                  }`}
                >
                  {m}개월
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            현재 만료일이 미래면 거기서 +{months}개월, 만료/미구독이면 오늘부터 +{months}개월.
          </p>
        </div>

        <button
          onClick={grant}
          disabled={busy}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
          프리미엄 지급
        </button>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <p className="font-bold text-emerald-300 mb-1">✓ 지급 완료</p>
          <p className="text-muted-foreground">
            {result.display_name || result.email} · <b className="text-white">{result.subscription_tier}</b>
          </p>
          <p className="text-muted-foreground">
            만료일: <b className="text-white">{new Date(result.subscription_expires_at).toLocaleString("ko-KR")}</b>
          </p>
        </div>
      )}

      {/* ── 이달의 크리에이터 임명 (뱃지 + 홈 히어로) ── */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-300 font-bold">👑 이달의 크리에이터 임명</div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          채널에 <b>“👑 이달의 크리에이터” 뱃지 1개월</b> + (우승작 지정 시) <b>OTT 홈 히어로 1개월 고정</b>.
        </p>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">우승자 이메일</label>
          <input className={inputCls} type="email" placeholder="winner@gmail.com" value={crownEmail}
            onChange={(e) => setCrownEmail(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-muted-foreground mb-1">
            우승작 영상 ID 또는 URL <span className="text-white/30">(선택 — 홈 히어로 고정용)</span>
          </label>
          <input className={inputCls} placeholder="영상 상세 URL 붙여넣기 또는 영상 ID" value={crownVideo}
            onChange={(e) => setCrownVideo(e.target.value)} />
        </div>
        <button onClick={crown} disabled={crownBusy}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity">
          {crownBusy ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <span>👑</span>} 이달의 크리에이터 임명
        </button>
        {crownDone && (
          <p className="text-xs text-emerald-300">✓ 임명 완료{crownDone.video_title ? ` · 히어로 고정: ${crownDone.video_title}` : ""}</p>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground leading-relaxed">
        <p>· 챌린지 우승 보상 등 <b>수동 지급</b>용 (토스 결제와 무관).</p>
        <p>· 지급 즉시 해당 계정에 영상 광고 제거·프리미엄 기능 적용.</p>
        <p>· 모든 지급은 활동 로그(감사)에 기록됩니다.</p>
      </div>
    </div>
  );
}
