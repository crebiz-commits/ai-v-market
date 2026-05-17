import { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, Loader2, Ban, Filter, AlertTriangle, RotateCcw, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

interface CommentSettingsProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "filter" | "blocked" | "review";

interface FilterWord {
  id: string;
  word: string;
  match_mode: "contains" | "word_boundary";
  created_at: string;
}

interface BlockedUser {
  blocked_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  reason: string | null;
  blocked_at: string;
}

interface FilteredComment {
  id: string;
  video_id: string;
  user_id: string;
  author_name: string;
  content: string;
  filter_reason: string;
  created_at: string;
}

export function CommentSettings({ open, onClose }: CommentSettingsProps) {
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("filter");

  const [filterWords, setFilterWords] = useState<FilterWord[]>([]);
  const [newWord, setNewWord] = useState("");
  const [newWordMode, setNewWordMode] = useState<"contains" | "word_boundary">("contains");
  const [loadingWords, setLoadingWords] = useState(false);
  const [submittingWord, setSubmittingWord] = useState(false);

  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  const [filtered, setFiltered] = useState<FilteredComment[]>([]);
  const [loadingFiltered, setLoadingFiltered] = useState(false);

  const fetchFilterWords = useCallback(async () => {
    setLoadingWords(true);
    const { data, error } = await supabase.rpc("creator_get_filter_words");
    if (error) {
      toast.error("금칙어 목록을 불러오지 못했습니다.");
      setFilterWords([]);
    } else {
      setFilterWords((data ?? []) as FilterWord[]);
    }
    setLoadingWords(false);
  }, []);

  const fetchBlocked = useCallback(async () => {
    setLoadingBlocked(true);
    const { data, error } = await supabase.rpc("creator_get_blocked_users");
    if (error) {
      toast.error("차단 목록을 불러오지 못했습니다.");
      setBlocked([]);
    } else {
      setBlocked((data ?? []) as BlockedUser[]);
    }
    setLoadingBlocked(false);
  }, []);

  const fetchFiltered = useCallback(async () => {
    setLoadingFiltered(true);
    const { data, error } = await supabase.rpc("creator_get_filtered_comments");
    if (error) {
      toast.error("자동 필터된 댓글을 불러오지 못했습니다.");
      setFiltered([]);
    } else {
      setFiltered((data ?? []) as FilteredComment[]);
    }
    setLoadingFiltered(false);
  }, []);

  useEffect(() => {
    if (!open || !isAuthenticated) return;
    if (tab === "filter") fetchFilterWords();
    else if (tab === "blocked") fetchBlocked();
    else if (tab === "review") fetchFiltered();
  }, [open, tab, isAuthenticated, fetchFilterWords, fetchBlocked, fetchFiltered]);

  const handleAddWord = async () => {
    const w = newWord.trim();
    if (!w) return;
    setSubmittingWord(true);
    const { error } = await supabase.rpc("creator_add_filter_word", {
      p_word: w,
      p_match_mode: newWordMode,
    });
    setSubmittingWord(false);
    if (error) {
      toast.error("금칙어 등록에 실패했습니다.");
      return;
    }
    toast.success(`"${w}" 금칙어를 등록했습니다.`);
    setNewWord("");
    fetchFilterWords();
  };

  const handleToggleMode = async (id: string, currentMode: "contains" | "word_boundary") => {
    const nextMode = currentMode === "contains" ? "word_boundary" : "contains";
    const { error } = await supabase.rpc("creator_update_filter_word_mode", {
      p_word_id: id,
      p_match_mode: nextMode,
    });
    if (error) {
      toast.error("매칭 모드 변경에 실패했습니다.");
      return;
    }
    fetchFilterWords();
  };

  const handleRemoveWord = async (id: string, word: string) => {
    if (!confirm(`"${word}" 금칙어를 제거할까요?\n(이미 숨겨진 댓글은 자동 복원되지 않습니다.)`)) return;
    const { error } = await supabase.rpc("creator_remove_filter_word", { p_word_id: id });
    if (error) {
      toast.error("금칙어 제거에 실패했습니다.");
      return;
    }
    toast.success("금칙어를 제거했습니다.");
    fetchFilterWords();
  };

  const handleUnblock = async (userId: string, name: string | null) => {
    if (!confirm(`${name || "이 사용자"}의 차단을 해제할까요?\n(차단으로 숨긴 댓글은 자동 복원됩니다.)`)) return;
    const { error } = await supabase.rpc("creator_unblock_user", { p_target_user_id: userId });
    if (error) {
      toast.error("차단 해제에 실패했습니다.");
      return;
    }
    toast.success("차단을 해제했습니다.");
    fetchBlocked();
  };

  const handleRestore = async (commentId: string) => {
    const { error } = await supabase.rpc("creator_restore_comment", { p_comment_id: commentId });
    if (error) {
      toast.error("복원에 실패했습니다.");
      return;
    }
    toast.success("댓글을 복원했습니다.");
    setFiltered((prev) => prev.filter((c) => c.id !== commentId));
  };

  if (!open) return null;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "filter", label: "금칙어", icon: Filter },
    { id: "blocked", label: "차단 사용자", icon: Ban },
    { id: "review", label: "자동 필터 검토", icon: AlertTriangle },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                <Filter className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-base font-bold text-white">댓글 관리</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex border-b border-white/10 flex-shrink-0 px-2 pt-2 gap-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-t-lg text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-white/5 text-white border-b-2 border-[#8b5cf6] -mb-[2px]"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
            {tab === "filter" && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  금칙어가 포함된 새 댓글은 자동으로 숨김 처리되며, 기존 댓글에도 소급 적용됩니다.
                  <br />
                  <strong className="text-gray-400">부분 일치</strong>: "바보" → "바보같다"도 차단 (한국어/일본어/중국어 권장)
                  <br />
                  <strong className="text-gray-400">단어 경계</strong>: "ass" → "class" 미차단 (영어/유럽어 권장)
                </p>

                {/* 매칭 모드 선택 */}
                <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setNewWordMode("contains")}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      newWordMode === "contains"
                        ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    부분 일치
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewWordMode("word_boundary")}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      newWordMode === "word_boundary"
                        ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    단어 경계
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddWord()}
                    placeholder="금칙어를 입력하세요..."
                    maxLength={100}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#6366f1] transition-colors"
                  />
                  <button
                    onClick={handleAddWord}
                    disabled={!newWord.trim() || submittingWord}
                    className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-bold disabled:opacity-40 transition-opacity flex items-center gap-1.5"
                  >
                    {submittingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    추가
                  </button>
                </div>

                {loadingWords ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                  </div>
                ) : filterWords.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-10">등록된 금칙어가 없습니다.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {filterWords.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm text-white"
                      >
                        <span>{w.word}</span>
                        <button
                          onClick={() => handleToggleMode(w.id, w.match_mode)}
                          title="매칭 모드 전환"
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold transition-colors ${
                            w.match_mode === "word_boundary"
                              ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                              : "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
                          }`}
                        >
                          {w.match_mode === "word_boundary" ? "경계" : "포함"}
                        </button>
                        <button
                          onClick={() => handleRemoveWord(w.id, w.word)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "blocked" && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  차단한 사용자가 작성한 댓글은 자동으로 숨겨집니다. 댓글 작성자 이름을 길게 누르거나
                  댓글 메뉴에서 직접 차단할 수 있습니다.
                </p>
                {loadingBlocked ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                  </div>
                ) : blocked.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Ban className="w-10 h-10 mx-auto mb-2 text-gray-700" />
                    <p className="text-sm">차단한 사용자가 없습니다.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blocked.map((b) => (
                      <div
                        key={b.blocked_user_id}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center overflow-hidden flex-shrink-0">
                          {b.avatar_url ? (
                            <img src={b.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white text-sm font-bold">
                              {(b.display_name || "?").charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {b.display_name || "알 수 없는 사용자"}
                          </p>
                          {b.reason && <p className="text-xs text-gray-500 truncate mt-0.5">{b.reason}</p>}
                        </div>
                        <button
                          onClick={() => handleUnblock(b.blocked_user_id, b.display_name)}
                          className="px-3 py-1.5 text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 transition-colors"
                        >
                          차단 해제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "review" && (
              <div className="space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  자동 필터로 숨김 처리된 댓글입니다. 정상 댓글이라 판단되면 복원할 수 있습니다.
                </p>
                {loadingFiltered ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Search className="w-10 h-10 mx-auto mb-2 text-gray-700" />
                    <p className="text-sm">자동 필터된 댓글이 없습니다.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((c) => (
                      <div key={c.id} className="p-3 bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold text-white truncate">{c.author_name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                              {c.filter_reason === "blocked_user" ? "차단" : "금칙어"}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRestore(c.id)}
                            className="px-2.5 py-1 text-xs font-bold text-[#6366f1] hover:text-white bg-white/5 hover:bg-[#6366f1]/30 rounded-md border border-[#6366f1]/30 transition-colors flex items-center gap-1 flex-shrink-0"
                          >
                            <RotateCcw className="w-3 h-3" />
                            복원
                          </button>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed break-words">{c.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
