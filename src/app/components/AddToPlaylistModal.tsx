// ════════════════════════════════════════════════════════════════════════════
// 플레이리스트에 추가 모달 (Phase 18)
//
// 특정 영상을 본인 플레이리스트들에 추가/제거.
// 체크박스 토글 즉시 add/remove RPC 호출 (Optimistic UI).
// 하단에 "+ 새 플레이리스트 만들기" — 인라인 입력 후 자동 추가.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Check, Bookmark, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../utils/supabaseClient";

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
  const [loading, setLoading] = useState(true);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // 플레이리스트 멤버십 조회
  const load = async () => {
    if (!videoId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_playlist_memberships", {
        p_video_id: videoId,
      });
      if (error) throw error;
      setPlaylists((data as PlaylistRow[]) || []);
    } catch (err: any) {
      toast.error("플레이리스트 로드 실패: " + (err?.message || err));
    } finally {
      setLoading(false);
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
        toast.success(`"${pl.name}"에 추가됨`);
      } else {
        const { error } = await supabase.rpc("remove_from_playlist", {
          p_playlist_id: pl.playlist_id,
          p_video_id: videoId,
        });
        if (error) throw error;
        toast.success(`"${pl.name}"에서 제거됨`);
      }
      onChange?.();
    } catch (err: any) {
      // Rollback
      setPlaylists((arr) =>
        arr.map((p) => (p.playlist_id === pl.playlist_id ? { ...p, contains: pl.contains } : p)),
      );
      toast.error("실패: " + (err?.message || err));
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
    if (!name) return;
    setCreating(true);
    try {
      const { data: newId, error } = await supabase.rpc("create_playlist", {
        p_name: name,
        p_description: null,
      });
      if (error) throw error;
      const { error: addErr } = await supabase.rpc("add_to_playlist", {
        p_playlist_id: newId as string,
        p_video_id: videoId,
      });
      if (addErr) throw addErr;
      toast.success(`"${name}" 플레이리스트 만들고 영상 추가됨`);
      setNewName("");
      setShowCreate(false);
      await load();
      onChange?.();
    } catch (err: any) {
      toast.error("플레이리스트 만들기 실패: " + (err?.message || err));
    } finally {
      setCreating(false);
    }
  };

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
                <h3 className="font-bold text-base">플레이리스트에 추가</h3>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {videoTitle && (
              <div className="px-5 py-3 border-b border-border bg-muted/30">
                <p className="text-xs text-muted-foreground font-medium">영상</p>
                <p className="text-sm font-bold truncate">{videoTitle}</p>
              </div>
            )}

            {/* List */}
            <div className="max-h-[50vh] overflow-y-auto">
              {loading ? (
                <div className="py-10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#8b5cf6]" />
                </div>
              ) : playlists.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground px-5">
                  아직 만든 플레이리스트가 없습니다.<br />
                  아래에서 첫 플레이리스트를 만드세요!
                </div>
              ) : (
                <div className="py-2">
                  {playlists.map((pl) => {
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
                    placeholder="플레이리스트 이름"
                    className="input-base flex-1 text-sm"
                    maxLength={60}
                    disabled={creating}
                  />
                  <button
                    onClick={createAndAdd}
                    disabled={creating || !newName.trim()}
                    className="px-3 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "만들기"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-white/20 hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/5 text-sm font-bold text-white/80 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  새 플레이리스트 만들기
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
