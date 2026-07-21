// ════════════════════════════════════════════════════════════════════════════
// 플레이리스트에 추가 모달 (Phase 18)
//
// 특정 영상을 본인 플레이리스트들에 추가/제거.
// 체크박스 토글 즉시 add/remove RPC 호출 (Optimistic UI).
// 하단에 "+ 새 플레이리스트 만들기" — 인라인 입력 후 자동 추가.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Check, Bookmark, FolderPlus, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";

interface PlaylistRow {
  playlist_id: string;
  name: string;
  is_watch_later: boolean;
  contains: boolean;
}

interface AddToPlaylistModalProps {
  open: boolean;
  videoId: string;
  videoTitle?: string;
  onClose: () => void;
  onChange?: () => void;   // 외부에서 watch later 버튼 상태 동기화하려면
}

export function AddToPlaylistModal({ open, videoId, videoTitle, onClose, onChange }: AddToPlaylistModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState(false);   // 조회 실패 — "없음"과 구분
  const [wlBusy, setWlBusy] = useState(false);         // 나중에 보기 토글 진행중

  // 플레이리스트 멤버십 조회
  const load = async () => {
    if (!videoId) {
      // 가드가 setLoading(true) 뒤에 있으면 스피너가 영원히 남는다(초기값 true).
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_playlist_memberships", {
        p_video_id: videoId,
      });
      if (error) throw error;
      setPlaylists((data as PlaylistRow[]) || []);
      setLoadError(false);
    } catch (err: any) {
      // ★ 실패 시 반드시 비운다. 안 비우면 **이전 영상의 체크 상태**가 다음 영상 화면에 남아,
      //   사용자가 체크를 풀면 담긴 적 없는 영상에 remove 를 날리게 된다(2026-07-22 감사).
      setPlaylists([]);
      setLoadError(true);
      // 서버가 '로그인이 필요합니다' 같은 구체 사유를 RAISE 하는데 고정문구로 덮으면 원인이 가려진다.
      toast.error(err?.message || t("addToPlaylist.fetchFailed"));
    } finally {
      setLoading(false);
    }
  };

  // "나중에 보기" 토글 — 이 RPC 가 watch-later 플레이리스트를 lazy create 하는 유일한 경로다.
  //   (2026-07-22 이전엔 호출부가 0건이라 기능 전체가 도달 불가였다)
  const toggleWatchLater = async () => {
    if (wlBusy) return;
    setWlBusy(true);
    try {
      const { data, error } = await supabase.rpc("toggle_watch_later", { p_video_id: videoId });
      if (error) throw error;
      toast.success(data ? t("addToPlaylist.addedToast") : t("addToPlaylist.removedToast"));
      await load();   // 최초 호출이면 플레이리스트가 새로 생기므로 목록 재조회 필요
      onChange?.();
    } catch (err: any) {
      toast.error(err?.message || t("addToPlaylist.fetchFailed"));
    } finally {
      setWlBusy(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
      setShowCreate(false);
      setNewName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoId]);

  const toggleMembership = async (pl: PlaylistRow) => {
    if (busyIds.has(pl.playlist_id)) return;
    setBusyIds((s) => new Set(s).add(pl.playlist_id));
    const willAdd = !pl.contains;
    // Optimistic
    setPlaylists((arr) =>
      arr.map((p) => (p.playlist_id === pl.playlist_id ? { ...p, contains: willAdd } : p)),
    );
    try {
      if (willAdd) {
        const { error } = await supabase.rpc("add_to_playlist", {
          p_playlist_id: pl.playlist_id,
          p_video_id: videoId,
        });
        if (error) throw error;
        toast.success(t("addToPlaylist.addedToast"));
      } else {
        const { error } = await supabase.rpc("remove_from_playlist", {
          p_playlist_id: pl.playlist_id,
          p_video_id: videoId,
        });
        if (error) throw error;
        toast.success(t("addToPlaylist.removedToast"));
      }
      onChange?.();
    } catch (err: any) {
      // Rollback
      setPlaylists((arr) =>
        arr.map((p) => (p.playlist_id === pl.playlist_id ? { ...p, contains: pl.contains } : p)),
      );
      toast.error(err?.message || "Failed");
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(pl.playlist_id);
        return n;
      });
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error(t("addToPlaylist.minLength"));   // 공백만 입력 시 무반응이던 것
      return;
    }
    setCreating(true);
    let createdId: string | null = null;
    try {
      const { data: newId, error } = await supabase.rpc("create_playlist", {
        p_name: name,
        p_description: null,
      });
      if (error) throw error;
      createdId = newId as string;
      const { error: addErr } = await supabase.rpc("add_to_playlist", {
        p_playlist_id: createdId,
        p_video_id: videoId,
      });
      if (addErr) throw addErr;
      toast.success(t("addToPlaylist.createSuccess"));
      setNewName("");
      setShowCreate(false);
      await load();
      onChange?.();
    } catch (err: any) {
      // ★ 생성은 됐는데 담기만 실패한 경우를 구분한다. 예전엔 뭉뚱그려 "생성 실패"를 띄우고
      //   목록도 갱신 안 해, 사용자가 재시도하면 같은 이름 플레이리스트가 계속 쌓였다.
      if (createdId) {
        setNewName("");
        setShowCreate(false);
        await load();       // 방금 만든 것이 목록에 보이도록
        onChange?.();
      }
      toast.error(err?.message || t("addToPlaylist.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  // 나중에 보기는 목록에서 분리해 맨 위 고정 행으로 렌더한다(플레이리스트가 아직 없어도 항상 보이게).
  const watchLaterRow = playlists.find((p) => p.is_watch_later) || null;
  const normalPlaylists = playlists.filter((p) => !p.is_watch_later);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[151] mx-auto max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[#8b5cf6]" />
                <h3 className="font-bold text-base">{t("addToPlaylist.title")}</h3>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {videoTitle && (
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <p className="text-xs text-muted-foreground font-medium">{t("mypage.tabs.videos")}</p>
                <p className="text-sm font-bold truncate">{videoTitle}</p>
              </div>
            )}

            {/* List */}
            <div className="max-h-[50vh] overflow-y-auto">
              {loading ? (
                <div className="py-10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#8b5cf6]" />
                </div>
              ) : loadError ? (
                /* 조회 실패를 "없음"으로 보여주면 사용자가 데이터가 사라진 줄 안다 → 구분 표시 + 재시도 */
                <div className="py-8 px-5 text-center space-y-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                  <p className="text-sm text-amber-200/90">{t("addToPlaylist.fetchFailed")}</p>
                  <button
                    onClick={load}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:border-white/40"
                  >
                    {t("common.retry", "다시 시도")}
                  </button>
                </div>
              ) : (
                <div className="py-2">
                  {/* ── 나중에 보기 (고정 행) ── 플레이리스트가 하나도 없어도 항상 보인다 ── */}
                  <button
                    onClick={toggleWatchLater}
                    disabled={wlBusy}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors text-left disabled:opacity-60 border-b border-border/60"
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        watchLaterRow?.contains
                          ? "bg-gradient-to-br from-[#ec4899] to-[#f43f5e] border-transparent"
                          : "border-white/30"
                      }`}
                    >
                      {wlBusy ? (
                        <Loader2 className="w-3 h-3 animate-spin text-white" />
                      ) : watchLaterRow?.contains ? (
                        <Check className="w-3.5 h-3.5 text-white" />
                      ) : null}
                    </div>
                    <p className="text-sm font-bold flex items-center gap-1.5">
                      <Bookmark className="w-3.5 h-3.5 text-[#ec4899] fill-[#ec4899]" />
                      {t("addToPlaylist.watchLaterLabel")}
                    </p>
                  </button>

                  {normalPlaylists.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground px-5">
                      {t("addToPlaylist.empty")}
                    </div>
                  )}
                  {normalPlaylists.map((pl) => {
                    const busy = busyIds.has(pl.playlist_id);
                    return (
                      <button
                        key={pl.playlist_id}
                        onClick={() => toggleMembership(pl)}
                        disabled={busy}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors text-left disabled:opacity-60"
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            pl.contains
                              ? "bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] border-transparent"
                              : "border-white/30"
                          }`}
                        >
                          {busy ? (
                            <Loader2 className="w-3 h-3 animate-spin text-white" />
                          ) : pl.contains ? (
                            <Check className="w-3.5 h-3.5 text-white" />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold flex items-center gap-1.5">
                            {pl.is_watch_later && <Bookmark className="w-3.5 h-3.5 text-[#ec4899] fill-[#ec4899]" />}
                            {pl.name}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Create new */}
            <div className="px-5 py-4 border-t border-border bg-muted/20">
              {showCreate ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createAndAdd();
                      if (e.key === "Escape") {
                        setShowCreate(false);
                        setNewName("");
                      }
                    }}
                    placeholder={t("addToPlaylist.placeholder")}
                    className="input-base flex-1 text-sm"
                    maxLength={60}
                    disabled={creating}
                  />
                  <button
                    onClick={createAndAdd}
                    disabled={creating || !newName.trim()}
                    className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("addToPlaylist.create")}
                  </button>
                  {/* 취소 버튼 — 예전엔 ESC 로만 빠져나갈 수 있어 모바일에선 탈출 불가였다 */}
                  <button
                    onClick={() => { setShowCreate(false); setNewName(""); }}
                    disabled={creating}
                    className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:border-white/40 disabled:opacity-50"
                  >
                    {t("addToPlaylist.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-white/20 hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/5 text-sm font-bold text-white/80 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t("addToPlaylist.createNew")}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
