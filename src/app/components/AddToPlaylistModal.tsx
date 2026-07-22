// ════════════════════════════════════════════════════════════════════════════
// 플레이리스트에 추가 모달 (Phase 18)
//
// 특정 영상을 본인 플레이리스트들에 추가/제거.
// 체크박스 토글 즉시 add/remove RPC 호출 (Optimistic UI).
// 하단에 "+ 새 플레이리스트 만들기" — 인라인 입력 후 자동 추가.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
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

  // 조회 순서 역전 방지 — 재시도 연타·영상 전환이 겹치면 늦게 도착한 옛 응답이
  //   성공 목록을 덮어 에러 화면으로 되돌리거나, 이전 영상의 체크 상태를 그린다.
  const reqSeq = useRef(0);

  // 플레이리스트 멤버십 조회
  const load = async () => {
    if (!videoId) {
      // 가드가 setLoading(true) 뒤에 있으면 스피너가 영원히 남는다(초기값 true).
      setLoading(false);
      return;
    }
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_playlist_memberships", {
        p_video_id: videoId,
      });
      if (seq !== reqSeq.current) return;   // 낡은 응답 폐기(성공 경로)
      if (error) throw error;
      setPlaylists((data as PlaylistRow[]) || []);
      setLoadError(false);
    } catch (err: any) {
      if (seq !== reqSeq.current) return;   // 낡은 응답 폐기(실패 경로 — 성공 목록 보호)
      // ★ 실패 시 반드시 비운다. 안 비우면 **이전 영상의 체크 상태**가 다음 영상 화면에 남아,
      //   사용자가 체크를 풀면 담긴 적 없는 영상에 remove 를 날리게 된다(2026-07-22 감사).
      setPlaylists([]);
      setLoadError(true);
      // 서버가 '로그인이 필요합니다' 같은 구체 사유를 RAISE 하는데 고정문구로 덮으면 원인이 가려진다.
      toast.error(err?.message || t("addToPlaylist.fetchFailed"));
    } finally {
      // 낡은 응답이 최신 요청의 스피너를 꺼버리지 않도록 여기서도 확인
      if (seq === reqSeq.current) setLoading(false);
    }
  };

  // "나중에 보기" 토글 — 이 RPC 가 watch-later 플레이리스트를 lazy create 하는 유일한 경로다.
  //   (2026-07-22 이전엔 호출부가 0건이라 기능 전체가 도달 불가였다)
  const toggleWatchLater = async () => {
    if (wlBusy || !videoId) return;
    setWlBusy(true);
    try {
      const { data, error } = await supabase.rpc("toggle_watch_later", { p_video_id: videoId });
      if (error) throw error;
      await load();   // 최초 호출이면 플레이리스트가 새로 생기므로 목록 재조회 필요
      // 토스트는 재조회까지 끝난 뒤에 — 먼저 띄우면 load 실패 시 "추가됨" 직후 화면이
      //   에러 상태로 바뀌어(고정 행 자체가 사라짐) 앞뒤가 안 맞는다.
      toast.success(data ? t("addToPlaylist.addedToast") : t("addToPlaylist.removedToast"));
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

  // 접근성 — ESC 닫기 + 포커스 트랩. 예전엔 배경 클릭으로만 닫혔고 Tab 이 모달 밖으로 샜다.
  //   ESC 는 생성 모드일 때 그 모드만 취소하고(입력창 핸들러가 처리), 두 번째 ESC 에 모달이 닫힌다.
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // ★ 생성 모드 취소를 여기서 직접 처리한다. 입력창 onKeyDown 에 위임하면
        //   포커스가 입력창을 벗어난 순간(예: 이름 입력 중 다른 행 클릭) ESC 가
        //   통째로 죽는다 — document 핸들러는 위임한다며 아무것도 안 하고,
        //   입력창 핸들러는 포커스가 없어 실행되지 않는 사각지대(2026-07-22 감사).
        if (showCreate) { setShowCreate(false); setNewName(""); }
        else onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, showCreate, onClose]);

  // 포커스 진입·복원 — 열 때 다이얼로그로 포커스를 넣지 않으면 트랩이 동작하지 않는다.
  //   트랩 로직은 activeElement 가 다이얼로그 안의 first/last 일 때만 개입하는데,
  //   마우스로 열면 포커스가 배경에 남아 조건에 아예 걸리지 않아 Tab 이 뒤 페이지를
  //   순회한다(2026-07-22 감사). 닫을 때는 열기 전 요소로 되돌린다.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled])');
      (first ?? root).focus();
    }, 0);   // 진입 애니메이션 마운트 뒤에 잡는다
    return () => {
      window.clearTimeout(id);
      prev?.focus?.();
    };
  }, [open]);

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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-to-playlist-title"
            tabIndex={-1}   /* 포커스 가능한 자식이 없을 때(로딩 중 등) 컨테이너로 포커스 진입 */
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[#8b5cf6]" />
                <h3 id="add-to-playlist-title" className="font-bold text-base">{t("addToPlaylist.title")}</h3>
              </div>
              <button onClick={onClose} aria-label={t("addToPlaylist.close")} className="p-1.5 rounded-lg hover:bg-muted">
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
                    role="checkbox"
                    aria-checked={!!watchLaterRow?.contains}
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
                        role="checkbox"
                        aria-checked={pl.contains}
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
