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
const KEY_META: Record<string, { label: string; unit: "ratio" | "krw" | "hours" | "seconds" | "count"; group: string; hint?: string }> = {
  creator_share_sale:               { label: "판매 라이선스 크리에이터 분배", unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  creator_share_ad_home:            { label: "광고 — 1분 미만 영상 (현재 미적용)", unit: "ratio", group: "💰 분배 비율 (크리에이터)", hint: "콘텐츠 정책 v2에서 1분 미만 영상은 본편 광고 X. 정책 완화 시에만 적용" },
  creator_share_ad_cinema:          { label: "광고 — 시네마 (1분~10분)",  unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  creator_share_ad_ott:             { label: "광고 — OTT (10분+)",      unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  creator_share_subscription_pool:  { label: "구독료 풀 분배",            unit: "ratio", group: "💰 분배 비율 (크리에이터)" },
  subscription_price_krw:           { label: "월 구독료",                 unit: "krw",   group: "💵 가격 / 단가" },
  ad_cpm_krw:                       { label: "광고 CPM (1,000회 노출당)", unit: "krw",   group: "💵 가격 / 단가" },
  payout_minimum_krw:               { label: "정산 최소액 (미만 이월)",     unit: "krw",   group: "💵 가격 / 단가" },
  valid_view_min_ratio:             { label: "유효 시청 최소 비율",        unit: "ratio", group: "🛡 어뷰징 방지" },
  ip_dedup_hours:                   { label: "IP 중복 차단 시간",          unit: "hours", group: "🛡 어뷰징 방지" },
  new_video_grace_hours:            { label: "신규 영상 광고 제외 기간",    unit: "hours", group: "🛡 어뷰징 방지" },
  auto_hide_threshold:              { label: "신고 자동 숨김 임계값",       unit: "count", group: "🛡 어뷰징 방지", hint: "같은 콘텐츠에 신고 N건 누적 시 자동 숨김" },
  // 콘텐츠 정책 v2 (2026-05-26)
  min_upload_duration_seconds:      { label: "영상 업로드 최소 길이",       unit: "seconds", group: "🎬 콘텐츠 정책", hint: "이 길이 미만은 등록 차단" },
  cinema_min_duration_seconds:      { label: "시네마 코너 노출 최소 길이",  unit: "seconds", group: "🎬 콘텐츠 정책", hint: "이 길이 이상 영상만 시네마 등록" },
  ott_min_duration_seconds:         { label: "OTT 코너 노출 최소 길이",    unit: "seconds", group: "🎬 콘텐츠 정책", hint: "이 길이 이상 영상만 OTT 등록" },
  cinema_preview_seconds:           { label: "비구독자 미리보기 시간",      unit: "seconds", group: "🎬 콘텐츠 정책", hint: "영상 상세에서 비구독자에게 보여줄 시간" },
  feed_highlight_seconds:           { label: "홈피드 하이라이트 길이",      unit: "seconds", group: "🎬 콘텐츠 정책", hint: "홈피드 카드에서 반복 재생할 길이 (10~60초). 영상별 하이라이트 구간이 지정돼 있으면 그쪽 우선" },
  min_duration_for_preroll_seconds: { label: "Pre-roll·Overlay 광고 최소", unit: "seconds", group: "📢 광고 정책",   hint: "이 길이 이상 영상에만 본편 광고" },
  min_duration_for_midroll_seconds: { label: "Mid-roll 광고 최소 길이",    unit: "seconds", group: "📢 광고 정책",   hint: "이 길이 이상 영상에만 중간 광고" },
};

function formatValue(key: string, value: number) {
  const meta = KEY_META[key];
  if (!meta) return value.toString();
  if (meta.unit === "ratio") return (value * 100).toFixed(1) + "%";
  if (meta.unit === "krw") return "₩" + Math.round(value).toLocaleString();
  if (meta.unit === "hours") return value + "시간";
  if (meta.unit === "seconds") {
    if (value >= 60) {
      const m = Math.floor(value / 60);
      const s = value % 60;
      return s === 0 ? `${m}분` : `${m}분 ${s}초`;
    }
    return value + "초";
  }
  if (meta.unit === "count") return value + "건";
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
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);

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

    // 결제 킬스위치(payments_enabled)는 실사용자 실결제를 여닫는 최중대 토글 — 강한 확인.
    if (editingKey === "payments_enabled") {
      const on = finalValue === 1;
      const ok = confirm(
        `⚠️ 결제 시스템을 ${on ? "활성화(ON)" : "비활성화(OFF)"} 합니다.\n\n` +
        (on
          ? "ON = 실사용자에게 실제 결제(구독·라이선스)가 열립니다.\n토스 live 키 전환·검증 완료 후에만 켜세요.\n\n정말 결제를 여시겠습니까?"
          : "OFF = 모든 결제 생성이 차단됩니다(무결제 운영).\n\n계속하시겠습니까?")
      );
      if (!ok) return;
    }

    // F9: 정산·결제에 직결되는 금전 키는 저장 전 before→after 확인.
    //     분배율(creator_share_*)·가격/단가/최소액(*_krw) 오타 즉시반영 방지.
    const isMoneyKey = /^creator_share_/.test(editingKey) || /_krw$/.test(editingKey);
    if (isMoneyKey) {
      const current = settings.find((s) => s.key === editingKey)?.value;
      const ok = confirm(
        `[${KEY_META[editingKey]?.label}] 값을 변경합니다.\n\n` +
        (current !== undefined ? `현재: ${formatValue(editingKey, current)}\n` : "") +
        `변경: ${formatValue(editingKey, finalValue)}\n\n` +
        `이 값은 앞으로의 정산·결제에 즉시 반영됩니다. 계속하시겠습니까?`
      );
      if (!ok) return;
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

  // 설정 이력은 append-only 로 영구 누적 → 페이지 단위 조회(전엔 LIMIT 없이 전량)
  const HISTORY_PAGE = 30;
  const openHistory = async (key: string, targetPage = 0) => {
    setHistoryKey(key);
    setHistoryLoading(true);
    const { data, error } = await supabase.rpc("get_platform_setting_history", {
      p_key: key, p_limit: HISTORY_PAGE, p_offset: targetPage * HISTORY_PAGE,
    });
    if (error) {
      toast.error("이력 조회 실패: " + error.message);
      setHistory([]);
    } else {
      const rows = (data || []) as any[];
      setHistory(rows);
      setHistoryTotal(Number(rows[0]?.total_count) || 0);
      setHistoryPage(targetPage);
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
                  새 값 ({(() => {
                    const u = KEY_META[editingKey]?.unit;
                    if (u === "ratio") return "%";
                    if (u === "krw") return "원";
                    if (u === "seconds") return "초";
                    if (u === "count") return "건";
                    return "시간";
                  })()})
                  {KEY_META[editingKey]?.hint && (
                    <span className="ml-2 text-[10px] text-amber-400/80">— {KEY_META[editingKey]?.hint}</span>
                  )}
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
                  {historyTotal > (historyPage + 1) * 30 && (
                    <div className="flex justify-center pt-1">
                      <Button variant="outline" size="sm" disabled={historyLoading}
                        onClick={() => historyKey && void openHistory(historyKey, historyPage + 1)}>
                        더 보기 ({(historyPage + 1) * 30} / {historyTotal})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
