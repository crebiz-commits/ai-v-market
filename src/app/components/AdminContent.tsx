// 콘텐츠 관리 페이지 (Phase 10.6) — 영상 검색/강제 숨김/복원/삭제
import { useEffect, useState } from "react";
import { Loader2, Search, Eye, EyeOff, Trash2, Film, Flag, Star } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface VideoRow {
  id: string;
  title: string;
  thumbnail: string | null;
  creator_id: string | null;
  creator_name: string | null;
  duration_seconds: number;
  views: number;
  price: number;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_at: string | null;
  created_at: string;
  pending_reports: number;
}

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "visible", label: "공개" },
  { key: "hidden", label: "숨김" },
];

function fmtDuration(s: number) {
  if (!s) return "-";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AdminContent() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  // OTT 히어로 지정 영상 id → featured_hero_until (배지/토글 표시용)
  const [heroMap, setHeroMap] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_search_videos", {
      p_query: query || null,
      p_filter: filter,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) {
      toast.error("영상 목록 조회 실패: " + error.message);
      setVideos([]);
    } else {
      setVideos(data || []);
    }
    setLoading(false);
  };

  const loadHeroes = async () => {
    const { data, error } = await supabase.rpc("admin_list_hero_video_ids");
    if (error || !Array.isArray(data)) return;   // 실패해도 목록엔 영향 없음
    const map: Record<string, string> = {};
    for (const row of data as { video_id: string; featured_hero_until: string }[]) {
      map[row.video_id] = row.featured_hero_until;
    }
    setHeroMap(map);
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { loadHeroes(); }, []);

  const HERO_DAYS = 30;
  const setHero = async (v: VideoRow, days: number) => {
    setProcessingId(v.id);
    const { data, error } = await supabase.rpc("admin_set_video_hero", { p_video_id: v.id, p_days: days });
    setProcessingId(null);
    if (error) return toast.error("히어로 설정 실패: " + error.message);
    toast.success(days > 0 ? `OTT 히어로로 지정됨 (${days}일)` : "히어로 지정 해제됨");
    setHeroMap(prev => {
      const next = { ...prev };
      if (data) next[v.id] = data as string; else delete next[v.id];
      return next;
    });
  };

  const hide = async (v: VideoRow) => {
    const reason = prompt(`'${v.title}' 영상을 숨기는 이유:`);
    if (reason === null) return;
    setProcessingId(v.id);
    const { error } = await supabase.rpc("admin_hide_video", { p_video_id: v.id, p_reason: reason });
    setProcessingId(null);
    if (error) return toast.error("숨김 실패: " + error.message);
    toast.success("숨김 처리됨");
    load();
  };

  const unhide = async (v: VideoRow) => {
    if (!confirm(`'${v.title}' 영상을 복원하시겠습니까?`)) return;
    setProcessingId(v.id);
    const { error } = await supabase.rpc("admin_unhide_video", { p_video_id: v.id });
    setProcessingId(null);
    if (error) return toast.error("복원 실패: " + error.message);
    toast.success("복원됨");
    load();
  };

  const remove = async (v: VideoRow) => {
    if (!confirm(`'${v.title}' 영상을 영구 삭제하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)`)) return;
    setProcessingId(v.id);
    const { error } = await supabase.rpc("admin_delete_video", { p_video_id: v.id });
    setProcessingId(null);
    if (error) return toast.error("삭제 실패: " + error.message);
    toast.success("삭제됨");
    load();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="input-base pl-9 w-full"
            placeholder="영상 제목 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
        </div>
        <Button onClick={load} disabled={loading}>검색</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : videos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>영상이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {videos.map(v => (
            <div key={v.id} className={`bg-card border rounded-xl p-3 ${v.is_hidden ? "border-red-500/30 opacity-70" : "border-border"}`}>
              <div className="flex gap-3">
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt="" className="w-24 h-16 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-24 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Film className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{v.title}</p>
                    {v.is_hidden && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold">숨김</span>
                    )}
                    {v.pending_reports > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold flex items-center gap-1">
                        <Flag className="w-3 h-3" />{v.pending_reports}건
                      </span>
                    )}
                    {heroMap[v.id] && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 font-bold flex items-center gap-1">
                        <Star className="w-3 h-3 fill-current" />OTT 히어로
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v.creator_name || "이름 없음"} · {fmtDuration(v.duration_seconds)} · 조회 {v.views.toLocaleString()} · ₩{v.price.toLocaleString()}
                  </p>
                  {v.is_hidden && v.hidden_reason && (
                    <p className="text-xs text-red-400/80 mt-1">숨김 사유: {v.hidden_reason}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {v.is_hidden ? (
                    <Button size="sm" variant="outline" onClick={() => unhide(v)} disabled={processingId === v.id} className="gap-1 text-green-400 border-green-500/30">
                      <Eye className="w-3.5 h-3.5" />복원
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => hide(v)} disabled={processingId === v.id} className="gap-1 text-amber-300 border-amber-500/30">
                      <EyeOff className="w-3.5 h-3.5" />숨김
                    </Button>
                  )}
                  {heroMap[v.id] ? (
                    <Button size="sm" variant="outline" onClick={() => setHero(v, 0)} disabled={processingId === v.id} className="gap-1 text-fuchsia-300 border-fuchsia-500/40">
                      <Star className="w-3.5 h-3.5 fill-current" />히어로 해제
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setHero(v, HERO_DAYS)} disabled={processingId === v.id || v.is_hidden} className="gap-1 text-muted-foreground">
                      <Star className="w-3.5 h-3.5" />히어로 지정
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => remove(v)} disabled={processingId === v.id} className="gap-1 text-red-400 border-red-500/30">
                    <Trash2 className="w-3.5 h-3.5" />삭제
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
