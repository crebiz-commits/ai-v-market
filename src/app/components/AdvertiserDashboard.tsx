// ════════════════════════════════════════════════════════════════════════════
// 광고주 센터 — 셀프서비스 Phase 2
//   내 광고 목록(상태·노출/클릭·예산) + 새 광고 만들기 + 수정/제출/일시중지.
//   데이터: advertiser_my_ads() RPC. 생성/수정: AdCreateModal.
//   예산 충전은 Phase 3(ad_budget Toss) — 현재는 승인 후 "준비 중" 안내.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Plus, Loader2, Megaphone, Pencil, Send, Pause, Play, BarChart3, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AdCreateModal, AdvertiserAd } from "./AdCreateModal";
import { AdTopupModal } from "./AdTopupModal";
import { AdStatsModal } from "./AdStatsModal";

interface MyAd {
  id: string; title: string; format: string; ad_type: string; status: string; is_active: boolean;
  image_url: string | null; thumbnail_url: string | null; link_url: string; cta_text: string;
  budget_krw: number; spent_krw: number; impressions: number; clicks: number;
  review_note: string | null; created_at: string; submitted_at: string | null;
}

interface Props {
  onBack: () => void;
  onSignInClick?: () => void;
}

export function AdvertiserDashboard({ onBack, onSignInClick }: Props) {
  const { isAuthenticated } = useAuth();
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [ads, setAds] = useState<MyAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAd, setEditAd] = useState<AdvertiserAd | null>(null);
  const [topupAd, setTopupAd] = useState<{ id: string; title: string } | null>(null);
  const [statsAd, setStatsAd] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("advertiser_my_ads");
    if (error) toast.error((isKo ? "불러오기 실패: " : "Load failed: ") + error.message);
    setAds((data as MyAd[]) || []);
    setLoading(false);
  }, [isKo]);

  useEffect(() => { if (isAuthenticated) load(); else setLoading(false); }, [isAuthenticated, load]);

  const submit = async (id: string) => {
    const { error } = await supabase.rpc("advertiser_submit_ad", { p_ad_id: id });
    if (error) return toast.error(error.message);
    toast.success(isKo ? "심사 제출했어요." : "Submitted.");
    load();
  };
  const setActive = async (id: string, on: boolean) => {
    const { error } = await supabase.rpc("advertiser_set_active", { p_ad_id: id, p_on: on });
    if (error) return toast.error(error.message);
    load();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      draft:          { label: isKo ? "초안" : "Draft", cls: "bg-white/10 text-gray-300" },
      pending_review: { label: isKo ? "심사 중" : "In review", cls: "bg-amber-500/15 text-amber-300" },
      approved:       { label: isKo ? "승인됨" : "Approved", cls: "bg-emerald-500/15 text-emerald-300" },
      rejected:       { label: isKo ? "반려됨" : "Rejected", cls: "bg-red-500/15 text-red-300" },
      paused:         { label: isKo ? "중지됨" : "Paused", cls: "bg-white/10 text-gray-400" },
    };
    const m = map[s] || map.draft;
    return <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
  };

  const ctr = (a: MyAd) => a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(1) + "%" : "—";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/5"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#a78bfa]" />
            <h1 className="text-lg font-black">{isKo ? "광고주 센터" : "Advertiser Center"}</h1>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">{isKo ? "로그인이 필요합니다." : "Please sign in."}</p>
            <Button onClick={onSignInClick} className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">{isKo ? "로그인" : "Sign in"}</Button>
          </div>
        ) : (
          <>
            <Button onClick={() => { setEditAd(null); setModalOpen(true); }}
              className="w-full mb-5 gap-2 h-12 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-black">
              <Plus className="w-5 h-5" />{isKo ? "새 광고 만들기" : "New ad"}
            </Button>

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" /></div>
            ) : ads.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p>{isKo ? "아직 등록한 광고가 없습니다." : "No ads yet."}</p>
                <p className="text-xs mt-1">{isKo ? "위 버튼으로 첫 광고를 만들어 보세요." : "Create your first ad above."}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ads.map((a) => {
                  const pct = a.budget_krw > 0 ? Math.min(100, Math.round((a.spent_krw / a.budget_krw) * 100)) : 0;
                  return (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-white/5 rounded-xl p-4">
                      <div className="flex gap-3">
                        {a.image_url && (
                          <img src={a.image_url} alt="" className="w-20 h-16 rounded-lg object-cover bg-black/30 flex-shrink-0"
                            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm truncate">{a.title}</p>
                            {statusBadge(a.status)}
                          </div>
                          <button onClick={() => setStatsAd({ id: a.id, title: a.title })}
                            className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 hover:text-[#a78bfa] transition-colors">
                            <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />{isKo ? "노출" : "Imp"} {a.impressions.toLocaleString()}</span>
                            <span>{isKo ? "클릭" : "Clicks"} {a.clicks.toLocaleString()}</span>
                            <span>CTR {ctr(a)}</span>
                            <span className="underline decoration-dotted">{isKo ? "추이" : "trend"}</span>
                          </button>
                        </div>
                      </div>

                      {a.status === "rejected" && a.review_note && (
                        <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 rounded-md px-2 py-1.5">{isKo ? "반려 사유: " : "Reason: "}{a.review_note}</p>
                      )}

                      {a.status === "approved" && (
                        <div className="mt-3">
                          <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                            <span>{isKo ? "예산 소진" : "Budget used"}</span>
                            <span>₩{a.spent_krw.toLocaleString()} / ₩{a.budget_krw.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" style={{ width: `${pct}%` }} />
                          </div>
                          {a.budget_krw === 0 && (
                            <p className="mt-1.5 text-[11px] text-amber-300">{isKo ? "⚡ 예산을 충전하면 노출이 시작됩니다." : "Top up budget to start serving."}</p>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 mt-3">
                        {(a.status === "draft" || a.status === "rejected") && (
                          <>
                            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9"
                              onClick={() => { setEditAd({ id: a.id, title: a.title, status: a.status, image_url: a.image_url, link_url: a.link_url, cta_text: a.cta_text }); setModalOpen(true); }}>
                              <Pencil className="w-3.5 h-3.5" />{isKo ? "수정" : "Edit"}
                            </Button>
                            <Button size="sm" className="flex-1 gap-1 h-9 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold"
                              onClick={() => submit(a.id)}>
                              <Send className="w-3.5 h-3.5" />{isKo ? "심사 제출" : "Submit"}
                            </Button>
                          </>
                        )}
                        {a.status === "approved" && (
                          <>
                            <Button size="sm" className="flex-1 gap-1 h-9 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold"
                              onClick={() => setTopupAd({ id: a.id, title: a.title })}>
                              <Wallet className="w-3.5 h-3.5" />{isKo ? "충전" : "Top up"}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9"
                              onClick={() => setActive(a.id, !a.is_active)}>
                              {a.is_active ? <><Pause className="w-3.5 h-3.5" />{isKo ? "일시중지" : "Pause"}</> : <><Play className="w-3.5 h-3.5" />{isKo ? "재개" : "Resume"}</>}
                            </Button>
                          </>
                        )}
                        {a.status === "pending_review" && (
                          <p className="text-[11px] text-amber-300 py-2">{isKo ? "운영팀 심사 중입니다 (보통 1영업일)." : "Under review (~1 business day)."}</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AdCreateModal open={modalOpen} editAd={editAd} onClose={() => setModalOpen(false)} onSaved={load} />
      {topupAd && <AdTopupModal open={!!topupAd} adId={topupAd.id} adTitle={topupAd.title} onClose={() => setTopupAd(null)} />}
      {statsAd && <AdStatsModal open={!!statsAd} adId={statsAd.id} adTitle={statsAd.title} onClose={() => setStatsAd(null)} />}
    </div>
  );
}
