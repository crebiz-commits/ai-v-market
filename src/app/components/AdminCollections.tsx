// ════════════════════════════════════════════════════════════════════════════
// 관리자 — CREAITE 컬렉션·셀렉트 관리 (2026-07-11)
//   collections/collection_videos DB 기반. 코드배포 없이 컬렉션 CRUD·영상 배정·순서·
//   에디토리얼(intro HTML) 편집 + 셀렉트 배지 소스 지정.
//   RPC: admin_list_collections / admin_get_collection_videos / admin_upsert_collection /
//        admin_delete_collection / admin_set_collection_videos, admin_search_videos(피커)
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Layers, Plus, Trash2, Search, ArrowUp, ArrowDown, X, Save, Award, Star,
} from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface CollectionRow {
  id: string; slug: string; title: string; tagline: string | null; intro: string | null;
  emoji: string | null; gradient: string | null; sort_order: number;
  is_active: boolean; is_select: boolean; video_count: number; video_ids: string[];
}
interface AssignedVideo {
  video_id: string; title: string; thumbnail: string | null;
  creator_name: string | null; is_hidden: boolean;
}
interface SearchVideo {
  id: string; title: string; thumbnail: string | null;
  creator_name: string | null; is_hidden: boolean;
}

interface FormState {
  id: string | null; slug: string; title: string; tagline: string; intro: string;
  emoji: string; gradient: string; sort_order: number; is_active: boolean; is_select: boolean;
}
const EMPTY_FORM: FormState = {
  id: null, slug: "", title: "", tagline: "", intro: "", emoji: "", gradient: "",
  sort_order: 100, is_active: true, is_select: false,
};

export function AdminCollections() {
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormState | null>(null);   // null=목록, else=편집
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingVideos, setSavingVideos] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 편집 중 컬렉션의 배정 영상(로컬 편집분)
  const [assigned, setAssigned] = useState<AssignedVideo[]>([]);
  const [videoDirty, setVideoDirty] = useState(false);
  // 영상 검색(피커)
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchVideo[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_collections");
    if (error) toast.error("컬렉션 조회 실패: " + error.message);
    setCollections((data as CollectionRow[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openNew = () => { setEditing({ ...EMPTY_FORM }); setAssigned([]); setResults([]); setQuery(""); setVideoDirty(false); };

  const openEdit = async (c: CollectionRow) => {
    setEditing({
      id: c.id, slug: c.slug, title: c.title, tagline: c.tagline || "", intro: c.intro || "",
      emoji: c.emoji || "", gradient: c.gradient || "", sort_order: c.sort_order,
      is_active: c.is_active, is_select: c.is_select,
    });
    setResults([]); setQuery(""); setVideoDirty(false);
    // 배정 영상 로드
    const { data, error } = await supabase.rpc("admin_get_collection_videos", { p_id: c.id });
    if (error) { toast.error("배정 영상 조회 실패: " + error.message); setAssigned([]); return; }
    setAssigned(((data as any[]) || []).map((r) => ({
      video_id: r.video_id, title: r.title, thumbnail: r.thumbnail,
      creator_name: r.creator_name, is_hidden: r.is_hidden,
    })));
  };

  const closeEdit = () => { setEditing(null); setAssigned([]); setResults([]); setQuery(""); setVideoDirty(false); };

  const saveMeta = async () => {
    if (!editing) return;
    if (!editing.slug.trim()) { toast.error("slug를 입력하세요 (예: night-tension)"); return; }
    if (!editing.title.trim()) { toast.error("제목을 입력하세요"); return; }
    setSavingMeta(true);
    const { data, error } = await supabase.rpc("admin_upsert_collection", {
      p_id: editing.id, p_slug: editing.slug.trim(), p_title: editing.title.trim(),
      p_tagline: editing.tagline.trim() || null, p_intro: editing.intro.trim() || null,
      p_emoji: editing.emoji.trim() || null, p_gradient: editing.gradient.trim() || null,
      p_sort_order: editing.sort_order || 100, p_is_active: editing.is_active, p_is_select: editing.is_select,
    });
    setSavingMeta(false);
    if (error) { toast.error("저장 실패: " + error.message); return; }
    const newId = data as string;
    toast.success("컬렉션 저장됨");
    setEditing((f) => (f ? { ...f, id: newId } : f));   // 신규→id 확보(이제 영상 배정 가능)
    void load();
  };

  const saveVideos = async () => {
    if (!editing?.id) { toast.error("먼저 컬렉션 정보를 저장하세요"); return; }
    setSavingVideos(true);
    const { data, error } = await supabase.rpc("admin_set_collection_videos", {
      p_id: editing.id, p_video_ids: assigned.map((a) => a.video_id),
    });
    setSavingVideos(false);
    if (error) { toast.error("영상 저장 실패: " + error.message); return; }
    toast.success(`영상 ${data}편 배정됨`);
    setVideoDirty(false);
    void load();
  };

  const remove = async (c: CollectionRow) => {
    if (!confirm(`'${c.title}' 컬렉션을 삭제할까요? (영상 배정도 함께 삭제)`)) return;
    setDeletingId(c.id);
    const { error } = await supabase.rpc("admin_delete_collection", { p_id: c.id });
    setDeletingId(null);
    if (error) { toast.error("삭제 실패: " + error.message); return; }
    toast.success("삭제됨");
    if (editing?.id === c.id) closeEdit();
    void load();
  };

  const searchVideos = async () => {
    setSearching(true);
    const { data, error } = await supabase.rpc("admin_search_videos", {
      p_query: query.trim() || null, p_filter: "all", p_limit: 20, p_offset: 0,
    });
    setSearching(false);
    if (error) { toast.error("영상 검색 실패: " + error.message); return; }
    setResults(((data as any[]) || []).map((r) => ({
      id: r.id, title: r.title, thumbnail: r.thumbnail, creator_name: r.creator_name, is_hidden: r.is_hidden,
    })));
  };

  const addVideo = (v: SearchVideo) => {
    if (assigned.some((a) => a.video_id === v.id)) { toast.info("이미 배정됨"); return; }
    setAssigned((prev) => [...prev, { video_id: v.id, title: v.title, thumbnail: v.thumbnail, creator_name: v.creator_name, is_hidden: v.is_hidden }]);
    setVideoDirty(true);
  };
  const removeVideo = (id: string) => { setAssigned((prev) => prev.filter((a) => a.video_id !== id)); setVideoDirty(true); };
  const moveVideo = (idx: number, dir: -1 | 1) => {
    setAssigned((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setVideoDirty(true);
  };

  // ── 목록 뷰 ──────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-sm text-muted-foreground">
            CREAITE 컬렉션·셀렉트를 관리합니다. <span className="text-[#a78bfa] font-semibold">🏆 셀렉트</span> 컬렉션의 영상엔 셀렉트 배지가 붙습니다.
          </p>
          <Button size="sm" onClick={openNew} className="ml-auto gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold">
            <Plus className="w-4 h-4" /> 새 컬렉션
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
        ) : collections.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>컬렉션이 없습니다. (마이그레이션 적용 여부 확인)</p>
          </div>
        ) : (
          <div className="space-y-2">
            {collections.map((c) => (
              <div key={c.id} className={`bg-card rounded-xl border p-4 ${c.is_active ? "border-border" : "border-border/40 opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl flex-shrink-0">{c.emoji || "🎬"}</span>
                  <button onClick={() => void openEdit(c)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground truncate">{c.title}</span>
                      {c.is_select && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold flex items-center gap-1"><Award className="w-3 h-3" />셀렉트</span>}
                      {!c.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-400 font-bold">숨김</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">#{c.sort_order}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.tagline || c.slug} · 영상 {c.video_count}편</p>
                  </button>
                  <button onClick={() => void remove(c)} disabled={deletingId === c.id}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-red-400 flex-shrink-0" title="삭제">
                    {deletingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 편집 뷰 ──────────────────────────────────────────────────────────────
  const inputCls = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#6366f1] transition-colors";
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={closeEdit} className="text-sm text-muted-foreground hover:text-foreground">← 목록</button>
        <h3 className="font-bold text-foreground ml-1">{editing.id ? "컬렉션 편집" : "새 컬렉션"}</h3>
      </div>

      {/* 메타데이터 */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">slug (URL 식별자) *</label>
            <input className={inputCls} value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="night-tension" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">제목 *</label>
            <input className={inputCls} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="긴장의 밤" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">한 줄 소개 (tagline)</label>
            <input className={inputCls} value={editing.tagline} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })} placeholder="액션 · 스릴러 · 공포 셀렉션" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">이모지</label>
            <input className={inputCls} value={editing.emoji} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} placeholder="🌙" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">정렬 순서 (작을수록 앞)</label>
            <input type="number" className={inputCls} value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">그라데이션 클래스 (tailwind)</label>
            <input className={inputCls} value={editing.gradient} onChange={(e) => setEditing({ ...editing, gradient: e.target.value })} placeholder="from-[#ef4444] to-[#6366f1]" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground block mb-1">에디토리얼 소개 (HTML: &lt;p&gt;/&lt;strong&gt;/&lt;em&gt;)</label>
            <textarea className={`${inputCls} min-h-[120px] font-mono`} value={editing.intro} onChange={(e) => setEditing({ ...editing, intro: e.target.value })} placeholder="<p>...</p>" />
          </div>
        </div>
        <div className="flex items-center gap-5 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
            <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4 accent-[#10b981]" />
            활성화 (노출)
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
            <input type="checkbox" checked={editing.is_select} onChange={(e) => setEditing({ ...editing, is_select: e.target.checked })} className="w-4 h-4 accent-[#f59e0b]" />
            <Star className="w-3.5 h-3.5 text-amber-400" /> CREAITE 셀렉트로 지정 (배지 소스 · 단 1개)
          </label>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void saveMeta()} disabled={savingMeta} className="gap-1.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold">
            {savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            컬렉션 정보 저장
          </Button>
        </div>
      </div>

      {/* 영상 배정 */}
      {!editing.id ? (
        <div className="text-center py-8 text-sm text-muted-foreground bg-card rounded-xl border border-border">
          먼저 위 <b>컬렉션 정보 저장</b> 후 영상을 배정할 수 있어요.
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-foreground">배정 영상 <span className="text-muted-foreground font-normal">({assigned.length})</span></h4>
            <Button size="sm" onClick={() => void saveVideos()} disabled={savingVideos || !videoDirty}
              className="ml-auto gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
              {savingVideos ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              영상 저장{videoDirty ? " *" : ""}
            </Button>
          </div>

          {/* 배정된 영상 목록 (순서 = 노출 순서) */}
          {assigned.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">아직 배정된 영상이 없어요. 아래에서 검색해 추가하세요.</p>
          ) : (
            <div className="space-y-1.5">
              {assigned.map((a, i) => (
                <div key={a.video_id} className="flex items-center gap-2 bg-background/50 rounded-lg p-2 border border-border/50">
                  <span className="text-[11px] text-muted-foreground w-5 text-center flex-shrink-0">{i + 1}</span>
                  <div className="w-12 h-8 rounded bg-black/40 overflow-hidden flex-shrink-0">
                    {a.thumbnail && <img src={a.thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{a.title || "(제목 없음)"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{a.creator_name || "—"}{a.is_hidden && " · 숨김"}</p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => moveVideo(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30" title="위로"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveVideo(i, 1)} disabled={i === assigned.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30" title="아래로"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeVideo(a.video_id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400" title="제거"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 영상 검색·추가 */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input className={`${inputCls} pl-9`} placeholder="영상 제목·작성자 검색" value={query}
                  onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchVideos()} />
              </div>
              <Button size="sm" onClick={() => void searchVideos()} disabled={searching} variant="outline">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "검색"}
              </Button>
            </div>
            {results.length > 0 && (
              <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
                {results.map((v) => {
                  const added = assigned.some((a) => a.video_id === v.id);
                  return (
                    <div key={v.id} className="flex items-center gap-2 bg-background/40 rounded-lg p-1.5 border border-border/40">
                      <div className="w-10 h-7 rounded bg-black/40 overflow-hidden flex-shrink-0">
                        {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{v.title || "(제목 없음)"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{v.creator_name || "—"}{v.is_hidden && " · 숨김"}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={added} onClick={() => addVideo(v)} className="h-7 text-xs flex-shrink-0">
                        {added ? "추가됨" : "추가"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
