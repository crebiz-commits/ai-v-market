// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 챌린지(공모전) 관리
// challenges 테이블 CRUD (RLS: is_admin() — ALL). 커뮤니티 챌린지 탭이 이 데이터를 읽음.
// 출품작은 영상 태그 'challenge:<tag>' 로 연결 (참가하기 → 업로드 시 자동 부착)
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { Loader2, Trophy, RefreshCw, Plus, Pencil, Trash2, X, Film } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "./ui/button";

interface ChallengeRow {
  id: string;
  tag: string;
  title: string;
  title_en: string | null;
  prize: string;
  prize_en: string | null;
  description: string;
  description_en: string | null;
  image: string | null;
  starts_at: string;   // date
  deadline: string;    // date
  created_at: string;
  entries?: number;    // 참여작 수 (videos 태그 카운트)
}

interface FormState {
  tag: string;
  title: string;
  title_en: string;
  prize: string;
  prize_en: string;
  description: string;
  description_en: string;
  image: string;
  starts_at: string;
  deadline: string;
}

const EMPTY_FORM: FormState = {
  tag: "",
  title: "",
  title_en: "",
  prize: "총 60만원",
  prize_en: "₩600,000 total",
  description: "",
  description_en: "",
  image: "",
  starts_at: "",
  deadline: "",
};

const TAG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

function statusOf(c: { starts_at: string; deadline: string }): { label: string; cls: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (c.deadline < today) return { label: "마감", cls: "bg-white/10 text-gray-400 border-white/20" };
  if (c.starts_at > today) return { label: "오픈 예정", cls: "bg-[#6366f1]/20 text-[#a5b4fc] border-[#6366f1]/40" };
  return { label: "진행중", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" };
}

export function AdminChallenges() {
  const { user } = useAuth();
  const [items, setItems] = useState<ChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 폼 (작성 + 수정 겸용)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(100);
    if (error) {
      console.warn("[AdminChallenges] 조회 실패:", error.message);
      toast.error("챌린지 조회 실패: " + error.message);
      setItems([]);
      setLoading(false);
      return;
    }
    const rows = (data || []) as ChallengeRow[];
    // 참여작 수 — 영상 태그 challenge:<tag> 카운트
    const counts = await Promise.all(
      rows.map(async (r) => {
        const { count } = await supabase
          .from("videos")
          .select("id", { count: "exact", head: true })
          .contains("tags", [`challenge:${r.tag}`]);
        return count || 0;
      })
    );
    setItems(rows.map((r, i) => ({ ...r, entries: counts[i] })));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (c: ChallengeRow) => {
    setEditingId(c.id);
    setForm({
      tag: c.tag,
      title: c.title,
      title_en: c.title_en || "",
      prize: c.prize,
      prize_en: c.prize_en || "",
      description: c.description,
      description_en: c.description_en || "",
      image: c.image || "",
      starts_at: c.starts_at,
      deadline: c.deadline,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    const tag = form.tag.trim().toLowerCase();
    if (!TAG_RE.test(tag)) {
      toast.error("태그는 영문 소문자·숫자·하이픈 2~49자여야 해요. (예: future-city)");
      return;
    }
    if (form.title.trim().length < 2) { toast.error("제목을 2자 이상 입력해주세요."); return; }
    if (!form.description.trim()) { toast.error("설명을 입력해주세요."); return; }
    if (!form.starts_at || !form.deadline) { toast.error("시작일과 마감일을 선택해주세요."); return; }
    if (form.deadline < form.starts_at) { toast.error("마감일이 시작일보다 빠를 수 없어요."); return; }

    setSaving(true);
    const payload = {
      tag,
      title: form.title.trim(),
      title_en: form.title_en.trim() || null,
      prize: form.prize.trim() || "총 60만원",
      prize_en: form.prize_en.trim() || null,
      description: form.description.trim(),
      description_en: form.description_en.trim() || null,
      image: form.image.trim() || null,
      starts_at: form.starts_at,
      deadline: form.deadline,
    };
    if (editingId) {
      const { error } = await supabase
        .from("challenges")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", editingId);
      setSaving(false);
      if (error) {
        console.warn("[AdminChallenges] 수정 실패:", error.message);
        toast.error("수정 실패: " + error.message);
        return;
      }
      toast.success("챌린지를 수정했어요.");
    } else {
      const { error } = await supabase
        .from("challenges")
        .insert({ ...payload, created_by: user?.id || null });
      setSaving(false);
      if (error) {
        console.warn("[AdminChallenges] 등록 실패:", error.message);
        toast.error(error.code === "23505" ? "이미 같은 태그의 챌린지가 있어요." : "등록 실패: " + error.message);
        return;
      }
      toast.success("챌린지를 등록했어요. 커뮤니티 챌린지 탭에 바로 노출됩니다. 🏆");
    }
    closeForm();
    void load();
  };

  const handleDelete = async (c: ChallengeRow) => {
    if (!confirm(`'${c.title}' 챌린지를 삭제할까요?\n출품작 영상은 삭제되지 않고 태그(challenge:${c.tag})만 남습니다.`)) return;
    const { error } = await supabase.from("challenges").delete().eq("id", c.id);
    if (error) {
      console.warn("[AdminChallenges] 삭제 실패:", error.message);
      toast.error("삭제 실패: " + error.message);
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== c.id));
    toast.success("챌린지를 삭제했어요.");
  };

  const inputCls = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#6366f1] transition-colors";

  return (
    <div className="space-y-4">
      {/* 상단 액션 */}
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          매월 공모전을 등록·관리합니다. 출품작은 영상 태그 <code className="px-1 py-0.5 rounded bg-muted text-xs">challenge:태그</code> 로 자동 연결돼요.
        </p>
        <button onClick={() => void load()} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" title="새로고침">
          <RefreshCw className="w-4 h-4" />
        </button>
        <Button size="sm" onClick={openCreate} className="gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold">
          <Plus className="w-4 h-4" />
          새 챌린지
        </Button>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <div className="bg-card rounded-xl border border-[#6366f1]/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              {editingId ? "챌린지 수정" : "새 챌린지 등록"}
            </h3>
            <button onClick={closeForm} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">제목 (한국어) *</label>
              <input className={inputCls} value={form.title} maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="이달의 챌린지 · 미래 도시" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">제목 (영어, 선택)</label>
              <input className={inputCls} value={form.title_en} maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
                placeholder="This Month · Future City" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                태그 (출품작 연결 슬러그) * {editingId && <span className="text-amber-400">— 수정 시 기존 출품작 연결이 끊어져요</span>}
              </label>
              <input className={inputCls} value={form.tag} maxLength={49}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                placeholder="future-city (영문 소문자·숫자·하이픈)" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">대표 이미지 URL (선택)</label>
              <input className={inputCls} value={form.image}
                onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">상금 (한국어)</label>
              <input className={inputCls} value={form.prize} maxLength={60}
                onChange={(e) => setForm((f) => ({ ...f, prize: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">상금 (영어, 선택)</label>
              <input className={inputCls} value={form.prize_en} maxLength={60}
                onChange={(e) => setForm((f) => ({ ...f, prize_en: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">시작일 *</label>
              <input type="date" className={inputCls} value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">마감일 *</label>
              <input type="date" className={inputCls} value={form.deadline}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">설명 (한국어) *</label>
            <textarea className={`${inputCls} resize-none`} rows={5} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={"테마 설명, 참여 방법, 시상 안내 등.\n\n🏆 1등 30만원 · 2등 20만원 · 3등 10만원"} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">설명 (영어, 선택)</label>
            <textarea className={`${inputCls} resize-none`} rows={3} value={form.description_en}
              onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={closeForm}>취소</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}
              className="gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "수정 저장" : "등록"}
            </Button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>등록된 챌린지가 없습니다. (DB 마이그레이션 적용 여부를 확인해주세요)</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const sm = statusOf(c);
            return (
              <div key={c.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  {c.image && (
                    <img src={c.image} alt={c.title} className="w-24 h-14 rounded-lg object-cover flex-shrink-0 hidden sm:block" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${sm.cls}`}>{sm.label}</span>
                      <code className="px-1.5 py-0.5 rounded bg-muted text-[11px] text-muted-foreground">challenge:{c.tag}</code>
                      <span className="text-xs text-muted-foreground ml-auto">{c.starts_at} ~ {c.deadline}</span>
                    </div>
                    <p className="font-bold text-foreground truncate">{c.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-400" />{c.prize}</span>
                      <span className="flex items-center gap-1"><Film className="w-3.5 h-3.5" />출품작 {c.entries ?? 0}편</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title="수정">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => void handleDelete(c)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-red-400" title="삭제">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
