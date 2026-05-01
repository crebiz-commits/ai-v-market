import { useState, useEffect } from "react";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  BarChart2, Eye, MousePointerClick, Megaphone,
  ImageIcon, Video, Link, Calendar, Save, X, Loader2, ShieldAlert
} from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

// ─── 관리자 이메일 목록 (여기에 추가) ────────────────────────────
const ADMIN_EMAILS = [
  "crebizlogistics@gmail.com",
];
// ─────────────────────────────────────────────────────────────────

type AdType = "feed_display" | "video_preroll";

interface Ad {
  id: string;
  title: string;
  advertiser: string;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  link_url: string;
  cta_text: string;
  interval_count: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  created_at: string;
  // 비디오 pre-roll 광고 (Phase 2)
  ad_type: AdType;
  skip_offset: number;
  max_duration: number;
  weight: number;
}

const emptyForm = (): Omit<Ad, "id" | "impressions" | "clicks" | "created_at"> => ({
  title: "",
  advertiser: "",
  image_url: null,
  video_url: null,
  thumbnail_url: null,
  link_url: "",
  cta_text: "자세히 보기",
  interval_count: 4,
  is_active: true,
  starts_at: null,
  ends_at: null,
  ad_type: "feed_display",
  skip_offset: 5,
  max_duration: 30,
  weight: 1,
});

function ctr(impressions: number, clicks: number) {
  if (impressions === 0) return "0%";
  return ((clicks / impressions) * 100).toFixed(1) + "%";
}

function fmt(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1) + "만";
  return n.toLocaleString();
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (isAdmin) fetchAds();
  }, [isAdmin]);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAds(data || []);
    } catch (err: any) {
      toast.error("광고 목록 로드 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (ad: Ad) => {
    setEditingId(ad.id);
    setForm({
      title: ad.title,
      advertiser: ad.advertiser,
      image_url: ad.image_url,
      video_url: ad.video_url,
      thumbnail_url: ad.thumbnail_url,
      link_url: ad.link_url,
      cta_text: ad.cta_text,
      interval_count: ad.interval_count,
      is_active: ad.is_active,
      starts_at: ad.starts_at ? ad.starts_at.slice(0, 16) : null,
      ends_at: ad.ends_at ? ad.ends_at.slice(0, 16) : null,
      ad_type: ad.ad_type || "feed_display",
      skip_offset: ad.skip_offset ?? 5,
      max_duration: ad.max_duration ?? 30,
      weight: ad.weight ?? 1,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("광고명을 입력하세요."); return; }
    if (!form.link_url.trim()) { toast.error("랜딩 URL을 입력하세요."); return; }
    if (form.ad_type === "video_preroll" && !form.video_url?.trim()) {
      toast.error("Pre-roll 광고는 Bunny 영상 URL이 필수입니다.");
      return;
    }
    if (form.ad_type === "feed_display" && !form.image_url && !form.video_url) {
      toast.error("이미지 URL 또는 Bunny 영상 URL을 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };

      if (editingId) {
        const { error } = await supabase.from("ads").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("광고가 수정되었습니다.");
      } else {
        const { error } = await supabase.from("ads").insert(payload);
        if (error) throw error;
        toast.success("광고가 등록되었습니다.");
      }

      setShowForm(false);
      fetchAds();
    } catch (err: any) {
      toast.error("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad: Ad) => {
    try {
      const { error } = await supabase
        .from("ads")
        .update({ is_active: !ad.is_active })
        .eq("id", ad.id);
      if (error) throw error;
      setAds(prev => prev.map(a => a.id === ad.id ? { ...a, is_active: !a.is_active } : a));
      toast.success(ad.is_active ? "광고가 비활성화되었습니다." : "광고가 활성화되었습니다.");
    } catch (err: any) {
      toast.error("상태 변경 실패: " + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("ads").delete().eq("id", id);
      if (error) throw error;
      setAds(prev => prev.filter(a => a.id !== id));
      setDeleteConfirm(null);
      toast.success("광고가 삭제되었습니다.");
    } catch (err: any) {
      toast.error("삭제 실패: " + err.message);
    }
  };

  // ── 접근 제한 ───────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <ShieldAlert className="w-12 h-12 text-[#6366f1]" />
        <p className="text-lg font-semibold">로그인이 필요합니다.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <p className="text-lg font-semibold text-foreground">접근 권한이 없습니다.</p>
        <p className="text-sm">관리자 계정으로 로그인해 주세요.</p>
        <p className="text-xs text-muted-foreground/50">현재 계정: {user.email}</p>
      </div>
    );
  }

  // ── 메인 대시보드 ────────────────────────────────────────────────
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const activeCount = ads.filter(a => a.is_active).length;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto p-4 md:p-6 pb-16">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-[#6366f1]" />
              광고 관리
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Discovery Feed에 노출되는 광고를 관리합니다.</p>
          </div>
          <Button
            onClick={openCreate}
            className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold"
          >
            <Plus className="w-4 h-4" />
            광고 추가
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: Megaphone, label: "활성 광고", value: activeCount + "개", color: "text-[#6366f1]" },
            { icon: Eye,       label: "총 노출",   value: fmt(totalImpressions), color: "text-blue-400" },
            { icon: MousePointerClick, label: "총 클릭", value: fmt(totalClicks), color: "text-green-400" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <Icon className={`w-5 h-5 mb-2 ${color}`} />
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Ad List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
          </div>
        ) : ads.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>등록된 광고가 없습니다.</p>
            <p className="text-sm mt-1">위의 [광고 추가] 버튼으로 첫 광고를 만들어 보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ads.map(ad => (
              <div key={ad.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  {/* 썸네일 */}
                  <div className="w-20 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    {(ad.thumbnail_url || ad.image_url) ? (
                      <img
                        src={ad.thumbnail_url || ad.image_url!}
                        alt={ad.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-6 h-6 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{ad.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        ad.is_active
                          ? "bg-green-500/15 text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {ad.is_active ? "활성" : "비활성"}
                      </span>
                      {ad.video_url && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6366f1]/15 text-[#6366f1] font-bold">영상</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{ad.advertiser || "광고주 미설정"} · 매 {ad.interval_count}개마다 노출</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(ad.impressions)}</span>
                      <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" />{fmt(ad.clicks)}</span>
                      <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />CTR {ctr(ad.impressions, ad.clicks)}</span>
                    </div>
                    {(ad.starts_at || ad.ends_at) && (
                      <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {ad.starts_at ? ad.starts_at.slice(0, 10) : "즉시"} ~ {ad.ends_at ? ad.ends_at.slice(0, 10) : "무기한"}
                      </p>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(ad)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      title={ad.is_active ? "비활성화" : "활성화"}
                    >
                      {ad.is_active
                        ? <ToggleRight className="w-5 h-5 text-green-400" />
                        : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <button
                      onClick={() => openEdit(ad)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      title="수정"
                    >
                      <Pencil className="w-4 h-4 text-[#6366f1]" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(ad.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>

                {/* 삭제 확인 */}
                {deleteConfirm === ad.id && (
                  <div className="border-t border-border bg-red-500/5 px-4 py-3 flex items-center justify-between">
                    <p className="text-sm text-red-400 font-medium">정말 삭제하시겠습니까?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>취소</Button>
                      <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(ad.id)}>삭제</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 광고 등록/수정 폼 (슬라이드 패널) ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          {/* Panel */}
          <div className="w-full max-w-md bg-background border-l border-border overflow-y-auto flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
              <h3 className="font-bold text-lg">{editingId ? "광고 수정" : "광고 추가"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">

              {/* 광고 타입 선택 */}
              <Field label="광고 타입 *">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, ad_type: "feed_display" }))}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      form.ad_type === "feed_display"
                        ? "border-[#6366f1] bg-[#6366f1]/10"
                        : "border-border hover:border-[#6366f1]/50"
                    }`}
                  >
                    <div className="font-semibold text-sm mb-0.5">📰 홈 피드 카드</div>
                    <div className="text-[11px] text-muted-foreground">홈 피드 영상 사이에 노출</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, ad_type: "video_preroll" }))}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      form.ad_type === "video_preroll"
                        ? "border-[#6366f1] bg-[#6366f1]/10"
                        : "border-border hover:border-[#6366f1]/50"
                    }`}
                  >
                    <div className="font-semibold text-sm mb-0.5">▶️ 영상 Pre-roll</div>
                    <div className="text-[11px] text-muted-foreground">영상 재생 전 자동 광고</div>
                  </button>
                </div>
              </Field>

              {/* 광고명 */}
              <Field label="광고명 *">
                <input
                  className="input-base"
                  placeholder="예: 런웨이 신규 플랜 프로모션"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </Field>

              {/* 광고주 */}
              <Field label="광고주명">
                <input
                  className="input-base"
                  placeholder="예: Runway AI"
                  value={form.advertiser}
                  onChange={e => setForm(f => ({ ...f, advertiser: e.target.value }))}
                />
              </Field>

              {/* 이미지 URL */}
              <Field label="이미지 URL" icon={<ImageIcon className="w-4 h-4 text-muted-foreground" />}>
                <input
                  className="input-base"
                  placeholder="https://... (배너 이미지)"
                  value={form.image_url || ""}
                  onChange={e => setForm(f => ({ ...f, image_url: e.target.value || null }))}
                />
                {form.image_url && (
                  <img src={form.image_url} alt="preview" className="mt-2 w-full h-32 object-cover rounded-lg border border-border" />
                )}
              </Field>

              {/* Bunny 영상 URL */}
              <Field label="Bunny 영상 URL (HLS)" icon={<Video className="w-4 h-4 text-muted-foreground" />}>
                <input
                  className="input-base"
                  placeholder="https://...bunnycdn.com/.../playlist.m3u8"
                  value={form.video_url || ""}
                  onChange={e => setForm(f => ({ ...f, video_url: e.target.value || null }))}
                />
                <p className="text-xs text-muted-foreground mt-1">영상 광고는 Bunny.net에 업로드 후 m3u8 URL을 입력하세요.</p>
              </Field>

              {/* 썸네일 URL (영상 광고용) */}
              {form.video_url && (
                <Field label="썸네일 URL (영상 광고용)">
                  <input
                    className="input-base"
                    placeholder="https://... (영상 미리보기 이미지)"
                    value={form.thumbnail_url || ""}
                    onChange={e => setForm(f => ({ ...f, thumbnail_url: e.target.value || null }))}
                  />
                </Field>
              )}

              {/* 랜딩 URL */}
              <Field label="랜딩 URL *" icon={<Link className="w-4 h-4 text-muted-foreground" />}>
                <input
                  className="input-base"
                  placeholder="https://... (클릭 시 이동할 주소)"
                  value={form.link_url}
                  onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                />
              </Field>

              {/* CTA 텍스트 */}
              <Field label="CTA 버튼 텍스트">
                <input
                  className="input-base"
                  placeholder="예: 자세히 보기, 무료 체험"
                  value={form.cta_text}
                  onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))}
                />
              </Field>

              {/* 홈피드 광고 — 노출 간격 */}
              {form.ad_type === "feed_display" && (
                <Field label={`노출 간격: 매 ${form.interval_count}개 영상마다`}>
                  <input
                    type="range" min={2} max={10} step={1}
                    value={form.interval_count}
                    onChange={e => setForm(f => ({ ...f, interval_count: Number(e.target.value) }))}
                    className="w-full accent-[#6366f1]"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>2개마다 (고빈도)</span>
                    <span>10개마다 (저빈도)</span>
                  </div>
                </Field>
              )}

              {/* 비디오 Pre-roll 전용 옵션 */}
              {form.ad_type === "video_preroll" && (
                <>
                  <Field label={`SKIP 가능 시점: ${form.skip_offset}초 후`}>
                    <input
                      type="range" min={0} max={15} step={1}
                      value={form.skip_offset}
                      onChange={e => setForm(f => ({ ...f, skip_offset: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>즉시 SKIP</span>
                      <span>15초 후</span>
                    </div>
                  </Field>

                  <Field label={`광고 최대 길이: ${form.max_duration}초`}>
                    <input
                      type="range" min={5} max={60} step={5}
                      value={form.max_duration}
                      onChange={e => setForm(f => ({ ...f, max_duration: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>5초</span>
                      <span>60초</span>
                    </div>
                  </Field>

                  <Field label={`노출 가중치: ${form.weight}`}>
                    <input
                      type="number" min={1} max={100} step={1}
                      value={form.weight}
                      onChange={e => setForm(f => ({ ...f, weight: Math.max(1, Number(e.target.value) || 1) }))}
                      className="input-base"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      여러 비디오 광고 중 랜덤 선택될 확률 가중치 (1~100). 높을수록 자주 노출.
                    </p>
                  </Field>
                </>
              )}

              {/* 기간 */}
              <Field label="노출 기간" icon={<Calendar className="w-4 h-4 text-muted-foreground" />}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">시작일 (비워두면 즉시)</label>
                    <input
                      type="datetime-local"
                      className="input-base text-sm"
                      value={form.starts_at || ""}
                      onChange={e => setForm(f => ({ ...f, starts_at: e.target.value || null }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">종료일 (비워두면 무기한)</label>
                    <input
                      type="datetime-local"
                      className="input-base text-sm"
                      value={form.ends_at || ""}
                      onChange={e => setForm(f => ({ ...f, ends_at: e.target.value || null }))}
                    />
                  </div>
                </div>
              </Field>

              {/* 활성화 */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
                <div>
                  <p className="font-medium text-sm">광고 활성화</p>
                  <p className="text-xs text-muted-foreground">비활성 광고는 피드에 노출되지 않습니다.</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                  {form.is_active
                    ? <ToggleRight className="w-8 h-8 text-green-400" />
                    : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                </button>
              </div>

            </div>

            {/* 저장 버튼 */}
            <div className="px-5 py-4 border-t border-border sticky bottom-0 bg-background">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold h-11"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? "수정 저장" : "광고 등록"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
