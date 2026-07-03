import { useState, useEffect, useCallback } from "react";
import { UserAvatar } from "./UserAvatar";
import { X, Plus, Trash2, Loader2, Ban, Filter, AlertTriangle, RotateCcw, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      toast.error(t("commentSettings.loadFailed", "목록을 불러오지 못했어요."));
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
      toast.error(t("commentSettings.loadFailed", "목록을 불러오지 못했어요."));
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
      toast.error(t("commentSettings.loadFailed", "목록을 불러오지 못했어요."));
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
      toast.error(t("commentSettings.saveFailed", { message: "" }));
      return;
    }
    toast.success(t("commentSettings.filterAdded", { word: w, defaultValue: `'${w}' 금칙어를 추가했어요.` }));
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
      toast.error(t("commentSettings.saveFailed", { message: "" }));
      return;
    }
    fetchFilterWords();
  };

  const handleRemoveWord = async (id: string, word: string) => {
    if (!confirm(t("commentSettings.confirmRemoveWord", { word, defaultValue: `'${word}' 금칙어를 삭제할까요?` }))) return;
    const { error } = await supabase.rpc("creator_remove_filter_word", { p_word_id: id });
    if (error) {
      toast.error(t("commentSettings.deleteFailed", { message: "" }));
      return;
    }
    toast.success(t("commentSettings.filterDelete"));
    fetchFilterWords();
  };

  const handleUnblock = async (userId: string, name: string | null) => {
    if (!confirm(t("mypage.blocks.confirmUnblock", { name: name || t("mypage.blocks.thisUser") }))) return;
    const { error } = await supabase.rpc("creator_unblock_user", { p_target_user_id: userId });
    if (error) {
      toast.error(t("commentSettings.loadFailed", "목록을 불러오지 못했어요."));
      return;
    }
    toast.success(t("common.unblock"));
    fetchBlocked();
  };

  const handleRestore = async (commentId: string) => {
    const { error } = await supabase.rpc("creator_restore_comment", { p_comment_id: commentId });
    if (error) {
      toast.error(t("commentSettings.restoreFailed", { message: "" }));
      return;
    }
    toast.success(t("commentSettings.restore"));
    setFiltered((prev) => prev.filter((c) => c.id !== commentId));
  };

  if (!open) return null;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "filter", label: t("commentSettings.tabFilter"), icon: Filter },
    { id: "blocked", label: t("commentSettings.tabBlocked"), icon: Ban },
    { id: "review", label: t("commentSettings.tabHidden"), icon: AlertTriangle },
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
              <h2 className="text-base font-bold text-white">{t("commentSettings.title")}</h2>
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
                  {t("commentSettings.filterDesc")}
                  <br />
                  <strong className="text-gray-400">{t("commentSettings.modeContains")}</strong>: {t("commentSettings.containsHint")}
                  <br />
                  <strong className="text-gray-400">{t("commentSettings.modeWordBoundary")}</strong>: {t("commentSettings.wordBoundaryHint")}
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
                    {t("commentSettings.modeContains")}
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
                    {t("commentSettings.modeWordBoundary")}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddWord()}
                    placeholder={t("commentSettings.filterPlaceholder")}
                    maxLength={100}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#6366f1] transition-colors"
                  />
                  <button
                    onClick={handleAddWord}
                    disabled={!newWord.trim() || submittingWord}
                    className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-bold disabled:opacity-40 transition-opacity flex items-center gap-1.5"
                  >
                    {submittingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t("commentSettings.filterAdd")}
                  </button>
                </div>

                {loadingWords ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                  </div>
                ) : filterWords.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-10">{t("commentSettings.filterEmpty")}</p>
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
                          title={t("commentSettings.matchMode")}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold transition-colors ${
                            w.match_mode === "word_boundary"
                              ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                              : "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
                          }`}
                        >
                          {w.match_mode === "word_boundary" ? t("commentSettings.modeWordBoundary") : t("commentSettings.modeContains")}
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
                  {t("commentSettings.blockedDesc")}
                </p>
                {loadingBlocked ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                  </div>
                ) : blocked.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Ban className="w-10 h-10 mx-auto mb-2 text-gray-700" />
                    <p className="text-sm">{t("commentSettings.blockedEmpty")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blocked.map((b) => (
                      <div
                        key={b.blocked_user_id}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5"
                      >
                        <UserAvatar src={b.avatar_url} name={b.display_name} className="w-10 h-10" fallbackClassName="text-sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {b.display_name || t("mypage.blocks.unknownUser")}
                          </p>
                          {b.reason && <p className="text-xs text-gray-500 truncate mt-0.5">{b.reason}</p>}
                        </div>
                        <button
                          onClick={() => handleUnblock(b.blocked_user_id, b.display_name)}
                          className="px-3 py-1.5 text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 transition-colors"
                        >
                          {t("common.unblock")}
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
                  {t("commentSettings.hiddenDesc")}
                </p>
                {loadingFiltered ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Search className="w-10 h-10 mx-auto mb-2 text-gray-700" />
                    <p className="text-sm">{t("commentSettings.hiddenEmpty")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((c) => (
                      <div key={c.id} className="p-3 bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold text-white truncate">{c.author_name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                              {c.filter_reason === "blocked_user" ? t("common.block") : t("commentSettings.tabFilter")}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRestore(c.id)}
                            className="px-2.5 py-1 text-xs font-bold text-[#6366f1] hover:text-white bg-white/5 hover:bg-[#6366f1]/30 rounded-md border border-[#6366f1]/30 transition-colors flex items-center gap-1 flex-shrink-0"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {t("commentSettings.restore")}
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
