// ════════════════════════════════════════════════════════════════════════════
// Phase 22 — 영상 후편집 모달
// 본인 업로드 영상의 썸네일/챕터/자막을 등록 후에도 수정 가능
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { X, Loader2, Upload as UploadIcon, Plus, Trash2, Image as ImageIcon, FileText, Clock as ClockIcon, Save, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Chapter {
  title: string;
  time_seconds: number;
}

interface VideoEditModalProps {
  open: boolean;
  videoId: string;
  initialThumbnail?: string;
  initialChapters?: Chapter[];
  initialSubtitleUrl?: string | null;
  initialAgeRating?: string;
  onClose: () => void;
  onSaved?: (updates: { thumbnail?: string; chapters?: Chapter[]; subtitleUrl?: string | null; ageRating?: string }) => void;
}

const AGE_OPTIONS: { value: string; labelKey: string; color: string }[] = [
  { value: "all", labelKey: "videoEditModal.ageRatingAll", color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  { value: "13",  labelKey: "videoEditModal.ageRating13", color: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  { value: "15",  labelKey: "videoEditModal.ageRating15", color: "border-orange-500/40 bg-orange-500/10 text-orange-300" },
  { value: "19",  labelKey: "videoEditModal.ageRating19", color: "border-red-500/40 bg-red-500/10 text-red-300" },
];

// HH:MM:SS or MM:SS → seconds
function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(p => p.trim());
  if (parts.some(p => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0]; // 초만
  if (nums.length === 2) return nums[0] * 60 + nums[1]; // MM:SS
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]; // HH:MM:SS
  return null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoEditModal({
  open,
  videoId,
  initialThumbnail,
  initialChapters = [],
  initialSubtitleUrl,
  initialAgeRating = "all",
  onClose,
  onSaved,
}: VideoEditModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>(initialThumbnail || "");
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [newChapterTime, setNewChapterTime] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");

  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(initialSubtitleUrl || null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [uploadingSubtitle, setUploadingSubtitle] = useState(false);
  const [clearSubtitle, setClearSubtitle] = useState(false);

  const [ageRating, setAgeRating] = useState<string>(initialAgeRating);

  const [saving, setSaving] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  // 모달 열 때마다 초기값 리셋
  useEffect(() => {
    if (open) {
      setThumbnailPreview(initialThumbnail || "");
      setThumbnailFile(null);
      setChapters(initialChapters);
      setNewChapterTime("");
      setNewChapterTitle("");
      setSubtitleUrl(initialSubtitleUrl || null);
      setSubtitleFile(null);
      setClearSubtitle(false);
      setAgeRating(initialAgeRating || "all");
    }
  }, [open, initialThumbnail, initialSubtitleUrl, initialAgeRating]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 선택한 새 썸네일 변경 취소 (저장 전, 원본으로 복원)
  const handleResetThumbnail = () => {
    setThumbnailFile(null);
    setThumbnailPreview(initialThumbnail || "");
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
  };

  if (!open) return null;

  // 썸네일 파일 선택
  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("videoEditModal.thumbnailTooLarge"));
      return;
    }
    setThumbnailFile(file);
    const url = URL.createObjectURL(file);
    setThumbnailPreview(url);
  };

  // 자막 파일 선택
  const handleSubtitleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      toast.error(t("videoEditModal.subtitleTooLarge"));
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".vtt")) {
      toast.error(t("videoEditModal.subtitleFormatHint"));
      return;
    }
    setSubtitleFile(file);
    setClearSubtitle(false);
  };

  // 챕터 추가
  const handleAddChapter = () => {
    const seconds = parseTimeInput(newChapterTime);
    if (seconds === null) {
      toast.error(t("videoEditModal.chapterTime"));
      return;
    }
    if (!newChapterTitle.trim()) {
      toast.error(t("videoEditModal.chapterTitle"));
      return;
    }
    // 중복 시간 체크
    if (chapters.some(c => c.time_seconds === seconds)) {
      toast.error(t("videoEditModal.chapterTime"));
      return;
    }
    const next = [...chapters, { title: newChapterTitle.trim(), time_seconds: seconds }];
    next.sort((a, b) => a.time_seconds - b.time_seconds);
    setChapters(next);
    setNewChapterTime("");
    setNewChapterTitle("");
  };

  // 챕터 제거
  const handleRemoveChapter = (idx: number) => {
    setChapters(chapters.filter((_, i) => i !== idx));
  };

  // 저장 (Storage 업로드 + RPC 호출)
  const handleSave = async () => {
    if (!user?.id) {
      toast.error(t("auth.loginRequired"));
      return;
    }
    setSaving(true);

    let finalThumbnail: string | undefined;
    let finalSubtitleUrl: string | undefined;
    let willClearSubtitle = clearSubtitle;

    try {
      // 1. 썸네일 업로드 (있으면)
      if (thumbnailFile) {
        setUploadingThumbnail(true);
        const ext = thumbnailFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/${videoId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("video-thumbnails")
          .upload(path, thumbnailFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        const { data: urlData } = supabase.storage.from("video-thumbnails").getPublicUrl(path);
        finalThumbnail = urlData.publicUrl;
        setUploadingThumbnail(false);
      }

      // 2. 자막 업로드 (있으면)
      if (subtitleFile) {
        setUploadingSubtitle(true);
        const path = `${user.id}/${videoId}/subtitle.vtt`;
        const { error: upErr } = await supabase.storage
          .from("video-subtitles")
          .upload(path, subtitleFile, { upsert: true, contentType: "text/vtt" });
        if (upErr) throw new Error(upErr.message);
        const { data: urlData } = supabase.storage.from("video-subtitles").getPublicUrl(path);
        finalSubtitleUrl = urlData.publicUrl;
        willClearSubtitle = false;
        setUploadingSubtitle(false);
      }

      // 3. RPC로 메타데이터 일괄 갱신
      const { error: rpcErr } = await supabase.rpc("update_my_video_metadata", {
        p_video_id: videoId,
        p_thumbnail: finalThumbnail ?? null,
        p_chapters: chapters,
        p_subtitle_url: finalSubtitleUrl ?? null,
        p_clear_subtitle: willClearSubtitle,
        p_age_rating: ageRating,
      });
      if (rpcErr) throw rpcErr;

      toast.success(t("videoEditModal.saveSuccess"));
      onSaved?.({
        thumbnail: finalThumbnail,
        chapters,
        subtitleUrl: willClearSubtitle ? null : (finalSubtitleUrl || subtitleUrl),
        ageRating,
      });
      onClose();
    } catch (err: any) {
      console.error("[VideoEdit] save error:", err);
      toast.error(err?.message || t("videoEditModal.saveFailed"));
    } finally {
      setSaving(false);
      setUploadingThumbnail(false);
      setUploadingSubtitle(false);
    }
  };

  const hasSubtitle = !!subtitleUrl && !clearSubtitle;
  const hasNewSubtitleFile = !!subtitleFile;

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
          onClick={e => e.stopPropagation()}
          className="bg-[#111] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-base font-bold text-white">{t("videoEditModal.title")}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
            {/* 1. 썸네일 교체 */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.thumbnailHeader")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.thumbnailHint")}</p>
              <div className="flex gap-3">
                <div className="w-48 aspect-video rounded-lg overflow-hidden bg-black/30 border border-white/10 flex-shrink-0">
                  {thumbnailPreview ? (
                    <img src={thumbnailPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-700">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleThumbnailSelect}
                    className="hidden"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => thumbnailInputRef.current?.click()}
                      variant="outline"
                      className="bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 gap-2 w-fit"
                    >
                      <UploadIcon className="w-4 h-4" />
                      {t("videoEditModal.thumbnailUpload")}
                    </Button>
                    {thumbnailFile && (
                      <Button
                        onClick={handleResetThumbnail}
                        variant="outline"
                        className="bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-red-400 gap-2 w-fit"
                      >
                        <X className="w-4 h-4" />
                        {t("videoEditModal.thumbnailCancel")}
                      </Button>
                    )}
                  </div>
                  {thumbnailFile ? (
                    <p className="text-[11px] text-[#10b981]">
                      ✓ {thumbnailFile.name} ({Math.round(thumbnailFile.size / 1024)}KB)
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-600">
                      {t("videoEditModal.thumbnailHint")}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* 2. 챕터 */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.chaptersHeader")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.chaptersHint")}</p>

              {chapters.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {chapters.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-xs font-mono text-[#a78bfa] w-16 flex-shrink-0">{formatTime(c.time_seconds)}</span>
                      <span className="text-sm text-white flex-1 truncate">{c.title}</span>
                      <button
                        onClick={() => handleRemoveChapter(idx)}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                        aria-label={t("videoEditModal.chapterRemove")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newChapterTime}
                  onChange={e => setNewChapterTime(e.target.value)}
                  placeholder="0:00"
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]"
                />
                <input
                  type="text"
                  value={newChapterTitle}
                  onChange={e => setNewChapterTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddChapter()}
                  placeholder={t("videoEditModal.chapterTitle")}
                  maxLength={50}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]"
                />
                <Button
                  onClick={handleAddChapter}
                  className="bg-[#6366f1]/20 hover:bg-[#6366f1]/30 text-[#a78bfa] border border-[#6366f1]/30 gap-1"
                  variant="outline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("videoEditModal.chapterAdd")}
                </Button>
              </div>
            </section>

            {/* 3. 연령 등급 (Phase 26) */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                {t("videoEditModal.ageRatingHeader")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("productDetail.ageGate.description")}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {AGE_OPTIONS.map(opt => {
                  const active = ageRating === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setAgeRating(opt.value)}
                      className={`px-3 py-2.5 rounded-lg text-xs font-bold border transition-all ${
                        active
                          ? `${opt.color} ring-2 ring-offset-1 ring-offset-[#111] ring-white/30`
                          : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      {t(opt.labelKey)}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 4. 자막 */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.subtitleHeader")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.subtitleHint")} <a href="https://en.wikipedia.org/wiki/WebVTT" target="_blank" rel="noopener" className="text-[#a78bfa] hover:underline">WebVTT?</a></p>

              {hasSubtitle && !hasNewSubtitleFile && (
                <div className="flex items-center gap-2 p-2 bg-[#10b981]/10 border border-[#10b981]/20 rounded-lg mb-2">
                  <FileText className="w-4 h-4 text-[#10b981]" />
                  <span className="text-xs text-[#10b981] flex-1 truncate">{t("videoEditModal.subtitleCurrent")}</span>
                  <button
                    onClick={() => setClearSubtitle(true)}
                    className="text-xs text-gray-400 hover:text-red-400 underline"
                  >
                    {t("videoEditModal.subtitleRemove")}
                  </button>
                </div>
              )}

              {clearSubtitle && (
                <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-300 flex-1">{t("videoEditModal.subtitleRemove")}</span>
                  <button
                    onClick={() => setClearSubtitle(false)}
                    className="text-xs text-gray-400 hover:text-white underline"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              )}

              <input
                ref={subtitleInputRef}
                type="file"
                accept=".vtt,text/vtt"
                onChange={handleSubtitleSelect}
                className="hidden"
              />
              <Button
                onClick={() => subtitleInputRef.current?.click()}
                variant="outline"
                className="bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 gap-2 w-fit"
              >
                <UploadIcon className="w-4 h-4" />
                {t("videoEditModal.subtitleUpload")}
              </Button>
              {subtitleFile && (
                <p className="text-[11px] text-[#10b981] mt-2">
                  ✓ {subtitleFile.name} ({Math.round(subtitleFile.size / 1024)}KB)
                </p>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10 flex-shrink-0 bg-[#0a0a0a]">
            <Button
              onClick={onClose}
              variant="outline"
              className="bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
              disabled={saving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white font-bold gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {uploadingThumbnail || uploadingSubtitle || saving ? t("videoEditModal.saving") : t("videoEditModal.save")}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
