// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 광고 심사 큐 (광고주 셀프서비스 Phase 4)
//   pending_review 광고 목록 → 소재 미리보기 → 승인/반려(사유).
//   admin_list_pending_ads() / admin_review_ad(id, approve, note) RPC.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import { Loader2, Check, X, ExternalLink, Megaphone } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface PendingAd {
  id: string; owner_id: string | null; owner_name: string | null; title: string;
  advertiser: string; format: string; ad_type: string; image_url: string | null;
  video_url: string | null; thumbnail_url: string | null; link_url: string;
  cta_text: string; submitted_at: string | null; created_at: string;
}

export function AdminAdReview() {
  const [ads, setAds] = useState<PendingAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_pending_ads");
    if (error) toast.error("불러오기 실패: " + error.message);
    setAds((data as PendingAd[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, approve: boolean) => {
    let note: string | null = null;
    if (!approve) {
      note = window.prompt("반려 사유를 입력하세요 (광고주에게 전달됩니다):", "")?.trim() || null;
      if (note === null) return; // 취소
      if (!note) { toast.error("반려 사유를 입력해 주세요."); return; }
    }
    setBusyId(id);
    const { error } = await supabase.rpc("admin_review_ad", { p_ad_id: id, p_approve: approve, p_note: note });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(approve ? "승인했습니다." : "반려했습니다.");
    setAds((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone className="w-5 h-5 text-[#a78bfa]" />
        <h2 className="text-xl font-black text-white">광고 심사</h2>
        {ads.length > 0 && <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-500/15 text-amber-300">{ads.length}건 대기</span>}
      </div>
      <p className="text-sm text-muted-foreground mb-5">광고주가 제출한 광고를 검토하고 승인·반려합니다.</p>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" /></div>
      ) : ads.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Check className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>심사 대기 중인 광고가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ads.map((a) => (
            <div key={a.id} className="bg-card border border-white/5 rounded-xl p-4">
              <div className="flex gap-4">
                {/* 소재 미리보기 — 이미지 광고는 img, 영상 광고(preroll/bumper)는 재생 가능한 video,
                    둘 다 없으면 썸네일, 그것도 없으면 '소재 없음'(맹검 승인 방지). */}
                {a.image_url ? (
                  <img src={a.image_url} alt="" className="w-32 h-24 rounded-lg object-cover bg-black/30 flex-shrink-0 border border-white/10"
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                ) : a.video_url ? (
                  <video src={a.video_url} poster={a.thumbnail_url || undefined} controls preload="metadata"
                    className="w-40 h-24 rounded-lg object-cover bg-black flex-shrink-0 border border-white/10" />
                ) : a.thumbnail_url ? (
                  <img src={a.thumbnail_url} alt="" className="w-32 h-24 rounded-lg object-cover bg-black/30 flex-shrink-0 border border-white/10"
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                ) : (
                  <div className="w-32 h-24 rounded-lg bg-black/30 flex-shrink-0 border border-white/10 flex items-center justify-center text-[10px] text-gray-500">소재 없음</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{a.title}</p>
                  <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                    <p>광고주: {a.advertiser || "—"} {a.owner_name && <span className="text-gray-500">· 계정 {a.owner_name}</span>}</p>
                    <p>포맷: {a.format || a.ad_type} · CTA: {a.cta_text}</p>
                    <a href={a.link_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#8b5cf6] hover:underline break-all">
                      <ExternalLink className="w-3 h-3" />{a.link_url}
                    </a>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" disabled={busyId === a.id} onClick={() => review(a.id, true)}
                  className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                  {busyId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />승인</>}
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => review(a.id, false)}
                  className="flex-1 gap-1.5 border-red-500/30 text-red-300 hover:bg-red-500/10">
                  <X className="w-4 h-4" />반려
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
