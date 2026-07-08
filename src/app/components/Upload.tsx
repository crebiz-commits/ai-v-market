import { useState, useRef, useMemo, useEffect } from "react";
import { Upload as UploadIcon, Video, FileText, CheckCircle2, Loader2, X, ImagePlus, Lock, Coins, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { motion } from "motion/react";
import { BunnySetupGuide } from "./BunnySetupGuide";
import { Footer } from "./Footer";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { supabase, supabaseAnonKey, supabaseUrl } from "../utils/supabaseClient";
import { tusUploadToBunny, type BunnyTusAuth } from "../utils/bunnyUpload";
import { isNegotiationOnly } from "../utils/licensePricing";
import { toast } from "sonner";
import { useTranslation, Trans } from "react-i18next";
import { getCategoryLabel, getGenreLabel, getAiToolLabel, getLanguageLabel } from "../i18n/categoryLabels";
import { GENRES } from "../data/genres";  // 장르 단일 출처 (업로드/시네마/OTT 공유)

// 카테고리·장르·AI툴 — 사이트 전체 (Upload/Cinema/Ott/SearchPage) 통일 (2026-05-27)
// 카테고리 = 콘텐츠 형식 (6종) / 장르 = 작품 분위기·테마 (11종)
const aiTools = [
  "Sora", "Runway Gen-3", "Runway Gen-2", "Pika Labs", "Luma Dream Machine", "Kling AI",
  "Seedance 2.0", "Veo 2", "Veo 3", "Hailuo AI", "Wan 2.1", "Hunyuan Video",
  "Mochi 1", "LTX Studio", "Hedra", "Higgsfield", "Pixverse", "기타"
];
const categories = ["영화", "드라마", "애니메이션", "다큐멘터리", "뮤직비디오", "기타"];
const genres = GENRES;  // 시네마/OTT 행과 동일 목록·순서
const resolutions = ["720p", "1080p", "4K", "8K"];
const languages = ["한국어", "영어", "일본어", "중국어", "스페인어", "프랑스어", "독일어", "무음/instrumental", "기타"];

interface UploadProps {
  onSignInClick?: () => void;
  onViewMyProducts?: () => void;
  onNavigate?: (tab: string) => void;
  challengeContext?: { tag: string; title: string } | null;  // 챌린지 참가로 진입 시 — 출품작 태그 자동 부착
  onChallengeContextConsumed?: () => void;
}

export function Upload({ onSignInClick, onViewMyProducts, onNavigate, challengeContext, onChallengeContextConsumed }: UploadProps) {
  const { t } = useTranslation();
  const { user, profile, accessToken, signInWithGoogle, signInWithKakao } = useAuth();
  const settings = useSettings();
  const [step, setStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [bunnyVideoId, setBunnyVideoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [forceUpdate, setForceUpdate] = useState(0); // 강제 리렌더링용
  // 챌린지 참가로 진입한 경우 — 출품작 태그를 제출 시 자동 부착 (가시 태그칩은 건드리지 않음)
  const [activeChallenge, setActiveChallenge] = useState<{ tag: string; title: string } | null>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    genre: "",
    ageRating: "" as "" | "all" | "13" | "15",  // 등급 — 필수 입력. UI 최대 15+(19 제거, 광고정책). DB CHECK엔 19도 있으나 미사용
    aiTool: "",
    aiModelVersion: "", // 모델 버전 (예: "Sora v2.1")
    resolution: "",
    duration: "",
    prompt: "",
    seed: "", // AI 시드값 (재현용)
    creativityDescription: "",
    // 시네마 메타데이터
    director: "",
    writer: "",
    composer: "",
    cast: "",
    productionYear: "",
    language: "",
    subtitleLanguage: "",
    // 공개 설정
    visibility: "public" as "public" | "unlisted" | "private",
    // 라이선스/출처 (어드민 시드 콘텐츠 전용 — is_admin 일 때만 노출)
    licenseType: "original" as "original" | "cc0" | "cc-by" | "cc-by-sa" | "public-domain",
    licenseSourceUrl: "",
    attribution: "",
    originalCreator: "",
    // 가격 (All-in-One 단일가)
    standardPrice: "",
    tags: "",
    // Phase 28: Sponsorship (협찬 정보)
    sponsorBrand: "",
    sponsorLogoUrl: "",
    sponsorDisclosure: "유료 광고 포함",
    sponsorLinkUrl: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [showBunnyGuide, setShowBunnyGuide] = useState(false);

  // 시리즈(연속물) — 업로드 영상을 시리즈에 연결 (선택)
  const [seriesList, setSeriesList] = useState<{ id: string; title: string; episode_count: number }[]>([]);
  const [seriesId, setSeriesId] = useState("");          // "" = 단일영상, "__new__" = 새 시리즈
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("1");
  const [episodeNumber, setEpisodeNumber] = useState("");
  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_my_series").then(
      ({ data }) => { if (data) setSeriesList(data as any); },
      () => {},
    );
  }, [user]);

  // 챌린지 참가로 진입 시 컨텍스트 1회 캡처 후 부모 신호 소거
  useEffect(() => {
    if (challengeContext) {
      setActiveChallenge(challengeContext);
      onChallengeContextConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeContext]);

  // 업로드 진행률 상세 통계 (속도, 남은 시간 등)
  const [uploadStats, setUploadStats] = useState<{ loaded: number; total: number; speed: number; eta: number }>({
    loaded: 0, total: 0, speed: 0, eta: 0,
  });

  // 썸네일 선택 (자동 추출 프레임 + 커스텀 업로드)
  // 동일한 프레임이 여러 개일 때 모두 선택되는 버그 방지를 위해 index 기반으로 선택 추적
  const [thumbnailOptions, setThumbnailOptions] = useState<string[]>([]);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null);
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<number>(-1);
  const [customThumbnail, setCustomThumbnail] = useState<string | null>(null);
  const customThumbInputRef = useRef<HTMLInputElement>(null);

  // 자막 파일(.vtt) — 소프트섭(시청자 on/off 가능)
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const subtitleFileRef = useRef<HTMLInputElement>(null);

  // 태그 칩(Pill) 입력
  const [tagInput, setTagInput] = useState("");

  // 드래프트 자동저장 — 초기 로드 완료 플래그
  const [draftLoaded, setDraftLoaded] = useState(false);

  // 하이라이트 구간 (홈 피드/큐레이션 노출용 10~30초)
  const [videoDurationSec, setVideoDurationSec] = useState(0);
  const [highlight, setHighlight] = useState<{ start: number; end: number }>({ start: 0, end: 30 });
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fileObjectUrlRef = useRef<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);  // 업로드 중 언마운트/취소 시 TUS 전송 중단
  useEffect(() => () => uploadAbortRef.current?.abort(), []);

  // 미리보기 모달 (게시 전 확인)
  const [showPreview, setShowPreview] = useState(false);

  // 태그 리스트 (formData.tags를 split)
  const tagsList = useMemo(
    () => (formData.tags ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean) : []),
    [formData.tags]
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (tagsList.includes(trimmed)) {
      toast.info(t("upload.toast.alreadyTag"));
      return;
    }
    if (tagsList.length >= 10) {
      toast.warning(t("upload.toast.maxTagsReached"));
      return;
    }
    setFormData((prev) => ({ ...prev, tags: [...tagsList, trimmed].join(",") }));
    setTagInput("");
  };

  const removeTag = (idx: number) => {
    const next = tagsList.filter((_, i) => i !== idx);
    setFormData((prev) => ({ ...prev, tags: next.join(",") }));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && tagInput === "" && tagsList.length > 0) {
      removeTag(tagsList.length - 1);
    }
  };

  // 드래프트 키 (사용자별)
  const draftKey = user ? `creaite_upload_draft_${user.id}` : null;

  // 드래프트 로드 (마운트 시 1회)
  useEffect(() => {
    if (!user || !draftKey || draftLoaded) return;

    const saved = localStorage.getItem(draftKey);
    if (!saved) {
      setDraftLoaded(true);
      return;
    }

    try {
      const draft = JSON.parse(saved);
      // 빈 드래프트는 무시
      const hasContent =
        draft.formData?.title || draft.formData?.description || draft.formData?.tags ||
        draft.formData?.standardPrice;
      if (!hasContent) {
        setDraftLoaded(true);
        return;
      }

      toast.info(t("upload.draftFoundTitle"), {
        description: t("upload.draftFoundDesc", { time: new Date(draft.savedAt).toLocaleString() }),
        action: {
          label: t("upload.draftContinue"),
          onClick: () => {
            setStep(draft.step || 1);
            if (draft.formData) setFormData((prev) => ({ ...prev, ...draft.formData }));
            setAgreedToTerms(!!draft.agreedToTerms);
          },
        },
        duration: 12000,
      });
    } catch (e) {
      console.warn("Failed to load draft:", e);
    }
    setDraftLoaded(true);
  }, [user, draftKey, draftLoaded]);

  // 드래프트 자동 저장 (변경 시)
  useEffect(() => {
    if (!user || !draftKey || !draftLoaded || uploadComplete) return;

    const draft = {
      step,
      formData,
      agreedToTerms,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (e) {
      console.warn("Draft save failed (storage limit?):", e);
    }
  }, [step, formData, agreedToTerms, user, draftKey, draftLoaded, uploadComplete]);

  // 업로드 완료 시 드래프트 삭제
  useEffect(() => {
    if (uploadComplete && draftKey) {
      localStorage.removeItem(draftKey);
    }
  }, [uploadComplete, draftKey]);

  // 진입(마운트)·단계 전환 시 스크롤을 항상 상단으로 — 탭 전환 시 이전 스크롤 위치가
  // 남아 하단에서 시작되던 문제 방지. (자체 스크롤 컨테이너 + 윈도우 둘 다 리셋)
  useEffect(() => {
    scrollRootRef.current?.scrollTo({ top: 0 });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [step]);

  // 사이즈/시간 포맷터
  const formatBytes = (bytes: number): string => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds) || seconds < 0) return t("upload.toast.calculating");
    if (seconds < 60) return t("upload.toast.secondsShort", { n: Math.round(seconds) });
    if (seconds < 3600) return t("upload.toast.minutesSeconds", { m: Math.floor(seconds / 60), s: Math.round(seconds % 60) });
    return t("upload.toast.hoursMinutes", { h: Math.floor(seconds / 3600), m: Math.floor((seconds % 3600) / 60) });
  };

  // 영상 타임스탬프 (mm:ss.s) — 하이라이트 구간 표시용
  const formatSeconds = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  };

  // 파일 선택 핸들러 — 메타데이터 측정 + 썸네일 후보 프레임 3개 자동 추출
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 형식 검증 (MIME + 확장자 체크)
    const validMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.mp4', '.mov', '.avi'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!validMimeTypes.includes(file.type) && !hasValidExtension) {
      toast.error(t("upload.toast.unsupportedFile"));
      return;
    }

    // 파일 크기 검증 (5GB)
    const maxSize = 5 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(t("upload.toast.fileTooLarge"));
      return;
    }

    setSelectedFile(file);
    // 새 파일 선택 시 이전 썸네일·하이라이트 초기화
    setThumbnailOptions([]);
    setSelectedThumbnail(null);
    setSelectedThumbnailIndex(-1);
    setCustomThumbnail(null);
    setVideoDurationSec(0);

    // 이전 ObjectURL 정리 (미리보기 비디오용으로 유지하던 URL)
    if (fileObjectUrlRef.current) {
      URL.revokeObjectURL(fileObjectUrlRef.current);
      fileObjectUrlRef.current = null;
    }

    // 영상 정보 자동 측정 + 프레임 캡처
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    (video as any).playsInline = true;
    video.crossOrigin = 'anonymous';

    // 미리보기 비디오용 ObjectURL 별도 생성·유지 (하이라이트 UI에서 사용)
    fileObjectUrlRef.current = URL.createObjectURL(file);

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanupTimeout = setTimeout(() => {
      if (video.src) {
        URL.revokeObjectURL(objectUrl);
        video.src = '';
      }
    }, 30000); // 프레임 캡처용으로 timeout 연장

    video.onloadedmetadata = async () => {
      // 1. 길이 측정
      const duration = video.duration;

      // [콘텐츠 정책 v2] 영상 길이 검증 — 30초 미만 차단
      const minUpload = settings.minUploadSeconds || 30;
      if (duration < minUpload) {
        toast.error(t("upload.tooShort", { sec: minUpload, current: Math.floor(duration) }));
        setSelectedFile(null);
        if (fileObjectUrlRef.current) {
          URL.revokeObjectURL(fileObjectUrlRef.current);
          fileObjectUrlRef.current = null;
        }
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      // 2. 해상도 측정
      const height = video.videoHeight;
      let resolution = '';
      if (height >= 4320) resolution = '8K';
      else if (height >= 2160) resolution = '4K';
      else if (height >= 1080) resolution = '1080p';
      else if (height >= 720) resolution = '720p';
      else resolution = '1080p';

      setFormData(prev => ({ ...prev, duration: formattedDuration, resolution }));
      setForceUpdate(prev => prev + 1);
      toast.success(t("upload.toast.videoInfo", { resolution, duration: formattedDuration }));

      // 2.5. 하이라이트 기본 구간 설정 (영상 중간 15초)
      setVideoDurationSec(duration);
      if (duration <= 30) {
        // 30초 미만 영상은 전체를 하이라이트로 (처음부터 전체 재생)
        setHighlight({ start: 0, end: duration });
      } else {
        const defaultStart = Math.max(0, duration * 0.4);
        const defaultEnd = Math.min(duration, defaultStart + 30);
        setHighlight({ start: defaultStart, end: defaultEnd });
      }

      // 3. 프레임 캡처 (10%, 50%, 90% 지점)
      const timestamps = [duration * 0.1, duration * 0.5, duration * 0.9];
      const frames: string[] = [];

      for (const ts of timestamps) {
        try {
          const frame = await new Promise<string>((resolve, reject) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 1280;
                canvas.height = video.videoHeight || 720;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Canvas context unavailable'));
                ctx.drawImage(video, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
              } catch (err) {
                reject(err);
              }
            };
            video.addEventListener('seeked', onSeeked, { once: true });
            video.currentTime = ts;
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              reject(new Error('Frame capture timeout'));
            }, 5000);
          });
          frames.push(frame);
        } catch (err) {
          console.warn('Frame capture failed at', ts, err);
        }
      }

      if (frames.length > 0) {
        setThumbnailOptions(frames);
        // 기본 선택: 중간 프레임 (인덱스 기반)
        const defaultIdx = Math.floor(frames.length / 2);
        setSelectedThumbnail(frames[defaultIdx]);
        setSelectedThumbnailIndex(defaultIdx);
      }

      clearTimeout(cleanupTimeout);
      URL.revokeObjectURL(objectUrl);
    };

    video.onerror = () => {
      clearTimeout(cleanupTimeout);
      URL.revokeObjectURL(objectUrl);
      toast.warning(t("upload.toast.videoInfoFailed"));
    };
  };

  // 커스텀 썸네일 업로드
  const handleCustomThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t("upload.toast.imageOnly"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("upload.toast.thumbnailTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setCustomThumbnail(url);
      setSelectedThumbnail(url);
      // 커스텀 선택 시 프레임 인덱스 해제
      setSelectedThumbnailIndex(-1);
    };
    reader.readAsDataURL(file);
  };

  if (!user) {
    // 무마찰 온보딩: 죽은 로그인 벽 대신 "가치 판매형" 화면 — 수익 구조를 보여주고
    // 원클릭 소셜 로그인으로 바로 시작 (클릭 수 최소화). 가입 후 즉시 업로드 가능.
    const socialStart = async (provider: "google" | "kakao") => {
      try {
        if (provider === "google") await signInWithGoogle();
        else await signInWithKakao();
      } catch (e: any) {
        toast.error(e?.message || t("auth.loginFail"));
      }
    };
    const gateRev = [
      { pct: "80%", label: t("upload.gateRevLicense"), color: "text-[#c4b5fd]" },
      { pct: "50~60%", label: t("upload.gateRevAd"), color: "text-[#f9a8d4]" },
      { pct: "50%", label: t("upload.gateRevPool"), color: "text-[#fcd34d]" },
    ];
    return (
      <div className="h-full overflow-y-auto bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] mx-auto mb-5 flex items-center justify-center shadow-[0_10px_40px_-10px_rgba(99,102,241,0.6)]">
                <UploadIcon className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{t("upload.gateTitle")}</h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {t("upload.gateSubtitle")}
              </p>
            </div>

            {/* 3대 수익원 미니 카드 */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              {gateRev.map((r) => (
                <div
                  key={r.label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center"
                >
                  <div className={`text-xl font-black ${r.color}`}>{r.pct}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{r.label}</div>
                </div>
              ))}
            </div>

            {/* 원클릭 시작 */}
            <div className="space-y-2.5">
              <Button
                onClick={() => socialStart("google")}
                className="w-full bg-white text-gray-900 hover:bg-gray-100 py-6 text-base font-semibold"
              >
                {t("auth.continueWithGoogle")}
              </Button>
              <Button
                onClick={() => socialStart("kakao")}
                className="w-full bg-[#FEE500] text-[#191600] hover:bg-[#f5dd00] py-6 text-base font-semibold"
              >
                {t("auth.continueWithKakao")}
              </Button>
              <Button
                onClick={onSignInClick}
                variant="outline"
                className="w-full py-6 text-base font-semibold border-white/20 bg-white/5 hover:bg-white/10"
              >
                {t("upload.gateEmailStart")}
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-5">
              {t("upload.gateFootnote")}
            </p>
          </div>
        </div>
        <Footer mobile onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  // 가격 포맷팅 (쉼표 추가)
  const formatWithCommas = (value: string) => {
    const number = value.replace(/[^0-9]/g, "");
    return number ? parseInt(number).toLocaleString() : "";
  };

  // 가격 포맷팅 제거 (쉼표 제거)
  const stripCommas = (value: string) => value.replace(/,/g, "");

  // 이미지 다운스케일 + JPEG 재인코딩 (썸네일 업로드 페이로드 최소화)
  const downscaleToJpegBlob = (dataUrl: string, maxW = 1280, maxH = 720, quality = 0.85): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = dataUrl;
    });
  };

  // Bunny Stream에 커스텀 썸네일 업로드 (POST /thumbnail)
  // - 자동 추출 프레임 또는 사용자 업로드 이미지를 Bunny에 직접 전송
  // - Supabase Storage 사용 안 함 (영상과 같은 Bunny CDN에서 서빙)
  // R1(2026-06-11): Bunny 썸네일 API 는 라이브러리 키가 필요해 Edge Function 경유로 전환
  const setBunnyThumbnail = async (
    videoId: string,
    token: string,
    thumbnailDataUrl: string
  ): Promise<void> => {
    const blob = await downscaleToJpegBlob(thumbnailDataUrl, 1280, 720, 0.85);
    const response = await fetch(`${supabaseUrl}/functions/v1/server/videos/${videoId}/thumbnail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": blob.type || "image/jpeg",
      },
      body: blob,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Bunny thumbnail upload failed: ${response.status} ${text}`);
    }
  };

  // Bunny.net에 직접 업로드 — R1(2026-06-11): 라이브러리 키 대신 TUS presigned 서명 사용
  const uploadToBunny = async (file: File, auth: BunnyTusAuth) => {
    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;
    let smoothedSpeed = 0; // 지수 이동 평균으로 속도 안정화

    await tusUploadToBunny(file, auth, (loaded, total) => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      const dl = loaded - lastLoaded;

      if (dt > 0.2) {
        const instSpeed = dl / dt; // bytes/s
        // 새 측정치에 70% 가중, 기존 평균에 30% — 안정적인 ETA를 위해
        smoothedSpeed = smoothedSpeed === 0 ? instSpeed : smoothedSpeed * 0.3 + instSpeed * 0.7;
        lastLoaded = loaded;
        lastTime = now;
      }

      const remaining = total - loaded;
      const eta = smoothedSpeed > 0 ? remaining / smoothedSpeed : 0;

      setUploadProgress(Math.round((loaded / total) * 100));
      setUploadStats({ loaded, total, speed: smoothedSpeed, eta });
    }, uploadAbortRef.current?.signal);
    console.log('Upload complete to Bunny.net');
  };

  // 스텝2(콘텐츠 정보) 필수 항목 검증 — '다음' 이동/최종 제출 공통.
  // 첫 누락 항목에서 toast 후 false 반환. (검증 없이 다음 단계로 넘어가던 버그 차단)
  const validateStep2 = (): boolean => {
    if (!formData.title.trim()) {
      toast.error(t("upload.toast.titleRequired", "제목을 입력해주세요."));
      return false;
    }
    // 카테고리·장르 필수 — 장르는 시네마/OTT 행 분류 기준이라 비면 어느 행에도 안 나옴
    if (!formData.category) {
      toast.error(t("upload.toast.categoryRequired", "카테고리를 선택해주세요."));
      return false;
    }
    if (!formData.genre) {
      toast.error(t("upload.toast.genreRequired", "장르를 선택해주세요."));
      return false;
    }
    // Phase 31.1 — 시청 등급 필수
    if (!formData.ageRating) {
      toast.error(t("upload.toast.ageRatingRequired", "시청 등급을 선택해주세요."));
      return false;
    }
    // JSX required 였으나 step "다음"이 type=button 이라 미발동 → 빈 값 저장되던 것 검증 추가
    if (!formData.aiTool) {
      toast.error(t("upload.toast.aiToolRequired", "사용한 AI 도구를 선택해주세요."));
      return false;
    }
    if (!formData.resolution) {
      toast.error(t("upload.toast.resolutionRequired", "해상도를 선택해주세요."));
      return false;
    }
    // duration 은 자동측정되지만 자유 입력이라 잘못된 형식 저장 방지(예: 3:45 또는 1:03:45)
    if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test((formData.duration || "").trim())) {
      toast.error(t("upload.toast.durationInvalid", "재생 시간 형식이 올바르지 않습니다 (예: 3:45)."));
      return false;
    }
    return true;
  };

  // form onSubmit (또는 "업로드 완료" 클릭) → 미리보기 모달 오픈
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) {
      toast.error(t("upload.toast.copyrightRequired"));
      return;
    }
    if (!selectedFile) {
      toast.error(t("upload.toast.fileRequired"));
      return;
    }
    if (!validateStep2()) return;
    setShowPreview(true);
  };

  // 실제 업로드 수행 (미리보기 모달의 "확인하고 업로드" 버튼이 호출)
  const performUpload = async () => {
    if (isUploading) return;   // 중복 제출 방지(빠른 더블클릭 시 영상 2개 생성 차단)
    uploadAbortRef.current = new AbortController();
    setShowPreview(false);

    if (!user || !accessToken) {
      toast.error(t("upload.toast.loginRequired"));
      return;
    }

    if (!selectedFile) {
      toast.error(t("upload.toast.fileRequired"));
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 0. 버전 확인 및 토큰 최신화 확인
      console.log('Upload Component Version: 1.0.5 (Dynamic Hostname)');
      console.log('Checking session/token...');
      const { data: { session } } = await supabase.auth.getSession();
      const currentToken = session?.access_token || accessToken;
      
      if (!currentToken) {
        console.error('No current token found');
        throw new Error(t("upload.toast.tokenMissing"));
      }

      const publicAnonKey = supabaseAnonKey;
      const targetUrl = `https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/videos/create-upload`;
      console.log('Request Diagnostics:', {
        url: targetUrl,
        hasUser: !!user,
        userId: user?.id,
        hasToken: !!currentToken
      });

      // 1. 서버에 비디오 생성 요청
      console.log('Creating video on Bunny.net via Edge Function...');
      const createResponse = await fetch(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`,
            'apikey': supabaseAnonKey
          },
          body: JSON.stringify({
            title: formData.title || selectedFile.name,
          }),
        }
      );

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        console.error('Video creation failed:', errorData);
        toast.error(t("upload.toast.uploadServerError", { message: errorData.error || createResponse.statusText }));
        throw new Error(errorData.error || `Failed to create video (${createResponse.status})`);
      }

      const createData = await createResponse.json();
      const { videoId, libraryId, tusSignature, tusExpire } = createData;
      console.log('Video created:', videoId);
      setBunnyVideoId(videoId);

      // 2. Bunny.net에 직접 업로드 (TUS presigned — 라이브러리 키는 클라이언트로 오지 않음)
      console.log('Uploading file to Bunny.net...');
      await uploadToBunny(selectedFile, { videoId, libraryId, tusSignature, tusExpire });
      console.log('File uploaded successfully');

      // TUS 업로드가 길어지면(대용량·저속 회선) 시작 시 캡처한 JWT(1시간)가 만료될 수 있음
      // → 이후 요청(썸네일·메타데이터 저장)은 최신 토큰으로 재조회해 401 확정 실패 방지
      const { data: { session: postUploadSession } } = await supabase.auth.getSession();
      const freshToken = postUploadSession?.access_token || currentToken;

      // 2.5. 커스텀 썸네일 업로드 (선택된 경우) — Edge Function 경유
      // 자동 추출 프레임 또는 사용자 업로드 이미지를 Bunny Stream에 전송
      // 실패해도 Bunny 자동 썸네일이 폴백되므로 치명적이지 않음
      if (selectedThumbnail) {
        console.log('Setting custom thumbnail on Bunny...');
        toast.info(t("upload.toast.thumbnailProcessing"));
        try {
          await setBunnyThumbnail(videoId, freshToken, selectedThumbnail);
          console.log('Custom thumbnail set successfully');
        } catch (thumbErr) {
          console.warn('Thumbnail upload failed, falling back to Bunny default:', thumbErr);
          toast.warning(t("upload.toast.thumbnailUploadFailed"));
        }
      }

      // 2-b. 자막 파일(.vtt) 업로드 — video-subtitles 스토리지 (소프트섭)
      let subtitleUrl = '';
      if (subtitleFile && user) {
        try {
          const path = `${user.id}/${videoId}/subtitle.vtt`;
          const { error: subErr } = await supabase.storage.from('video-subtitles')
            .upload(path, subtitleFile, { upsert: true, contentType: 'text/vtt' });
          if (subErr) throw subErr;
          subtitleUrl = supabase.storage.from('video-subtitles').getPublicUrl(path).data.publicUrl;
        } catch (subErr) {
          console.warn('Subtitle upload failed:', subErr);
          toast.warning(t("upload.subtitleUploadFailed", "자막 업로드에 실패했어요. 영상 수정에서 다시 시도할 수 있습니다."));
        }
      }

      // 3. 메타데이터 저장 (Edge Function 호출로 변경 - KV 및 DB 동시 저장)
      console.log('Saving metadata via Edge Function...');
      // @ts-ignore
      const envHostname = (import.meta as any).env.VITE_BUNNY_HOSTNAME;
      const bunnyHostname = envHostname || `vz-${libraryId}.b-cdn.net`;
      console.log('Using Bunny Hostname:', bunnyHostname);
      
      const metadata = {
        videoId: videoId,
        title: formData.title || selectedFile.name,
        description: formData.description || '',
        thumbnailUrl: `https://${bunnyHostname}/${videoId}/thumbnail.jpg`,
        hlsUrl: `https://${bunnyHostname}/${videoId}/playlist.m3u8`,
        duration: formData.duration || '0:00',
        // 챌린지 참가작이면 'challenge:<tag>' 를 태그에 자동 추가 (가시 태그칩과 무관, 출품 식별용)
        tags: activeChallenge
          ? [formData.tags, `challenge:${activeChallenge.tag}`].filter(Boolean).join(",")
          : (formData.tags || ""),
        // All-in-One 단일 라이선스
        standardPrice: stripCommas(formData.standardPrice) || "0",
        aiTool: formData.aiTool || '',
        aiModelVersion: formData.aiModelVersion || '',
        category: formData.category || '',
        genre: formData.genre || '',
        age_rating: formData.ageRating || 'all',  // Phase 31.1 — 시청 등급
        prompt: formData.prompt || '',
        seed: formData.seed || '',
        resolution: formData.resolution || '',
        // 시네마 메타데이터
        director: formData.director || '',
        writer: formData.writer || '',
        composer: formData.composer || '',
        cast: formData.cast || '',
        productionYear: formData.productionYear || '',
        language: formData.language || '',
        subtitleLanguage: formData.subtitleLanguage || '',
        subtitleUrl: subtitleUrl,
        // 공개 설정
        visibility: formData.visibility || 'public',
        // 라이선스/출처 (어드민 시드 콘텐츠용 — 일반 업로드는 기본 'original')
        licenseType: profile?.is_admin ? formData.licenseType : 'original',
        licenseSourceUrl: profile?.is_admin ? (formData.licenseSourceUrl?.trim() || '') : '',
        attribution: profile?.is_admin ? (formData.attribution?.trim() || '') : '',
        originalCreator: profile?.is_admin ? (formData.originalCreator?.trim() || '') : '',
        // 하이라이트 구간 (홈 피드/큐레이션 노출용)
        highlightStart: highlight.start,
        highlightEnd: highlight.end,
        // Phase 28: Sponsorship
        sponsorBrand: formData.sponsorBrand?.trim() || null,
        sponsorLogoUrl: formData.sponsorLogoUrl?.trim() || null,
        sponsorDisclosure: formData.sponsorBrand?.trim() ? (formData.sponsorDisclosure?.trim() || "유료 광고 포함") : null,
        sponsorLinkUrl: formData.sponsorLinkUrl?.trim() || null,
        status: 'ready'
      };

      const saveUrl = `https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/videos/save-metadata`;
      console.log('Saving metadata to:', saveUrl);
      
      // 고아 영상 방지: TUS 는 성공했는데 save-metadata 가 일시 실패(네트워크/5xx)하면
      // Bunny 엔 영상이 있고 DB 엔 없음 → 최대 3회 재시도(4xx 검증오류는 즉시 중단).
      let saveResponse: Response | null = null;
      let saveErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          saveResponse = await fetch(saveUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${freshToken}`,
              'apikey': supabaseAnonKey,
            },
            body: JSON.stringify(metadata),
          });
          if (saveResponse.ok || saveResponse.status < 500) break;  // 성공 또는 4xx(재시도 무의미)
        } catch (e) { saveErr = e; }   // 네트워크 오류 → 재시도
        if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
      }

      if (!saveResponse || !saveResponse.ok) {
        const errorData = saveResponse ? await saveResponse.json().catch(() => ({})) : {};
        console.error('Metadata saving failed:', errorData, saveErr);
        throw new Error(errorData.error || saveErr?.message || t("upload.toast.saveError", { status: saveResponse?.status ?? 0 }));
      }

      console.log('Metadata saved successfully via Edge Function');
      setUploadComplete(true);
      toast.success(t("upload.toast.uploadSuccess"));

      // 시리즈 연결 (선택) — 새 시리즈면 먼저 생성 후 영상에 연결
      if (seriesId) {
        try {
          let sid: string | null = seriesId === "__new__" ? null : seriesId;
          if (seriesId === "__new__" && newSeriesTitle.trim()) {
            const { data: createdId } = await supabase.rpc("create_series", {
              p_title: newSeriesTitle.trim(),
              p_genre: formData.genre || null,
            });
            sid = (createdId as string) || null;
            // 새로 만든 시리즈를 "선택 상태"로 전환 → 다음 화도 같은 시리즈에 묶이게(중복 생성 방지)
            if (sid) { setSeriesId(sid); setNewSeriesTitle(""); }
          }
          if (sid) {
            await supabase.rpc("set_video_series", {
              p_video_id: videoId,
              p_series_id: sid,
              p_season_number: parseInt(seasonNumber) || 1,
              p_episode_number: episodeNumber ? parseInt(episodeNumber) : null,
            });
            // 회차 번호 자동 +1 (다음 화 편의)
            if (episodeNumber) setEpisodeNumber(String((parseInt(episodeNumber) || 0) + 1));
          }
        } catch (e) {
          console.warn("[Upload] 시리즈 연결 실패:", e);
        }
        // 시리즈 목록 갱신 → 방금 만든 시리즈가 다음 업로드 드롭다운에도 보이게
        supabase.rpc("get_my_series").then(
          ({ data }) => { if (data) setSeriesList(data as any); },
          () => {},
        );
      }

      // Phase 25 — 자동 모더레이션 (fire-and-forget, 실패해도 업로드 흐름 무관)
      const moderateUrl = `https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/moderate-video`;
      fetch(moderateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ video_id: videoId }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.warn('[Phase 25] 자동 모더레이션 실패:', data);
        } else {
          console.log('[Phase 25] 자동 모더레이션 결과:', data.score, '/', data.status);
        }
      }).catch((err) => {
        console.warn('[Phase 25] 자동 모더레이션 예외:', err);
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || t("upload.toast.uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setUploadComplete(false);
    setStep(1);
    setSelectedFile(null);
    setBunnyVideoId(null);
    setUploadProgress(0);
    setUploadStats({ loaded: 0, total: 0, speed: 0, eta: 0 });
    setThumbnailOptions([]);
    setSelectedThumbnail(null);
    setSelectedThumbnailIndex(-1);
    setCustomThumbnail(null);
    setSubtitleFile(null);
    setTagInput("");
    setVideoDurationSec(0);
    setHighlight({ start: 0, end: 30 });
    setShowPreview(false);
    if (fileObjectUrlRef.current) {
      URL.revokeObjectURL(fileObjectUrlRef.current);
      fileObjectUrlRef.current = null;
    }
    setFormData({
      title: "",
      description: "",
      category: "",
      genre: "",
      ageRating: "",
      aiTool: "",
      aiModelVersion: "",
      resolution: "",
      duration: "",
      prompt: "",
      seed: "",
      creativityDescription: "",
      director: "",
      writer: "",
      composer: "",
      cast: "",
      productionYear: "",
      language: "",
      subtitleLanguage: "",
      visibility: "public",
      licenseType: "original",
      licenseSourceUrl: "",
      attribution: "",
      originalCreator: "",
      standardPrice: "",
      tags: "",
      sponsorBrand: "",
      sponsorLogoUrl: "",
      sponsorDisclosure: "유료 광고 포함",
      sponsorLinkUrl: "",
    });
    setAgreedToTerms(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // 드래프트 삭제
    if (draftKey) localStorage.removeItem(draftKey);
  };

  if (uploadComplete) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md mx-auto"
        >
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] mx-auto mb-6 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl mb-3">{t("upload.uploadSuccessTitle")}</h2>
          <p className="text-muted-foreground mb-6">
            {t("upload.uploadSuccessHint1")}<br />
            {t("upload.uploadSuccessHint2")}<br />
            {t("upload.uploadSuccessHint3")}
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={resetForm}
              className="flex-1"
            >
              {t("upload.continueUpload")}
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
              onClick={onViewMyProducts}
            >
              {t("upload.viewMyProducts")}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div ref={scrollRootRef} className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto p-6 md:p-8 pb-28 md:pb-8">

        {/* 챌린지 참가 배너 — '참가하기'로 진입한 경우 */}
        {activeChallenge && (
          <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-[#6366f1]/15 via-[#8b5cf6]/15 to-[#ec4899]/15 border border-[#8b5cf6]/40 flex items-center gap-3">
            <div className="shrink-0 text-2xl">🏆</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white truncate">
                {t("upload.challengeJoinTitle", { title: activeChallenge.title, defaultValue: `‘${activeChallenge.title}’ 챌린지 참가 중` })}
              </p>
              <p className="text-xs text-purple-200/80">
                {t("upload.challengeJoinDesc", "이 영상은 챌린지 출품작으로 자동 등록됩니다.")}
              </p>
            </div>
            <button
              onClick={() => setActiveChallenge(null)}
              className="shrink-0 text-xs text-purple-200/70 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
            >
              {t("upload.challengeJoinCancel", "참가 취소")}
            </button>
          </div>
        )}

        {/* Bunny Setup Guide Modal */}
        <BunnySetupGuide
          open={showBunnyGuide}
          onClose={() => setShowBunnyGuide(false)}
        />

        {/* 콘텐츠 정책 안내 — 1분+ 시네마틱 영화 권장 */}
        <div className="mb-4 p-4 md:p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-2 border-amber-500/30">
          <div className="flex items-start gap-3">
            <div className="shrink-0 text-2xl">🎬</div>
            <div className="flex-1">
              <p className="text-sm font-black text-amber-200 mb-1">{t("upload.policyTitle")}</p>
              <p className="text-xs text-amber-100/80 leading-relaxed">{t("upload.policyDescription")}</p>
            </div>
          </div>
        </div>

        {/* 수익 정책 안내 */}
        <a
          href="?info=creator-revenue"
          className="flex items-center gap-3 p-3 md:p-4 mb-6 rounded-xl bg-gradient-to-br from-[#a78bfa]/10 to-[#ec4899]/10 border border-[#a78bfa]/20 hover:border-[#a78bfa]/40 transition-colors group"
        >
          <div className="shrink-0 w-9 h-9 rounded-lg bg-[#a78bfa]/15 flex items-center justify-center">
            <Coins className="w-4.5 h-4.5 text-[#a78bfa]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">{t("upload.revenueGuideLabel")}</p>
            <p className="text-xs text-gray-400">{t("upload.revenueGuideDesc")}</p>
          </div>
          <span className="text-xs text-[#a78bfa] group-hover:translate-x-0.5 transition-transform">→</span>
        </a>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step >= s 
                    ? 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white' 
                    : 'bg-card border border-border'
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`flex-1 h-1 mx-2 ${
                    step > s ? 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]' : 'bg-border'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t("upload.stepFileUpload")}</span>
            <span>{t("upload.stepProductInfo")}</span>
            <span>{t("upload.stepPricing")}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 && (
            <div className="space-y-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.avi"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="p-12 border-2 border-dashed border-border rounded-lg text-center hover:border-[#6366f1] transition-colors cursor-pointer"
              >
                <UploadIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                {selectedFile ? (
                  <>
                    <p className="mb-2 text-[#6366f1] font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("upload.fileSize", { size: (selectedFile.size / 1024 / 1024).toFixed(2) })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mb-2">{t("upload.dragOrClickPrompt")}</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("upload.supportedFormats")}
                    </p>
                  </>
                )}
                <Button 
                  type="button" 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent the div's onClick from firing again
                    fileInputRef.current?.click();
                  }}
                  className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
                >
                  {selectedFile ? t("upload.selectAnotherFile") : t("upload.selectFile")}
                </Button>
              </div>

              {/* 썸네일 선택 — 영상 프레임 자동 추출 + 커스텀 업로드 */}
              {selectedFile && thumbnailOptions.length > 0 && (
                <div className="bg-card p-4 rounded-lg border border-border">
                  <Label className="mb-3 block">
                    {t("upload.thumbnailSelect")}{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      {t("upload.thumbnailSelectHint")}
                    </span>
                  </Label>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {thumbnailOptions.map((frame, i) => {
                      const isSelected = selectedThumbnailIndex === i && !customThumbnail;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setSelectedThumbnail(frame);
                            setSelectedThumbnailIndex(i);
                            setCustomThumbnail(null);
                          }}
                          className={`aspect-video rounded-lg overflow-hidden border-2 transition-all relative ${
                            isSelected
                              ? "border-[#6366f1] ring-2 ring-[#6366f1]/40"
                              : "border-border hover:border-[#6366f1]/50"
                          }`}
                        >
                          <img src={frame} alt={`frame ${i + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">
                            {[t("upload.frameStart"), t("upload.frameMiddle"), t("upload.frameEnd")][i] || `${i + 1}`}
                          </span>
                          {isSelected && (
                            <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-[#6366f1] flex items-center justify-center">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    ref={customThumbInputRef}
                    onChange={handleCustomThumbnail}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => customThumbInputRef.current?.click()}
                    className={`w-full py-2 px-3 rounded-lg border-2 border-dashed text-sm transition-colors flex items-center justify-center gap-2 ${
                      customThumbnail
                        ? "border-[#6366f1] bg-[#6366f1]/10 text-[#a78bfa]"
                        : "border-border hover:border-[#6366f1] text-muted-foreground"
                    }`}
                  >
                    <ImagePlus className="w-4 h-4" />
                    {customThumbnail ? t("upload.customThumbnailChange") : t("upload.customThumbnailButton")}
                  </button>

                  {customThumbnail && (
                    <div className="mt-3 aspect-video rounded-lg overflow-hidden border-2 border-[#6366f1] ring-2 ring-[#6366f1]/40 max-w-xs mx-auto">
                      <img src={customThumbnail} alt="Custom" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              )}

              {/* 하이라이트 구간 마킹 — 홈 피드/큐레이션 노출용 */}
              {selectedFile && videoDurationSec > 0 && fileObjectUrlRef.current && (
                <div className="bg-card p-4 rounded-lg border border-border">
                  <Label className="mb-1 block">
                    {t("upload.highlightTitle")}{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      {t("upload.highlightHint")}
                    </span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("upload.highlightDescription")}
                  </p>

                  {/* 미리보기 비디오 (드래그 시 시작 시점 프레임 표시) */}
                  <video
                    ref={previewVideoRef}
                    src={fileObjectUrlRef.current}
                    className="w-full aspect-video rounded mb-3 bg-black"
                    muted
                    playsInline
                    preload="metadata"
                  />

                  {/* Dual-thumb slider */}
                  <div className="px-1 mb-2">
                    <Slider
                      min={0}
                      max={videoDurationSec}
                      step={0.1}
                      value={[highlight.start, highlight.end]}
                      onValueChange={(values) => {
                        const [s, e] = values as [number, number];
                        // 제약: 5초 ≤ 구간 ≤ 30초 (영상이 더 짧으면 전체)
                        const minSpan = Math.min(5, videoDurationSec);
                        const maxSpan = 30;
                        let newStart = s;
                        let newEnd = e;
                        if (newEnd - newStart < minSpan) {
                          if (s !== highlight.start) newStart = Math.max(0, newEnd - minSpan);
                          else newEnd = Math.min(videoDurationSec, newStart + minSpan);
                        }
                        if (newEnd - newStart > maxSpan) {
                          if (s !== highlight.start) newStart = newEnd - maxSpan;
                          else newEnd = newStart + maxSpan;
                        }
                        setHighlight({ start: newStart, end: newEnd });
                        // 미리보기 비디오를 시작 시점으로 seek
                        if (previewVideoRef.current) {
                          previewVideoRef.current.currentTime = s !== highlight.start ? newStart : newEnd;
                        }
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {t("upload.highlightStart")} <span className="text-white font-semibold">{formatSeconds(highlight.start)}</span>
                    </span>
                    <span className="px-2 py-1 rounded bg-[#6366f1]/15 text-[#a78bfa] font-bold">
                      {(highlight.end - highlight.start).toFixed(1)}{t("upload.secondsSuffix")}
                    </span>
                    <span className="text-muted-foreground">
                      {t("upload.highlightEnd")} <span className="text-white font-semibold">{formatSeconds(highlight.end)}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const v = previewVideoRef.current;
                      if (!v) return;
                      v.currentTime = highlight.start;
                      v.play();
                      const stopAt = () => {
                        if (v.currentTime >= highlight.end) {
                          v.pause();
                          v.removeEventListener("timeupdate", stopAt);
                        }
                      };
                      v.addEventListener("timeupdate", stopAt);
                    }}
                    className="mt-3 w-full py-2 px-4 rounded-md border border-[#6366f1]/40 bg-[#6366f1]/10 hover:bg-[#6366f1]/20 text-[#a78bfa] text-sm font-medium transition-colors"
                  >
                    {t("upload.previewHighlight")}
                  </button>
                </div>
              )}

              <div className="bg-red-500/5 p-4 rounded-lg border border-red-500/30">
                <p className="text-sm text-red-200/90 leading-relaxed">
                  {t("upload.uploadPolicyNotice")}
                </p>
              </div>

              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!selectedFile}
                className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-50"
              >
                {t("upload.next")}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <Label htmlFor="title">{t("upload.titleLabel")}</Label>
                  <span className={`text-xs ${formData.title.length > 50 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {formData.title.length}/60
                  </span>
                </div>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t("upload.titlePlaceholder")}
                  className="bg-card"
                  maxLength={60}
                  required
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <Label htmlFor="description">{t("upload.descriptionLabel")}</Label>
                  <span className={`text-xs ${formData.description.length > 450 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {formData.description.length}/500
                  </span>
                </div>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("upload.descriptionPlaceholder")}
                  rows={6}
                  className="bg-card resize-y"
                  maxLength={500}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category" className="mb-2 block">{t("upload.categoryLabel")}</Label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                    required
                  >
                    <option value="">{t("upload.selectOption")}</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{getCategoryLabel(cat, t)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="genre" className="mb-2 block">{t("upload.genreLabel")}</Label>
                  <select
                    id="genre"
                    value={formData.genre}
                    onChange={(e) => setFormData({...formData, genre: e.target.value})}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                    required
                  >
                    <option value="">{t("upload.selectOption")}</option>
                    {genres.map(genre => (
                      <option key={genre} value={genre}>{getGenreLabel(genre, t)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 시리즈(연속물) — 선택 */}
              <div>
                <Label htmlFor="series" className="mb-2 block">{t("upload.seriesLabel")}</Label>
                <select
                  id="series"
                  value={seriesId}
                  onChange={(e) => setSeriesId(e.target.value)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                >
                  <option value="">{t("upload.seriesNone")}</option>
                  {seriesList.map((s) => (
                    <option key={s.id} value={s.id}>{s.title} ({t("upload.seriesEpisodeCount", { count: s.episode_count })})</option>
                  ))}
                  <option value="__new__">{t("upload.seriesCreateNew")}</option>
                </select>
                {seriesId === "__new__" && (
                  <input
                    type="text"
                    value={newSeriesTitle}
                    onChange={(e) => setNewSeriesTitle(e.target.value)}
                    placeholder={t("upload.seriesTitlePlaceholder")}
                    className="mt-2 flex h-9 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                  />
                )}
                {seriesId && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">{t("upload.seasonLabel")}</Label>
                      <input type="number" min="1" value={seasonNumber} onChange={(e) => setSeasonNumber(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">{t("upload.episodeLabel")}</Label>
                      <input type="number" min="1" value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} placeholder={t("upload.episodeNumberPlaceholder")} className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-1.5">{t("upload.seriesGroupNote")}</p>
              </div>

              {/* 시청 등급 — 필수 입력 (Phase 31.1) */}
              <div>
                <Label className="mb-2 block">
                  {t("upload.ageRatingLabel", "시청 등급")} <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "all", label: t("upload.ageAll", "전체관람가"), hint: t("upload.ageAllHint", "모든 시청자") },
                    { value: "13",  label: "12+", hint: t("upload.age12Hint", "가벼운 폭력·언어") },
                    { value: "15",  label: "15+", hint: t("upload.age15Hint", "폭력·선정성 일부") },
                    // 19+(성인) 등급 제거 — 광고 정책상 성인인증 요구 콘텐츠 불가. 최대 15+.
                  ].map((opt) => {
                    const selected = formData.ageRating === opt.value;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setFormData({ ...formData, ageRating: opt.value as any })}
                        className={`relative p-3 rounded-lg border text-left transition-all ${
                          selected
                            ? "bg-[#6366f1]/15 border-[#6366f1] shadow-[0_0_0_1px_rgba(99,102,241,0.4)]"
                            : "bg-card border-border hover:border-white/30"
                        }`}
                      >
                        <p className={`text-sm font-bold mb-0.5 ${selected ? "text-[#a5b4fc]" : "text-foreground"}`}>{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-snug">{opt.hint}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {t("upload.ageRatingNote15Max", "* 최대 15세 이용가까지 등록할 수 있습니다 (성인 콘텐츠 불가).")}
                </p>
              </div>

              <div>
                <Label htmlFor="aiTool" className="mb-2 block">{t("upload.aiToolLabel")}</Label>
                <select
                  id="aiTool"
                  value={formData.aiTool}
                  onChange={(e) => setFormData({...formData, aiTool: e.target.value})}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                  required
                >
                  <option value="">{t("upload.selectOption")}</option>
                  {aiTools.map(tool => (
                    <option key={tool} value={tool}>{getAiToolLabel(tool, t)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="resolution" className="mb-2 block">{t("upload.resolutionLabel")}</Label>
                  <select
                    key={`resolution-${forceUpdate}`}
                    id="resolution"
                    value={formData.resolution}
                    onChange={(e) => setFormData({...formData, resolution: e.target.value})}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                    required
                  >
                    <option value="">{t("upload.selectOption")}</option>
                    {resolutions.map(res => (
                      <option key={res} value={res}>{res}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="duration" className="mb-2 block">{t("upload.durationLabel")}</Label>
                  <Input
                    id="duration"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                    placeholder={t("upload.durationPlaceholder")}
                    className="bg-card"
                    required
                  />
                </div>
              </div>

              {/* ━━━ AI 제작 증빙 (선택) ━━━ */}
              <details className="group rounded-lg border border-border bg-card/50 overflow-hidden" open>
                <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between hover:bg-card transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🤖</span>
                    <span className="font-semibold">{t("upload.aiProofHeader")}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a78bfa]">{t("upload.optionalBadge")}</span>
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-300 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 pb-4 space-y-4 border-t border-border">
                  <p className="text-xs text-muted-foreground pt-3">
                    {t("upload.aiProofDescription")}
                  </p>
                  <div>
                    <Label htmlFor="prompt" className="mb-2 block text-sm">{t("upload.promptLabel")}</Label>
                    <Textarea
                      id="prompt"
                      value={formData.prompt}
                      onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                      placeholder="A cinematic shot of a spacecraft drifting through a nebula, dramatic lighting..."
                      rows={3}
                      className="bg-background resize-y"
                      maxLength={2000}
                    />
                  </div>
                  <div>
                    <Label htmlFor="seed" className="mb-2 block text-sm">
                      {t("upload.seedLabel")} <span className="text-xs text-muted-foreground font-normal">{t("upload.seedOptionalHint")}</span>
                    </Label>
                    <Input
                      id="seed"
                      value={formData.seed}
                      onChange={(e) => setFormData({ ...formData, seed: e.target.value })}
                      placeholder={t("upload.seedPlaceholder")}
                      className="bg-background"
                      maxLength={50}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                      {t("upload.seedDescription")}
                    </p>
                  </div>
                </div>
              </details>

              {/* ━━━ 시네마 메타데이터 (선택) ━━━ */}
              <details className="group rounded-lg border border-border bg-card/50 overflow-hidden" open>
                <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between hover:bg-card transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎬</span>
                    <span className="font-semibold">{t("upload.cinemaMetaHeader")}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a78bfa]">{t("upload.optionalBadge")}</span>
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-300 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 pb-4 space-y-4 border-t border-border">
                  <p className="text-xs text-muted-foreground pt-3">
                    {t("upload.cinemaMetaDescription")}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="director" className="mb-2 block text-sm">{t("upload.directorLabel")}</Label>
                      <Input
                        id="director"
                        value={formData.director}
                        onChange={(e) => setFormData({ ...formData, director: e.target.value })}
                        placeholder={t("upload.directorPlaceholder")}
                        className="bg-background"
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <Label htmlFor="writer" className="mb-2 block text-sm">{t("upload.writerLabel")}</Label>
                      <Input
                        id="writer"
                        value={formData.writer}
                        onChange={(e) => setFormData({ ...formData, writer: e.target.value })}
                        placeholder={t("upload.writerPlaceholder")}
                        className="bg-background"
                        maxLength={50}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="composer" className="mb-2 block text-sm">{t("upload.composerLabel")}</Label>
                      <Input
                        id="composer"
                        value={formData.composer}
                        onChange={(e) => setFormData({ ...formData, composer: e.target.value })}
                        placeholder={t("upload.composerPlaceholder")}
                        className="bg-background"
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <Label htmlFor="productionYear" className="mb-2 block text-sm">{t("upload.productionYearLabel")}</Label>
                      <Input
                        id="productionYear"
                        type="number"
                        value={formData.productionYear}
                        onChange={(e) => setFormData({ ...formData, productionYear: e.target.value })}
                        placeholder={new Date().getFullYear().toString()}
                        className="bg-background"
                        min={1900}
                        max={new Date().getFullYear() + 1}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="cast" className="mb-2 block text-sm">{t("upload.castLabel")}</Label>
                    <Input
                      id="cast"
                      value={formData.cast}
                      onChange={(e) => setFormData({ ...formData, cast: e.target.value })}
                      placeholder={t("upload.castPlaceholder")}
                      className="bg-background"
                      maxLength={200}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="language" className="mb-2 block text-sm">{t("upload.languageLabel")}</Label>
                      <select
                        id="language"
                        value={formData.language}
                        onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t("upload.selectOption")}</option>
                        {languages.map((l) => <option key={l} value={l}>{getLanguageLabel(l, t)}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="subtitleLanguage" className="mb-2 block text-sm">{t("upload.subtitleLanguageLabel")}</Label>
                      <select
                        id="subtitleLanguage"
                        value={formData.subtitleLanguage}
                        onChange={(e) => setFormData({ ...formData, subtitleLanguage: e.target.value })}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t("upload.subtitleNone")}</option>
                        {languages.filter(l => l !== "무음/instrumental").map((l) => <option key={l} value={l}>{getLanguageLabel(l, t)}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 자막 파일(.vtt) 업로드 — 소프트섭 */}
                  <div className="mt-4">
                    <Label className="mb-2 block text-sm">{t("upload.subtitleFileLabel", "자막 파일 (.vtt)")}</Label>
                    <input
                      ref={subtitleFileRef}
                      type="file"
                      accept=".vtt,text/vtt"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        if (!f.name.toLowerCase().endsWith(".vtt")) { toast.error(t("upload.subtitleFormatHint", "WebVTT(.vtt) 파일만 가능합니다.")); return; }
                        if (f.size > 1024 * 1024) { toast.error(t("upload.subtitleTooLarge", "자막은 1MB 이하만 가능합니다.")); return; }
                        setSubtitleFile(f);
                      }}
                    />
                    {subtitleFile ? (
                      <div className="flex items-center gap-2 p-2 bg-[#10b981]/10 border border-[#10b981]/20 rounded-lg">
                        <FileText className="w-4 h-4 text-[#10b981] shrink-0" />
                        <span className="text-xs text-[#10b981] flex-1 truncate">{subtitleFile.name} ({Math.round(subtitleFile.size / 1024)}KB)</span>
                        <button type="button" onClick={() => setSubtitleFile(null)} className="text-xs text-gray-400 hover:text-red-400 underline">{t("common.remove", "제거")}</button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" onClick={() => subtitleFileRef.current?.click()} className="gap-2 w-fit">
                        <UploadIcon className="w-4 h-4" />{t("upload.subtitleUpload", "자막 파일 업로드")}
                      </Button>
                    )}
                    {/* 하드섭/소프트섭 안내 */}
                    <p className="text-[11px] text-amber-300/80 mt-2 leading-relaxed">
                      💡 {t("upload.subtitleSoftHint", "시청자가 자막을 켜고 끄게 하려면 영상에 자막을 합치지(번인) 말고 .vtt 파일로 따로 올려주세요. 영상에 박힌 자막은 끌 수 없습니다.")}
                    </p>
                  </div>
                </div>
              </details>

              {/* 어드민 전용 — 오픈 라이선스 시드 콘텐츠 출처/라이선스 기록 (일반 크리에이터엔 미노출) */}
              {profile?.is_admin && (
                <details className="group rounded-lg border border-[#a78bfa]/40 bg-[#6366f1]/5 overflow-hidden" open>
                  <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between hover:bg-card transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🛡️</span>
                      <span className="font-semibold">{t("upload.licenseSectionTitle")}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#a78bfa]/20 text-[#a78bfa]">ADMIN</span>
                    </div>
                    <ChevronDown className="w-5 h-5 text-gray-300 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 space-y-4 border-t border-border">
                    <p className="text-xs text-muted-foreground pt-3">
                      {t("upload.licenseAdminNote")}
                    </p>
                    <div>
                      <Label htmlFor="licenseType" className="mb-2 block text-sm">{t("upload.licenseTypeLabel")}</Label>
                      <select
                        id="licenseType"
                        value={formData.licenseType}
                        onChange={(e) => setFormData({ ...formData, licenseType: e.target.value as typeof formData.licenseType })}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="original">{t("upload.licenseOriginal")}</option>
                        <option value="cc0">{t("upload.licenseCc0")}</option>
                        <option value="cc-by">{t("upload.licenseCcBy")}</option>
                        <option value="cc-by-sa">{t("upload.licenseCcBySa")}</option>
                        <option value="public-domain">{t("upload.licensePublicDomain")}</option>
                      </select>
                    </div>
                    {formData.licenseType !== "original" && (
                      <>
                        <div>
                          <Label htmlFor="licenseSourceUrl" className="mb-2 block text-sm">{t("upload.licenseSourceUrlLabel")}</Label>
                          <Input
                            id="licenseSourceUrl"
                            value={formData.licenseSourceUrl}
                            onChange={(e) => setFormData({ ...formData, licenseSourceUrl: e.target.value })}
                            placeholder={t("upload.licenseSourceUrlPlaceholder")}
                            className="bg-background"
                            maxLength={300}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="originalCreator" className="mb-2 block text-sm">{t("upload.originalCreatorLabel")}</Label>
                            <Input
                              id="originalCreator"
                              value={formData.originalCreator}
                              onChange={(e) => setFormData({ ...formData, originalCreator: e.target.value })}
                              placeholder={t("upload.originalCreatorPlaceholder")}
                              className="bg-background"
                              maxLength={100}
                            />
                          </div>
                          <div>
                            <Label htmlFor="attribution" className="mb-2 block text-sm">{t("upload.attributionLabel")}</Label>
                            <Input
                              id="attribution"
                              value={formData.attribution}
                              onChange={(e) => setFormData({ ...formData, attribution: e.target.value })}
                              placeholder={t("upload.attributionPlaceholder")}
                              className="bg-background"
                              maxLength={200}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </details>
              )}

              {/* Phase 28: Sponsorship — 협찬·후원 정보 (선택) */}
              <details className="group rounded-lg border border-border bg-card/50 overflow-hidden">
                <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between hover:bg-card transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🤝</span>
                    <span className="font-semibold">{t("upload.sponsorHeader", "협찬·후원 정보")}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">{t("upload.optionalBadge")}</span>
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-300 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 pb-4 space-y-4 border-t border-border">
                  <p className="text-xs text-muted-foreground pt-3">
                    {t("upload.sponsorDescription", "협찬·후원이 있는 콘텐츠는 공정거래법에 따라 영상 시작 시 표시 문구를 노출합니다.")}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="sponsorBrand" className="mb-2 block text-sm">{t("upload.sponsorBrandLabel", "후원 브랜드명")}</Label>
                      <Input
                        id="sponsorBrand"
                        value={formData.sponsorBrand}
                        onChange={(e) => setFormData({ ...formData, sponsorBrand: e.target.value })}
                        placeholder={t("upload.sponsorBrandPlaceholder", "예: Samsung, Coca-Cola")}
                        className="bg-background"
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <Label htmlFor="sponsorDisclosure" className="mb-2 block text-sm">{t("upload.sponsorDisclosureLabel", "표시 문구")}</Label>
                      <Input
                        id="sponsorDisclosure"
                        value={formData.sponsorDisclosure}
                        onChange={(e) => setFormData({ ...formData, sponsorDisclosure: e.target.value })}
                        placeholder={t("upload.sponsorDisclosurePlaceholder")}
                        className="bg-background"
                        maxLength={30}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="sponsorLogoUrl" className="mb-2 block text-sm">{t("upload.sponsorLogoLabel", "후원 로고 URL (선택)")}</Label>
                    <Input
                      id="sponsorLogoUrl"
                      value={formData.sponsorLogoUrl}
                      onChange={(e) => setFormData({ ...formData, sponsorLogoUrl: e.target.value })}
                      placeholder="https://..."
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sponsorLinkUrl" className="mb-2 block text-sm">{t("upload.sponsorLinkLabel", "클릭 시 이동 URL (선택)")}</Label>
                    <Input
                      id="sponsorLinkUrl"
                      value={formData.sponsorLinkUrl}
                      onChange={(e) => setFormData({ ...formData, sponsorLinkUrl: e.target.value })}
                      placeholder="https://..."
                      className="bg-background"
                    />
                  </div>
                </div>
              </details>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <Label htmlFor="tags">{t("upload.tagsLabel")}</Label>
                  <span className="text-xs text-muted-foreground">{tagsList.length}/10</span>
                </div>
                <div
                  className="bg-card border border-input rounded-md px-2 py-2 flex flex-wrap items-center gap-1.5 min-h-[40px] focus-within:ring-2 focus-within:ring-[#6366f1]/40 focus-within:border-[#6366f1] transition-colors"
                  onClick={() => document.getElementById("tags")?.focus()}
                >
                  {tagsList.map((tag, i) => (
                    <span
                      key={`${tag}-${i}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#6366f1]/15 border border-[#6366f1]/30 text-[#a78bfa] text-xs font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTag(i);
                        }}
                        className="ml-0.5 hover:text-white transition-colors"
                        aria-label={t("upload.tagDeleteAria", { tag })}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="tags"
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => tagInput.trim() && addTag(tagInput)}
                    placeholder={tagsList.length === 0 ? t("upload.tagsPlaceholder") : ""}
                    className="flex-1 min-w-[140px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("upload.tagsHint")}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  {t("upload.previous")}
                </Button>
                <Button
                  type="button"
                  onClick={() => { if (validateStep2()) setStep(3); }}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
                >
                  {t("upload.next")}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {isUploading && (
                <div className="bg-card p-6 rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-[#6366f1]" />
                      <span className="font-medium">{t("upload.uploadingState")}</span>
                    </div>
                    <span className="text-2xl font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] bg-clip-text text-transparent">
                      {uploadProgress}%
                    </span>
                  </div>

                  <div className="w-full bg-border rounded-full h-2.5 overflow-hidden mb-4">
                    <div
                      className="h-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-background/50 rounded-md py-2 px-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t("upload.progress")}</p>
                      <p className="text-xs font-bold text-white">
                        {formatBytes(uploadStats.loaded)} <span className="text-muted-foreground font-normal">/ {formatBytes(uploadStats.total)}</span>
                      </p>
                    </div>
                    <div className="bg-background/50 rounded-md py-2 px-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t("upload.speed")}</p>
                      <p className="text-xs font-bold text-white">{formatBytes(uploadStats.speed)}/s</p>
                    </div>
                    <div className="bg-background/50 rounded-md py-2 px-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{t("upload.timeLeft")}</p>
                      <p className="text-xs font-bold text-white">{formatTime(uploadStats.eta)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 공개 설정 */}
              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="mb-1">{t("upload.visibilityHeader")}</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {t("upload.visibilityDescription")}
                </p>

                <div className="space-y-2">
                  {([
                    { value: "public", icon: "🌐", label: t("upload.visibilityPublic"), desc: t("upload.visibilityPublicDesc") },
                    { value: "unlisted", icon: "🔗", label: t("upload.visibilityUnlisted"), desc: t("upload.visibilityUnlistedDesc") },
                    { value: "private", icon: "🔒", label: t("upload.visibilityPrivate"), desc: t("upload.visibilityPrivateDesc") },
                  ] as const).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        formData.visibility === opt.value
                          ? "border-[#6366f1] bg-[#6366f1]/10"
                          : "border-border hover:border-[#6366f1]/50 bg-background/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={opt.value}
                        checked={formData.visibility === opt.value}
                        onChange={() => setFormData({ ...formData, visibility: opt.value })}
                        className="mt-1 accent-[#6366f1]"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base">{opt.icon}</span>
                          <span className="font-semibold text-sm">{opt.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {(() => {
                const isShortVideo = videoDurationSec > 0 && videoDurationSec < 180;
                return (
                  <div className="bg-card p-6 rounded-lg border border-border">
                    <h3 className="mb-1">{t("upload.priceHeader")}</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      {t("upload.priceDescription")}
                    </p>

                    {isShortVideo ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                          <Lock className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-amber-300 mb-1">
                            {t("upload.shortVideoNoLicense")}
                          </p>
                          <p className="text-xs text-amber-300/70 leading-relaxed">
                            {t("upload.shortVideoExplain")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor="price" className="mb-2 block">{t("upload.priceLabel")}</Label>
                        <Input
                          id="price"
                          type="text"
                          value={formData.standardPrice}
                          onChange={(e) => setFormData({ ...formData, standardPrice: formatWithCommas(e.target.value) })}
                          placeholder="100,000"
                          className="bg-background"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("upload.priceVatNotice")}
                        </p>
                        {isNegotiationOnly(parseInt((formData.standardPrice || "0").replace(/,/g, ""), 10)) && (
                          <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <p className="text-xs text-amber-200/90 leading-relaxed">
                              <Trans i18nKey="upload.highValueLicenseNote" components={{ b: <b /> }} />
                            </p>
                          </div>
                        )}
                        <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                          <p className="text-xs text-blue-200/90 leading-relaxed">
                            {t("upload.freeVideoNotice")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="bg-card p-6 rounded-lg border border-border space-y-4">
                <h3>{t("upload.copyrightHeader")}</h3>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                    className="border-zinc-400 dark:border-zinc-300"
                  />
                  <label htmlFor="terms" className="text-sm leading-relaxed">
                    {t("upload.copyrightPledge")}
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={isUploading}
                  className="flex-1"
                >
                  {t("upload.previous")}
                </Button>
                <Button
                  type="submit"
                  disabled={!agreedToTerms || isUploading}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("upload.uploadingState")}
                    </>
                  ) : (
                    t("upload.uploadComplete")
                  )}
                </Button>
              </div>
            </div>
          )}
        </form>

        {/* 게시 전 미리보기 모달 — 마켓 카드 시뮬레이션 */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("upload.previewTitle")}</DialogTitle>
              <DialogDescription>
                {t("upload.previewDescription")}
              </DialogDescription>
            </DialogHeader>

            {/* 마켓 카드 시뮬레이션 */}
            <div className="bg-[#1a1a1c] rounded-2xl overflow-hidden border border-white/10">
              <div className="aspect-video bg-black relative">
                {selectedThumbnail ? (
                  <img src={selectedThumbnail} alt="thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    {t("upload.noThumbnail")}
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <span className="px-2.5 py-1 bg-black/50 backdrop-blur-md border border-white/20 rounded-lg text-white text-[10px] font-bold tracking-wider uppercase">
                    {formData.aiTool || "AI Tool"}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-lg text-white text-[10px] font-bold">
                    {formData.duration || "0:00"}
                  </span>
                </div>
              </div>
              <div className="p-4 bg-gradient-to-b from-transparent to-[#121212]">
                <h3 className="font-bold text-white text-[15px] mb-1.5 line-clamp-1">
                  {formData.title || t("upload.noTitle")}
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">AI</span>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    {profile?.display_name || user?.name || user?.email?.split("@")[0] || "Creator"}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mb-3 line-clamp-2">
                  {formData.description || t("upload.noDescription")}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div>
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Price</span>
                    <p className="text-lg font-extrabold text-white">
                      ₩{formData.standardPrice || "0"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Resolution</span>
                    <p className="text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                      {formData.resolution || "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 추가 정보 요약 */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-card p-3 rounded border border-border">
                <p className="text-muted-foreground mb-0.5">{t("upload.summaryVisibility")}</p>
                <p className="font-semibold">
                  {formData.visibility === "public" && `🌐 ${t("upload.visibilityPublic")}`}
                  {formData.visibility === "unlisted" && `🔗 ${t("upload.visibilityUnlisted")}`}
                  {formData.visibility === "private" && `🔒 ${t("upload.visibilityPrivate")}`}
                </p>
              </div>
              <div className="bg-card p-3 rounded border border-border">
                <p className="text-muted-foreground mb-0.5">{t("upload.summaryHighlight")}</p>
                <p className="font-semibold">
                  {formatSeconds(highlight.start)} ~ {formatSeconds(highlight.end)}
                  <span className="text-muted-foreground font-normal ml-1">
                    ({(highlight.end - highlight.start).toFixed(1)}{t("upload.secondsSuffix")})
                  </span>
                </p>
              </div>
              <div className="bg-card p-3 rounded border border-border">
                <p className="text-muted-foreground mb-0.5">{t("upload.summaryCategoryGenre")}</p>
                <p className="font-semibold">
                  {getCategoryLabel(formData.category, t) || "—"} / {getGenreLabel(formData.genre, t) || "—"}
                </p>
              </div>
              <div className="bg-card p-3 rounded border border-border">
                <p className="text-muted-foreground mb-0.5">{t("upload.summaryLicense")}</p>
                <p className="font-semibold">
                  ₩{formData.standardPrice || "0"}
                </p>
              </div>
              {(formData.director || formData.writer || formData.composer) && (
                <div className="bg-card p-3 rounded border border-border col-span-2">
                  <p className="text-muted-foreground mb-0.5">{t("upload.summaryCinemaCredits")}</p>
                  <p className="font-semibold text-[11px]">
                    {formData.director && t("upload.summaryDirector", { name: formData.director })}
                    {formData.writer && t("upload.summaryWriterSuffix", { name: formData.writer })}
                    {formData.composer && t("upload.summaryMusicSuffix", { name: formData.composer })}
                  </p>
                </div>
              )}
              {tagsList.length > 0 && (
                <div className="bg-card p-3 rounded border border-border col-span-2">
                  <p className="text-muted-foreground mb-1">{t("upload.summaryTags", { count: tagsList.length })}</p>
                  <div className="flex flex-wrap gap-1">
                    {tagsList.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-[#6366f1]/15 border border-[#6366f1]/30 text-[#a78bfa] text-[10px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPreview(false)}
                disabled={isUploading}
              >
                {t("upload.backToEdit")}
              </Button>
              <Button
                type="button"
                onClick={performUpload}
                disabled={isUploading}
                className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("upload.uploadingState")}
                  </>
                ) : (
                  t("upload.confirmAndUpload")
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Footer mobile onNavigate={onNavigate || (() => {})} />
    </div>
  );
}