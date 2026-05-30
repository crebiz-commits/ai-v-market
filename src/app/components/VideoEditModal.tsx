// ════════════════════════════════════════════════════════════════════════════
// Phase 22 — 영상 후편집 모달
// 본인 업로드 영상의 썸네일/챕터/자막을 등록 후에도 수정 가능
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo } from "react";
import { X, Loader2, Upload as UploadIcon, Plus, Trash2, Image as ImageIcon, FileText, Clock as ClockIcon, Save, AlertCircle, Sparkles, Film, Tag as TagIcon, Briefcase } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getCategoryLabel, getGenreLabel, getAiToolLabel, getLanguageLabel } from "../i18n/categoryLabels";

// Upload.tsx와 동일한 선택지 (Phase 33 — 편집 모달에서도 동일 옵션 제공)
const CATEGORIES = ["영화", "드라마", "애니메이션", "다큐멘터리", "뮤직비디오", "기타"];
const GENRES = ["SF", "액션", "로맨스", "공포", "판타지", "스릴러", "드라마", "코미디", "자연·풍경", "추상", "기타"];
const AI_TOOLS = [
  "Sora", "Runway Gen-3", "Runway Gen-2", "Pika Labs", "Luma Dream Machine", "Kling AI",
  "Seedance 2.0", "Veo 2", "Veo 3", "Hailuo AI", "Wan 2.1", "Hunyuan Video",
  "Mochi 1", "LTX Studio", "Hedra", "Higgsfield", "Pixverse", "기타"
];
const RESOLUTIONS = ["720p", "1080p", "4K", "8K"];
const LANGUAGES = ["한국어", "영어", "일본어", "중국어", "스페인어", "프랑스어", "독일어", "무음/instrumental", "기타"];

interface Chapter {
  title: string;
  time_seconds: number;
}

interface ExtendedInitial {
  title?: string;
  description?: string;
  category?: string;
  genre?: string;
  director?: string;
  writer?: string;
  composer?: string;
  castCredits?: string;
  productionYear?: number;
  language?: string;
  subtitleLanguage?: string;
  aiTool?: string;
  aiModelVersion?: string;
  prompt?: string;
  seed?: string;
  resolution?: string;
  tags?: string[];
  sponsorBrand?: string | null;
  sponsorLogoUrl?: string | null;
  sponsorDisclosure?: string | null;
  sponsorLinkUrl?: string | null;
}

interface VideoEditModalProps {
  open: boolean;
  videoId: string;
  initialThumbnail?: string;
  initialChapters?: Chapter[];
  initialSubtitleUrl?: string | null;
  initialAgeRating?: string;
  initialExtended?: ExtendedInitial;   // Phase 33
  onClose: () => void;
  onSaved?: (updates: {
    thumbnail?: string;
    chapters?: Chapter[];
    subtitleUrl?: string | null;
    ageRating?: string;
    extended?: ExtendedInitial;   // Phase 33
  }) => void;
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
  initialExtended,
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

  // Phase 33 — 확장 필드 (모두 문자열, productionYear만 number)
  const [title, setTitle] = useState<string>(initialExtended?.title || "");
  const [description, setDescription] = useState<string>(initialExtended?.description || "");
  const [category, setCategory] = useState<string>(initialExtended?.category || "");
  const [genre, setGenre] = useState<string>(initialExtended?.genre || "");
  const [director, setDirector] = useState<string>(initialExtended?.director || "");
  const [writer, setWriter] = useState<string>(initialExtended?.writer || "");
  const [composer, setComposer] = useState<string>(initialExtended?.composer || "");
  const [castCredits, setCastCredits] = useState<string>(initialExtended?.castCredits || "");
  const [productionYear, setProductionYear] = useState<string>(
    initialExtended?.productionYear ? String(initialExtended.productionYear) : ""
  );
  const [language, setLanguage] = useState<string>(initialExtended?.language || "");
  const [subtitleLanguage, setSubtitleLanguage] = useState<string>(initialExtended?.subtitleLanguage || "");
  const [aiTool, setAiTool] = useState<string>(initialExtended?.aiTool || "");
  const [aiModelVersion, setAiModelVersion] = useState<string>(initialExtended?.aiModelVersion || "");
  const [prompt, setPrompt] = useState<string>(initialExtended?.prompt || "");
  const [seed, setSeed] = useState<string>(initialExtended?.seed || "");
  const [resolution, setResolution] = useState<string>(initialExtended?.resolution || "");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [tagsList, setTagsList] = useState<string[]>(initialExtended?.tags || []);
  const [sponsorBrand, setSponsorBrand] = useState<string>(initialExtended?.sponsorBrand || "");
  const [sponsorLogoUrl, setSponsorLogoUrl] = useState<string>(initialExtended?.sponsorLogoUrl || "");
  const [sponsorDisclosure, setSponsorDisclosure] = useState<string>(initialExtended?.sponsorDisclosure || "유료 광고 포함");
  const [sponsorLinkUrl, setSponsorLinkUrl] = useState<string>(initialExtended?.sponsorLinkUrl || "");
  const [clearSponsor, setClearSponsor] = useState(false);

  const [saving, setSaving] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  const initialExtKey = useMemo(
    () => JSON.stringify(initialExtended || {}),
    [initialExtended]
  );

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
      // Phase 33 확장 필드 리셋
      setTitle(initialExtended?.title || "");
      setDescription(initialExtended?.description || "");
      setCategory(initialExtended?.category || "");
      setGenre(initialExtended?.genre || "");
      setDirector(initialExtended?.director || "");
      setWriter(initialExtended?.writer || "");
      setComposer(initialExtended?.composer || "");
      setCastCredits(initialExtended?.castCredits || "");
      setProductionYear(initialExtended?.productionYear ? String(initialExtended.productionYear) : "");
      setLanguage(initialExtended?.language || "");
      setSubtitleLanguage(initialExtended?.subtitleLanguage || "");
      setAiTool(initialExtended?.aiTool || "");
      setAiModelVersion(initialExtended?.aiModelVersion || "");
      setPrompt(initialExtended?.prompt || "");
      setSeed(initialExtended?.seed || "");
      setResolution(initialExtended?.resolution || "");
      setTagsList(initialExtended?.tags || []);
      setTagsInput("");
      setSponsorBrand(initialExtended?.sponsorBrand || "");
      setSponsorLogoUrl(initialExtended?.sponsorLogoUrl || "");
      setSponsorDisclosure(initialExtended?.sponsorDisclosure || "유료 광고 포함");
      setSponsorLinkUrl(initialExtended?.sponsorLinkUrl || "");
      setClearSponsor(false);
    }
  }, [open, initialThumbnail, initialSubtitleUrl, initialAgeRating, initialExtKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 태그 추가
  const addTag = (raw: string) => {
    const trimmed = raw.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (tagsList.includes(trimmed)) {
      toast.info(t("upload.tagsDuplicate", "이미 추가된 태그입니다"));
      return;
    }
    if (tagsList.length >= 10) {
      toast.info(t("upload.tagsMaxReached", "태그는 최대 10개"));
      return;
    }
    setTagsList([...tagsList, trimmed]);
  };
  const removeTag = (idx: number) => setTagsList(tagsList.filter((_, i) => i !== idx));

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

      // 3. RPC로 메타데이터 일괄 갱신 (Phase 33 — 확장 필드 포함)
      const yearNum = productionYear.trim() ? parseInt(productionYear.trim(), 10) : null;
      if (productionYear.trim() && (isNaN(yearNum as number) || (yearNum as number) < 1900 || (yearNum as number) > 2100)) {
        toast.error(t("videoEditModal.productionYearInvalid", "제작 연도는 1900~2100 사이여야 합니다"));
        setSaving(false);
        return;
      }
      if (title !== "" && title.trim() === "") {
        toast.error(t("videoEditModal.titleRequired", "제목은 비울 수 없습니다"));
        setSaving(false);
        return;
      }
      const { error: rpcErr } = await supabase.rpc("update_my_video_metadata", {
        p_video_id: videoId,
        p_thumbnail: finalThumbnail ?? null,
        p_chapters: chapters,
        p_subtitle_url: finalSubtitleUrl ?? null,
        p_clear_subtitle: willClearSubtitle,
        p_age_rating: ageRating,
        // Phase 33 — 빈 문자열은 null 로 변환 (RPC COALESCE 패턴이라 null=변경없음, ''=공란저장이면 안 됨)
        // 사용자가 명시적으로 비웠을 때만 ''로 갱신 → trim 후 빈문자열이면 ''  유지, 아니면 trim 값
        p_title:            title.trim() || null,
        p_description:      description,
        p_category:         category || null,
        p_genre:            genre || null,
        p_director:         director,
        p_writer:           writer,
        p_composer:         composer,
        p_cast_credits:     castCredits,
        p_production_year:  yearNum,
        p_language:         language,
        p_subtitle_language: subtitleLanguage,
        p_ai_tool:          aiTool || null,
        p_ai_model_version: aiModelVersion,
        p_prompt:           prompt,
        p_seed:             seed,
        p_resolution:       resolution || null,
        p_tags:             tagsList,
        p_sponsor_brand:    sponsorBrand,
        p_sponsor_logo_url: sponsorLogoUrl,
        p_sponsor_disclosure: sponsorDisclosure,
        p_sponsor_link_url: sponsorLinkUrl,
        p_clear_sponsor:    clearSponsor,
      });
      if (rpcErr) throw rpcErr;

      toast.success(t("videoEditModal.saveSuccess"));
      onSaved?.({
        thumbnail: finalThumbnail,
        chapters,
        subtitleUrl: willClearSubtitle ? null : (finalSubtitleUrl || subtitleUrl),
        ageRating,
        extended: {
          title: title.trim(),
          description,
          category,
          genre,
          director, writer, composer, castCredits,
          productionYear: yearNum ?? undefined,
          language, subtitleLanguage,
          aiTool, aiModelVersion, prompt, seed, resolution,
          tags: tagsList,
          sponsorBrand: clearSponsor ? null : (sponsorBrand || null),
          sponsorLogoUrl: clearSponsor ? null : (sponsorLogoUrl || null),
          sponsorDisclosure: clearSponsor ? null : (sponsorDisclosure || null),
          sponsorLinkUrl: clearSponsor ? null : (sponsorLinkUrl || null),
        },
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

            {/* 1.5. 기본 정보 (Phase 33) */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.basicInfoHeader", "기본 정보")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.basicInfoHint", "제목·줄거리를 수정합니다")}</p>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">{t("upload.titleLabel", "제목")}</label>
                    <span className={`text-[10px] ${title.length > 50 ? "text-amber-400" : "text-gray-600"}`}>{title.length}/60</span>
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    maxLength={60}
                    placeholder={t("upload.titlePlaceholder", "영상 제목")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-gray-400">{t("upload.descriptionLabel", "줄거리")}</label>
                    <span className={`text-[10px] ${description.length > 450 ? "text-amber-400" : "text-gray-600"}`}>{description.length}/500</span>
                  </div>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder={t("upload.descriptionPlaceholder", "영상 줄거리·소개")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1] resize-y"
                  />
                </div>
              </div>
            </section>

            {/* 1.7. 카테고리·장르·언어 (Phase 33) */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Film className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.categoryHeader", "카테고리·언어")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.categoryHint", "카테고리 변경은 시네마/OTT 노출 위치에 영향")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.categoryLabel", "카테고리")}</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#6366f1]"
                  >
                    <option value="">—</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{getCategoryLabel(c, t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.genreLabel", "장르")}</label>
                  <select
                    value={genre}
                    onChange={e => setGenre(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#6366f1]"
                  >
                    <option value="">—</option>
                    {GENRES.map(g => <option key={g} value={g}>{getGenreLabel(g, t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.languageLabel", "음성 언어")}</label>
                  <select
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#6366f1]"
                  >
                    <option value="">—</option>
                    {LANGUAGES.map(l => <option key={l} value={l}>{getLanguageLabel(l, t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.subtitleLanguageLabel", "자막 언어")}</label>
                  <input
                    type="text"
                    value={subtitleLanguage}
                    onChange={e => setSubtitleLanguage(e.target.value)}
                    placeholder={t("upload.subtitleLanguagePlaceholder", "예: 한국어,영어")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]"
                  />
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

            {/* 5. 시네마 크레딧 (Phase 33) */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Film className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.creditsHeader", "시네마 크레딧")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.creditsHint", "감독·작가·작곡·출연진·제작 연도")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.directorLabel", "감독")}</label>
                  <input type="text" value={director} onChange={e => setDirector(e.target.value)} placeholder={t("upload.directorPlaceholder", "감독 이름")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.writerLabel", "각본")}</label>
                  <input type="text" value={writer} onChange={e => setWriter(e.target.value)} placeholder={t("upload.writerPlaceholder", "각본가")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.composerLabel", "음악")}</label>
                  <input type="text" value={composer} onChange={e => setComposer(e.target.value)} placeholder={t("upload.composerPlaceholder", "작곡가")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.productionYearLabel", "제작 연도")}</label>
                  <input type="number" min="1900" max="2100" value={productionYear} onChange={e => setProductionYear(e.target.value)} placeholder="2026"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.castLabel", "출연")}</label>
                  <input type="text" value={castCredits} onChange={e => setCastCredits(e.target.value)} placeholder={t("upload.castPlaceholder", "주연 · 조연 (콤마 구분)")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
              </div>
            </section>

            {/* 6. AI 제작 정보 (Phase 33) */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.aiHeader", "AI 제작 정보")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.aiHint", "AI 영상 진정성 검증용 — 도구·모델·프롬프트·시드")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.aiToolLabel", "AI 도구")}</label>
                  <select value={aiTool} onChange={e => setAiTool(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#6366f1]">
                    <option value="">—</option>
                    {AI_TOOLS.map(a => <option key={a} value={a}>{getAiToolLabel(a, t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.aiModelVersionLabel", "모델 버전")}</label>
                  <input type="text" value={aiModelVersion} onChange={e => setAiModelVersion(e.target.value)} placeholder="Sora v2.1"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.resolutionLabel", "해상도")}</label>
                  <select value={resolution} onChange={e => setResolution(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#6366f1]">
                    <option value="">—</option>
                    {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.seedLabel", "시드값")}</label>
                  <input type="text" value={seed} onChange={e => setSeed(e.target.value)} placeholder="8842751093"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.promptLabel", "프롬프트")}</label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder={t("upload.promptPlaceholder", "AI 생성 프롬프트 전문")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1] resize-y" />
                </div>
              </div>
            </section>

            {/* 7. 태그 (Phase 33) */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-[#8b5cf6]" />
                {t("videoEditModal.tagsHeader", "태그")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.tagsHint", "검색·발견용 태그 (최대 10개)")} <span className="text-gray-600">{tagsList.length}/10</span></p>
              <div className="flex flex-wrap gap-2 mb-2">
                {tagsList.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-[#6366f1]/15 border border-[#6366f1]/30 rounded-full text-xs text-[#a78bfa]">
                    #{tag}
                    <button onClick={() => removeTag(i)} className="text-[#a78bfa] hover:text-red-400" aria-label="remove">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      if (tagsInput.trim()) { addTag(tagsInput); setTagsInput(""); }
                    } else if (e.key === "Backspace" && tagsInput === "" && tagsList.length > 0) {
                      removeTag(tagsList.length - 1);
                    }
                  }}
                  placeholder={t("upload.tagsPlaceholder", "태그 입력 후 Enter")}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]"
                />
                <Button
                  onClick={() => { if (tagsInput.trim()) { addTag(tagsInput); setTagsInput(""); } }}
                  variant="outline"
                  className="bg-[#6366f1]/20 hover:bg-[#6366f1]/30 text-[#a78bfa] border border-[#6366f1]/30 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("common.add", "추가")}
                </Button>
              </div>
            </section>

            {/* 8. 협찬 (Phase 33) */}
            <section>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-amber-400" />
                {t("videoEditModal.sponsorHeader", "협찬·PPL")}
              </h3>
              <p className="text-xs text-gray-500 mb-3">{t("videoEditModal.sponsorHint", "유료 광고가 포함된 경우 반드시 입력 (법적 고지 의무)")}</p>
              {clearSponsor && (
                <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs text-amber-300 flex-1">{t("videoEditModal.sponsorWillClear", "저장 시 협찬 정보가 모두 제거됩니다")}</span>
                  <button onClick={() => setClearSponsor(false)} className="text-xs text-gray-400 hover:text-white underline">
                    {t("common.cancel", "취소")}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.sponsorBrandLabel", "협찬 브랜드")}</label>
                  <input type="text" value={sponsorBrand} onChange={e => setSponsorBrand(e.target.value)} placeholder={t("upload.sponsorBrandPlaceholder", "예: ABC 화장품")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.sponsorDisclosureLabel", "고지 문구")}</label>
                  <input type="text" value={sponsorDisclosure} onChange={e => setSponsorDisclosure(e.target.value)} placeholder="유료 광고 포함"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.sponsorLogoUrlLabel", "로고 URL")}</label>
                  <input type="url" value={sponsorLogoUrl} onChange={e => setSponsorLogoUrl(e.target.value)} placeholder="https://..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">{t("upload.sponsorLinkUrlLabel", "랜딩 URL")}</label>
                  <input type="url" value={sponsorLinkUrl} onChange={e => setSponsorLinkUrl(e.target.value)} placeholder="https://..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#6366f1]" />
                </div>
              </div>
              {(sponsorBrand || sponsorLogoUrl || sponsorLinkUrl) && !clearSponsor && (
                <button
                  onClick={() => setClearSponsor(true)}
                  className="mt-2 text-xs text-gray-400 hover:text-red-400 underline"
                >
                  {t("videoEditModal.sponsorClear", "협찬 정보 모두 제거")}
                </button>
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
