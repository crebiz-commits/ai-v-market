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
import { AdminPager } from "./AdminPager";

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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [total, setTotal] = useState(0);
  const hasMore = (page + 1) * pageSize < total;

  // 목록은 페이지 단위. "N건 대기" 배지는 전체 기준이어야 하므로 RPC 의 total_count 사용
  //   (목록에서 세면 '이 페이지에 N건'이 됨).
  const load = useCallback(async (targetPage = 0) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_pending_ads", {
      p_limit: pageSize, p_offset: targetPage * pageSize,
    });
    if (error) {
      toast.error("불러오기 실패: " + error.message);
      setAds([]);
      setLoading(false);
      return;
    }
    const rows = (data || []) as any[];
    setAds(rows as PendingAd[]);
    setTotal(Number(rows[0]?.total_count) || 0);
    setPage(targetPage);
    setLoading(false);
    // 심사로 목록이 줄어 빈 페이지가 되면 첫 페이지로 자가복구
    if (rows.length === 0 && targetPage > 0) void load(0);
  }, [pageSize]);

  useEffect(() => { void load(0); }, [load]);

  const review = async (id: string, approve: boolean) => {
    let note: string | null = null;
    if (!approve) {
      // prompt 취소(null)와 빈 입력("")을 구분 — `|| null` 로 접으면 빈 입력이 취소로 오인돼
      //   토스트 없이 조용히 닫히는 무반응 버그(2026-07-13 수정).
      const raw = window.prompt("반려 사유를 입력하세요 (광고주에게 전달됩니다):", "");
      if (raw === null) return; // 취소
      note = raw.trim();
      if (!note) { toast.error("반려 사유를 입력해 주세요."); return; }
    }
    setBusyId(id);
    const { error } = await supabase.rpc("admin_review_ad", { p_ad_id: id, p_approve: approve, p_note: note });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(approve ? "승인했습니다." : "반려했습니다.");
    setAds((prev) => prev.filter((a) => a.id !== id));
    void load(page);   // 대기 배지는 전체 기준 서버값 → 재조회로 갱신 + 빈 자리 채움
  };

  return (
    <div>
      {/* 제목·부제는 AdminLayout 헤더(PAGE_META)가 렌더 — 여기선 대기건수 배지만 표시 */}
      {ads.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Megaphone className="w-4 h-4 text-[#a78bfa]" />
          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-500/15 text-amber-300">{total}건 대기</span>
        </div>
      )}

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
                  // HLS(.m3u8)는 크롬/엣지 네이티브 <video> 미지원 → mp4 렌디션으로 변환 재생
                  //   (미변환 시 관리자가 소재를 못 보고 승인하는 맹검 심사, 2026-07-14 수정.
                  //    ProductDetail 프리롤과 동일한 Bunny play_720p.mp4 변환)
                  <video
                    src={a.video_url.includes("/playlist.m3u8") ? a.video_url.replace("/playlist.m3u8", "/play_720p.mp4") : a.video_url}
                    poster={a.thumbnail_url || undefined} controls preload="metadata"
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
                    {/^https?:\/\//i.test(a.link_url || "") ? (
                      <a href={a.link_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#8b5cf6] hover:underline break-all">
                        <ExternalLink className="w-3 h-3" />{a.link_url}
                      </a>
                    ) : (
                      // 심층방어: http(s) 아닌 스킴(javascript:/data: 등)은 링크로 렌더 금지(관리자 클릭 XSS 차단)
                      <span className="inline-flex items-center gap-1 text-red-400 break-all">
                        <ExternalLink className="w-3 h-3" />{a.link_url || "—"}
                        <span className="text-[10px]">(비정상 링크 · 클릭 비활성)</span>
                      </span>
                    )}
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
          <AdminPager
            page={page} pageSize={pageSize} hasMore={hasMore} loading={loading} total={total}
            onPageChange={(pg) => void load(pg)} onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
