import { useEffect, useState } from "react";
import { Loader2, Pencil, History, X, Save, AlertCircle } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface Setting {
  key: string;
  value: number;
  effective_from: string;
  note: string | null;
}

interface HistoryRow {
  id: number;
  key: string;
  value: number;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
  updater_name: string | null;
}

// key별 표시명 + 단위
const KEY_META: Record<string, { label: string; unit: "ratio" | "krw" | "hours"; group: string; hint?: string }> = {
  creator_share_sale:               { label: "판매 라이선스 크리에이터 분배", unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  creator_share_ad_home:            { label: "광고 — 홈 (0~3분)",       unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  creator_share_ad_cinema:          { label: "광고 — 시네마 (3분+)",     unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  creator_share_ad_ott:             { label: "광고 — OTT (10분+)",      unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  creator_share_subscription_pool:  { label: "구독료 풀 분배",            unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  subscription_price_krw:           { label: "월 구독료",                 unit: "krw",   group: "💵 가격 / 단가" },
  ad_cpm_krw:                       { label: "광고 CPM (1,000회 노출당)", unit: "krw",   group: "💵 가격 / 단가" },
  payout_minimum_krw:               { label: "정산 최소액 (미만 이월)",     unit: "krw",   group: "💵 가격 / 단가" },
  valid_view_min_ratio:             { label: "유효 시청 최소 비율",        unit: "ratio", group: "🛡 어뷰징 방지" },
  ip_dedup_hours:                   { label: "IP 중복 차단 시간",          unit: "hours", group: "🛡 어뷰징 방지" },
  new_video_grace_hours:            { label: "신규 영상 광고 제외 기간",    unit: "hours", group: "🛡 어뷰징 방지" },
};

function formatValue(key: string, value: number) {
  const meta = KEY_META[key];
  if (!meta) return value.toString();
  if (meta.unit === "ratio") return (value * 100).toFixed(1) + "%";
  if (meta.unit === "krw") return "₩" + Math.round(value).toLocaleString();
  if (meta.unit === "hours") return value + "시간";
  return value.toString();
}

export function AdminRevenuePolicy() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<string>("");
  const [newNote, setNewNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_active_platform_settings");
    if (error) {
      toast.error("설정 조회 실패: " + error.message);
    } else {
      setSettings(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadSettings(); }, []);

  const openEdit = (key: string, current: number) => {
    const meta = KEY_META[key];
    setEditingKey(key);
    setNewValue(meta?.unit === "ratio" ? (current * 100).toString() : current.toString());
    setNewNote("");
  };

  const submitEdit = async () => {
    if (!editingKey) return;
    const meta = KEY_META[editingKey];
    const parsed = parseFloat(newValue);
    if (isNaN(parsed)) {
      toast.error("숫자만 입력하세요");
      return;
    }
    const finalValue = meta?.unit === "ratio" ? parsed / 100 : parsed;
    if (meta?.unit === "ratio" && (finalValue < 0 || finalValue > 1)) {
      toast.error("비율은 0~100% 사이여야 합니다");
      return;
    }
    if (finalValue < 0) {
      toast.error("음수는 입력할 수 없습니다");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("update_platform_setting", {
      p_key: editingKey,
      p_value: finalValue,
      p_note: newNote || null,
    });
    setSaving(false);

    if (error) {
      toast.error("저장 실패: " + error.message);
      return;
    }
    toast.success(`${KEY_META[editingKey]?.label} 변경됨`);
    setEditingKey(null);
    setNewValue("");
    setNewNote("");
    loadSettings();
  };

  const openHistory = async (key: string) => {
    setHistoryKey(key);
    setHistoryLoading(true);
    const { data, error } = await supabase.rpc("get_platform_setting_history", { p_key: key });
    if (error) {
      toast.error("이력 조회 실패: " + error.message);
      setHistory([]);
    } else {
      setHistory(data || []);
    }
    setHistoryLoading(false);
  };

  // 그룹화
  const grouped: Record<string, Setting[]> = {};
  for (const s of settings) {
    const meta = KEY_META[s.key];
    const group = meta?.group || "기타";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(s);
  }
  // 정의된 key 순서로 정렬
  const keyOrder = Object.keys(KEY_META);
  for (const g of Object.keys(grouped)) {
    grouped[g].sort((a, b) => keyOrder.indexOf(a.key) - keyOrder.indexOf(b.key));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">변경 시 주의</p>
          <p className="text-amber-200/80">
            새 값은 변경 시점부터 적용. 이미 정산된 월(`revenue_distributions`)에는
            <span className="font-semibold"> 영향 없음</span> (스냅샷 저장됨).
            과거 비율은 "이력 보기"로 추적 가능.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            <h3 className="text-sm font-bold text-muted-foreground mb-2 px-1">{group}</h3>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {items.map((s, i) => (
                <div
                  key={s.key}
                  className={`flex items-center gap-3 p-4 ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{KEY_META[s.key]?.label || s.key}</p>
                    {s.note && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-[#8b5cf6]">{formatValue(s.key, s.value)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(s.effective_from).toLocaleDateString("ko-KR")} 적용
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openHistory(s.key)}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                      title="이력 보기"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(s.key, s.value)}
                      className="p-2 rounded-lg hover:bg-[#6366f1]/15 text-[#6366f1]"
                      title="변경"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── 변경 모달 ── */}
      {editingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-bold text-lg">{KEY_META[editingKey]?.label}</h3>
              <button onClick={() => setEditingKey(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">
                  새 값 ({KEY_META[editingKey]?.unit === "ratio" ? "%" : KEY_META[editingKey]?.unit === "krw" ? "원" : "시간"})
                </label>
                <input
                  type="number"
                  step={KEY_META[editingKey]?.unit === "ratio" ? "0.1" : "1"}
                  className="input-base"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5 text-muted-foreground">변경 사유 / 메모</label>
                <textarea
                  className="input-base min-h-[80px]"
                  placeholder="예: 2026-Q3 정책 조정"
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                />
              </div>
              <div className="text-[11px] text-amber-300/80 p-2 rounded bg-amber-500/5 border border-amber-500/20">
                저장 시 기존 값은 마감되고 새 값이 즉시 활성화됩니다. (과거 정산 영향 없음)
              </div>
            </div>
            <div className="flex gap-2 p-5 pt-0">
              <Button variant="outline" className="flex-1" onClick={() => setEditingKey(null)}>
                취소
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] gap-2"
                onClick={submitEdit}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                저장
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이력 모달 ── */}
      {historyKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[80vh] bg-background border border-border rounded-2xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-bold text-lg">변경 이력</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{KEY_META[historyKey]?.label}</p>
              </div>
              <button onClick={() => setHistoryKey(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">이력이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-[#8b5cf6]">{formatValue(h.key, h.value)}</p>
                        {h.effective_to === null && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-bold">
                            현재 활성
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {new Date(h.effective_from).toLocaleString("ko-KR")}
                        {h.effective_to && ` ~ ${new Date(h.effective_to).toLocaleString("ko-KR")}`}
                      </p>
                      {h.note && <p className="text-xs mt-1.5 text-muted-foreground/80">📝 {h.note}</p>}
                      {h.updater_name && <p className="text-[10px] text-muted-foreground/60 mt-1">변경: {h.updater_name}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
