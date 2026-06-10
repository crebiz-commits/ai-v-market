// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 이벤트 배너 관리 (시네마 상단 EventBannerBoard)
// event_banners CRUD (RLS: is_admin ALL). 컬럼은 BoardBanner 와 매핑.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { Loader2, ImageIcon, RefreshCw, Plus, Pencil, Trash2, X, Eye, EyeOff, Upload } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";
import { Button } from "./ui/button";

interface BannerRow {
  id: string;
  sort_order: number;
  title: string;
  subtitle: string | null;
  eyebrow: string | null;
  badge: string | null;
  badges: string[] | null;
  cta_label: string | null;
  link: string | null;
  image: string | null;
  align: "left" | "center";
  title_gradient: boolean;
  gradient: string | null;
  dark: boolean;
  is_active: boolean;
  active_from: string | null;
  active_to: string | null;
}

interface FormState {
  sort_order: number;
  title: string;
  subtitle: string;
  eyebrow: string;
  badge: string;
  badges: string;       // 쉼표 구분 입력 → text[]
  cta_label: string;
  link: string;
  image: string;
  align: "left" | "center";
  title_gradient: boolean;
  gradient: string;
  dark: boolean;
  is_active: boolean;
}

const EMPTY: FormState = {
  sort_order: 100, title: "", subtitle: "", eyebrow: "", badge: "", badges: "",
  cta_label: "", link: "", image: "", align: "left", title_gradient: false, gradient: "", dark: false, is_active: true,
};

export function AdminBanners() {
  const [items, setItems] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  // 배너 이미지 업로드 (ad-images 버킷의 banners/ 폴더 재사용 — 공개 읽기, 관리자 업로드)
  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("이미지 파일만 올릴 수 있어요."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("이미지는 10MB 이하여야 해요."); return; }
    setUploadingImg(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `banners/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
      const { error } = await supabase.storage.from("ad-images").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("ad-images").getPublicUrl(path);
      setForm((f) => ({ ...f, image: data.publicUrl }));
      toast.success("이미지를 올렸어요.");
    } catch (e: any) {
      console.warn("[AdminBanners] 이미지 업로드 실패:", e?.message);
      toast.error("업로드 실패: " + (e?.message || "알 수 없는 오류"));
    } finally {
      setUploadingImg(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("event_banners")
      .select("*")
      .order("sort_order", { ascending: true })
      .limit(100);
    if (error) {
      console.warn("[AdminBanners] 조회 실패:", error.message);
      toast.error("배너 조회 실패: " + error.message);
      setItems([]);
    } else {
      setItems((data || []) as BannerRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    const maxOrder = items.reduce((m, b) => Math.max(m, b.sort_order), 0);
    setEditingId(null);
    setForm({ ...EMPTY, sort_order: maxOrder + 10 });
    setShowForm(true);
  };

  const openEdit = (b: BannerRow) => {
    setEditingId(b.id);
    setForm({
      sort_order: b.sort_order,
      title: b.title,
      subtitle: b.subtitle || "",
      eyebrow: b.eyebrow || "",
      badge: b.badge || "",
      badges: (b.badges || []).join(", "),
      cta_label: b.cta_label || "",
      link: b.link || "",
      image: b.image || "",
      align: b.align === "center" ? "center" : "left",
      title_gradient: b.title_gradient,
      gradient: b.gradient || "",
      dark: b.dark,
      is_active: b.is_active,
    });
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY); };

  const handleSave = async () => {
    if (form.title.trim().length < 1) { toast.error("제목을 입력해주세요."); return; }
    setSaving(true);
    const payload = {
      sort_order: form.sort_order || 0,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      eyebrow: form.eyebrow.trim() || null,
      badge: form.badge.trim() || null,
      badges: form.badges.trim() ? form.badges.split(",").map((s) => s.trim()).filter(Boolean) : null,
      cta_label: form.cta_label.trim() || null,
      link: form.link.trim() || null,
      image: form.image.trim() || null,
      align: form.align,
      title_gradient: form.title_gradient,
      gradient: form.gradient.trim() || null,
      dark: form.dark,
      is_active: form.is_active,
    };
    if (editingId) {
      const { error } = await supabase.from("event_banners").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingId);
      setSaving(false);
      if (error) { toast.error("수정 실패: " + error.message); return; }
      toast.success("배너를 수정했어요.");
    } else {
      const { error } = await supabase.from("event_banners").insert(payload);
      setSaving(false);
      if (error) { toast.error("등록 실패: " + error.message); return; }
      toast.success("배너를 등록했어요. 시네마 상단에 바로 노출됩니다.");
    }
    closeForm();
    void load();
  };

  const toggleActive = async (b: BannerRow) => {
    const { error } = await supabase.from("event_banners").update({ is_active: !b.is_active, updated_at: new Date().toISOString() }).eq("id", b.id);
    if (error) { toast.error("변경 실패: " + error.message); return; }
    setItems((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const remove = async (b: BannerRow) => {
    if (!confirm(`'${b.title}' 배너를 삭제할까요?`)) return;
    const { error } = await supabase.from("event_banners").delete().eq("id", b.id);
    if (error) { toast.error("삭제 실패: " + error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== b.id));
    toast.success("배너를 삭제했어요.");
  };

  const inputCls = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#6366f1] transition-colors";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          시네마 상단 이벤트 배너를 관리합니다. <code className="px-1 py-0.5 rounded bg-muted text-xs">순서</code> 오름차순으로 노출되며, 비활성 배너는 숨겨집니다.
        </p>
        <button onClick={() => void load()} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" title="새로고침">
          <RefreshCw className="w-4 h-4" />
        </button>
        <Button size="sm" onClick={openCreate} className="gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold">
          <Plus className="w-4 h-4" /> 새 배너
        </Button>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl border border-[#6366f1]/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">{editingId ? "배너 수정" : "새 배너 등록"}</h3>
            <button onClick={closeForm} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">제목 *</label>
              <input className={inputCls} value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="버그를 잡아라! 🐛" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">순서 (작을수록 앞)</label>
              <input type="number" className={inputCls} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">부제 (subtitle)</label>
              <input className={inputCls} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">상단 라벨 (eyebrow)</label>
              <input className={inputCls} value={form.eyebrow} onChange={(e) => setForm((f) => ({ ...f, eyebrow: e.target.value }))} placeholder="예: 위클리 랭킹" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">좌상단 뱃지 (badge)</label>
              <input className={inputCls} value={form.badge} onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))} placeholder="예: 버그 헌트" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">하단 뱃지 묶음 (쉼표 구분)</label>
              <input className={inputCls} value={form.badges} onChange={(e) => setForm((f) => ({ ...f, badges: e.target.value }))} placeholder="매월 진행, 참가비 무료" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">버튼 문구 (CTA)</label>
              <input className={inputCls} value={form.cta_label} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} placeholder="버그 제보하기" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">링크</label>
              <input className={inputCls} value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} placeholder="/?tab=bug-report 또는 https://..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground block mb-1">배경 이미지 (없으면 그라데이션 사용)</label>
              <div className="flex items-center gap-2">
                <input className={inputCls} value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="이미지를 업로드하거나 URL 붙여넣기" />
                <label className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-border cursor-pointer hover:bg-muted transition-colors ${uploadingImg ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  업로드
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { void handleImageUpload(e.target.files?.[0] || null); e.target.value = ""; }} />
                </label>
              </div>
              {form.image && (
                <div className="mt-2 relative w-40 h-24 rounded-lg overflow-hidden border border-border">
                  <img src={form.image} alt="미리보기" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, image: "" }))}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-500/80">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">그라데이션 클래스 (이미지 없을 때)</label>
              <input className={inputCls} value={form.gradient} onChange={(e) => setForm((f) => ({ ...f, gradient: e.target.value }))} placeholder="from-[#1e1b4b] via-[#3b0764] to-[#0d0d14]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">정렬</label>
              <select className={inputCls} value={form.align} onChange={(e) => setForm((f) => ({ ...f, align: e.target.value as "left" | "center" }))}>
                <option value="left">왼쪽</option>
                <option value="center">가운데</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
              <input type="checkbox" checked={form.title_gradient} onChange={(e) => setForm((f) => ({ ...f, title_gradient: e.target.checked }))} className="w-4 h-4 accent-[#8b5cf6]" />
              제목 그라데이션
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
              <input type="checkbox" checked={form.dark} onChange={(e) => setForm((f) => ({ ...f, dark: e.target.checked }))} className="w-4 h-4 accent-[#f59e0b]" />
              어두운 글씨 (밝은 배경용)
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-[#10b981]" />
              활성화 (노출)
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeForm}>취소</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "수정 저장" : "등록"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>등록된 배너가 없습니다. (DB 마이그레이션 적용 여부 확인)</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b) => (
            <div key={b.id} className={`bg-card rounded-xl border p-4 ${b.is_active ? "border-border" : "border-border/40 opacity-60"}`}>
              <div className="flex items-start gap-3">
                <div className="w-24 h-14 rounded-lg overflow-hidden flex-shrink-0 hidden sm:flex items-center justify-center bg-gradient-to-br from-[#1a1030] to-[#0d0d14]">
                  {b.image ? <img src={b.image} alt={b.title} className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-muted-foreground/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-muted text-muted-foreground">#{b.sort_order}</span>
                    {b.badge && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#8b5cf6]/15 text-[#c4b5fd]">{b.badge}</span>}
                    {!b.is_active && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/10 text-gray-400">숨김</span>}
                  </div>
                  <p className="font-bold text-foreground truncate">{b.title}</p>
                  {b.subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{b.subtitle}</p>}
                  {b.link && <p className="text-[11px] text-muted-foreground mt-1"><code className="bg-muted px-1 rounded">{b.link}</code></p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => void toggleActive(b)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title={b.is_active ? "숨기기" : "노출"}>
                    {b.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(b)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title="수정"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => void remove(b)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-red-400" title="삭제"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
