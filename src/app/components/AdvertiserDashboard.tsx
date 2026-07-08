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
  image_url: string | null; video_url: string | null; thumbnail_url: string | null; link_url: string; cta_text: string;
  budget_krw: number; spent_krw: number; impressions: number; clicks: number;
  review_note: string | null; created_at: string; submitted_at: string | null;
}

interface Props {
  onBack: () => void;
  onSignInClick?: () => void;
}

export function AdvertiserDashboard({ onBack, onSignInClick }: Props) {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [ads, setAds] = useState<MyAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAd, setEditAd] = useState<AdvertiserAd | null>(null);
  const [topupAd, setTopupAd] = useState<{ id: string; title: string } | null>(null);
  const [statsAd, setStatsAd] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("advertiser_my_ads");
    if (error) toast.error(t("ads.dashboard.loadFailed", { message: error.message }));
    setAds((data as MyAd[]) || []);
    setLoading(false);
  }, [t]);

  useEffect(() => { if (isAuthenticated) load(); else setLoading(false); }, [isAuthenticated, load]);

  const submit = async (id: string) => {
    const { error } = await supabase.rpc("advertiser_submit_ad", { p_ad_id: id });
    if (error) return toast.error(error.message);
    toast.success(t("ads.dashboard.submitted"));
    load();
  };
  const setActive = async (id: string, on: boolean) => {
    const { error } = await supabase.rpc("advertiser_set_active", { p_ad_id: id, p_on: on });
    if (error) return toast.error(error.message);
    load();
  };
  const openEdit = (a: MyAd) => {
    setEditAd({ id: a.id, title: a.title, status: a.status, image_url: a.image_url, video_url: a.video_url, link_url: a.link_url, cta_text: a.cta_text, format: a.format });
    setModalOpen(true);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      draft:          { label: t("ads.dashboard.status.draft"), cls: "bg-white/10 text-gray-300" },
      pending_review: { label: t("ads.dashboard.status.pendingReview"), cls: "bg-amber-500/15 text-amber-300" },
      approved:       { label: t("ads.dashboard.status.approved"), cls: "bg-emerald-500/15 text-emerald-300" },
      rejected:       { label: t("ads.dashboard.status.rejected"), cls: "bg-red-500/15 text-red-300" },
      paused:         { label: t("ads.dashboard.status.paused"), cls: "bg-white/10 text-gray-400" },
    };
    const m = map[s] || map.draft;
    return <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
  };

  const ctr = (a: MyAd) => a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(1) + "%" : "—";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-4 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#a78bfa]" />
            <h1 className="text-lg font-black">{t("ads.dashboard.title")}</h1>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">{t("ads.dashboard.signInRequired")}</p>
            <Button onClick={onSignInClick} className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold">{t("ads.dashboard.signIn")}</Button>
          </div>
        ) : (
          <>
            <Button onClick={() => { setEditAd(null); setModalOpen(true); }}
              className="w-full mb-5 gap-2 h-12 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-black">
              <Plus className="w-5 h-5" />{t("ads.dashboard.newAd")}
            </Button>

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" /></div>
            ) : ads.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p>{t("ads.dashboard.empty")}</p>
                <p className="text-xs mt-1">{t("ads.dashboard.emptyHint")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ads.map((a) => {
                  const pct = a.budget_krw > 0 ? Math.min(100, Math.round((a.spent_krw / a.budget_krw) * 100)) : 0;
                  return (
                    <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-white/5 rounded-xl p-4">
                      <div className="flex gap-3">
                        {(a.image_url || a.thumbnail_url) && (
                          <img src={a.image_url || a.thumbnail_url || ""} alt="" className="w-20 h-16 rounded-lg object-cover bg-black/30 flex-shrink-0"
                            onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm truncate">{a.title}</p>
                            {statusBadge(a.status)}
                          </div>
                          <button onClick={() => setStatsAd({ id: a.id, title: a.title })}
                            className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 hover:text-[#a78bfa] transition-colors">
                            <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />{t("ads.dashboard.impressions")} {a.impressions.toLocaleString()}</span>
                            <span>{t("ads.dashboard.clicks")} {a.clicks.toLocaleString()}</span>
                            <span>CTR {ctr(a)}</span>
                            <span className="underline decoration-dotted">{t("ads.dashboard.trend")}</span>
                          </button>
                        </div>
                      </div>

                      {a.status === "rejected" && a.review_note && (
                        <p className="mt-2 text-[11px] text-red-300 bg-red-500/10 rounded-md px-2 py-1.5">{t("ads.dashboard.rejectReason", { note: a.review_note })}</p>
                      )}

                      {a.status === "approved" && (
                        <div className="mt-3">
                          <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                            <span>{t("ads.dashboard.budgetUsed")}</span>
                            <span>₩{a.spent_krw.toLocaleString()} / ₩{a.budget_krw.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" style={{ width: `${pct}%` }} />
                          </div>
                          {a.budget_krw === 0 && (
                            <p className="mt-1.5 text-[11px] text-amber-300">{t("ads.dashboard.topupPrompt")}</p>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 mt-3">
                        {(a.status === "draft" || a.status === "rejected") && (
                          <>
                            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9"
                              onClick={() => openEdit(a)}>
                              <Pencil className="w-3.5 h-3.5" />{t("ads.dashboard.edit")}
                            </Button>
                            <Button size="sm" className="flex-1 gap-1 h-9 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold"
                              onClick={() => submit(a.id)}>
                              <Send className="w-3.5 h-3.5" />{t("ads.dashboard.submit")}
                            </Button>
                          </>
                        )}
                        {a.status === "approved" && (
                          <>
                            <Button size="sm" className="flex-1 gap-1 h-9 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold"
                              onClick={() => setTopupAd({ id: a.id, title: a.title })}>
                              <Wallet className="w-3.5 h-3.5" />{t("ads.dashboard.topup")}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9"
                              onClick={() => openEdit(a)}>
                              <Pencil className="w-3.5 h-3.5" />{t("ads.dashboard.edit")}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 gap-1 h-9"
                              onClick={() => setActive(a.id, !a.is_active)}>
                              {a.is_active ? <><Pause className="w-3.5 h-3.5" />{t("ads.dashboard.pause")}</> : <><Play className="w-3.5 h-3.5" />{t("ads.dashboard.resume")}</>}
                            </Button>
                          </>
                        )}
                        {a.status === "pending_review" && (
                          <div className="flex-1 flex items-center justify-between gap-2">
                            <p className="text-[11px] text-amber-300">{t("ads.dashboard.underReview")}</p>
                            <Button size="sm" variant="outline" className="gap-1 h-9 shrink-0"
                              onClick={() => openEdit(a)}>
                              <Pencil className="w-3.5 h-3.5" />{t("ads.dashboard.edit")}
                            </Button>
                          </div>
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

      {/* key로 대상 변경 시 리마운트 강제 — 모달 폼이 useState 초기값으로만 세팅되므로
          key 없이는 "수정"을 눌러도 기존 광고 값이 폼에 로드되지 않음(빈 폼·유형 오염) */}
      <AdCreateModal key={editAd ? `edit-${editAd.id}` : "new"} open={modalOpen} editAd={editAd} onClose={() => setModalOpen(false)} onSaved={load} />
      {topupAd && <AdTopupModal open={!!topupAd} adId={topupAd.id} adTitle={topupAd.title} onClose={() => setTopupAd(null)} />}
      {statsAd && <AdStatsModal open={!!statsAd} adId={statsAd.id} adTitle={statsAd.title} onClose={() => setStatsAd(null)} />}
    </div>
  );
}
