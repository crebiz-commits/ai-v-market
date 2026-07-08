// ════════════════════════════════════════════════════════════════════════════
// 광고 일자별 성과 모달 — 광고주 셀프서비스 Phase 5
//   advertiser_ad_daily_stats(ad_id) RPC → 최근 14일 노출/클릭 막대.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, BarChart3 } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";

interface DayStat { day: string; impressions: number; clicks: number; }
interface Props { open: boolean; adId: string; adTitle: string; onClose: () => void; }

export function AdStatsModal({ open, adId, adTitle, onClose }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("advertiser_ad_daily_stats", { p_ad_id: adId, p_days: 14 });
      if (cancelled) return;
      if (error) { setRows([]); } else { setRows((data as DayStat[]) || []); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, adId]);

  const maxImp = Math.max(1, ...rows.map((r) => r.impressions));
  const totImp = rows.reduce((s, r) => s + r.impressions, 0);
  const totClk = rows.reduce((s, r) => s + r.clicks, 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]" />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[151] mx-auto max-w-md max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <div className="flex items-center gap-2 min-w-0">
                <BarChart3 className="w-5 h-5 text-[#a78bfa] flex-shrink-0" />
                <h3 className="font-bold text-base truncate">{t("ads.stats.title")} · {adTitle}</h3>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted flex-shrink-0"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#8b5cf6]" /></div>
              ) : rows.length === 0 ? (
                <p className="text-center py-16 text-gray-500 text-sm">{t("ads.stats.empty")}</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-4 text-sm">
                    <div><span className="text-gray-400">{t("ads.stats.totalImpressions")} </span><span className="font-black text-white">{totImp.toLocaleString()}</span></div>
                    <div><span className="text-gray-400">{t("ads.stats.totalClicks")} </span><span className="font-black text-white">{totClk.toLocaleString()}</span></div>
                    <div><span className="text-gray-400">CTR </span><span className="font-black text-white">{totImp > 0 ? ((totClk / totImp) * 100).toFixed(1) + "%" : "—"}</span></div>
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((r) => (
                      <div key={r.day} className="flex items-center gap-2 text-[11px]">
                        <span className="w-14 text-gray-400 flex-shrink-0">{r.day.slice(5)}</span>
                        <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]" style={{ width: `${(r.impressions / maxImp) * 100}%` }} />
                        </div>
                        <span className="w-20 text-right text-gray-300 flex-shrink-0">{r.impressions.toLocaleString()}·{r.clicks}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-gray-500">{t("ads.stats.legend")}</p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
