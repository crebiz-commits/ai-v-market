import { useState, useRef, useMemo, useEffect } from "react";
import { Upload as UploadIcon, Video, FileText, CheckCircle2, Loader2, X, ImagePlus } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { useAuth } from "../contexts/AuthContext";
import { supabase, supabaseAnonKey, supabaseUrl } from "../utils/supabaseClient";
import { toast } from "sonner";

const aiTools = ["Sora", "Runway Gen-3", "Runway Gen-2", "Pika Labs", "Luma Dream Machine", "Kling AI", "기타"];
const categories = ["AI영화", "AI드라마", "AI애니메이션", "AI다큐멘터리", "AI뮤직비디오", "SF", "액션", "로맨스", "공포", "판타지", "드라마", "코미디", "자연/풍경", "추상", "기타"];
const resolutions = ["720p", "1080p", "4K", "8K"];
const genres = ["SF", "액션", "로맨스", "공포", "판타지", "드라마", "코미디", "다큐멘터리", "자연/풍경", "추상", "기타"];
const languages = ["한국어", "영어", "일본어", "중국어", "스페인어", "프랑스어", "독일어", "무음/instrumental", "기타"];

interface UploadProps {
  onSignInClick?: () => void;
  onViewMyProducts?: () => void;
}

export function Upload({ onSignInClick, onViewMyProducts }: UploadProps) {
  const { user, accessToken } = useAuth();
  const [step, setStep] = useState(1);
  const [uploadMethod, setUploadMethod] = useState<"single" | "bulk" | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [bunnyVideoId, setBunnyVideoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [forceUpdate, setForceUpdate] = useState(0); // 강제 리렌더링용
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    genre: "",
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
    // 가격
    standardPrice: "",
    commercialPrice: "",
    exclusivePrice: "",
    tags: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [showBunnyGuide, setShowBunnyGuide] = useState(false);

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

  // 태그 칩(Pill) 입력
  const [tagInput, setTagInput] = useState("");

  // 드래프트 자동저장 — 초기 로드 완료 플래그
  const [draftLoaded, setDraftLoaded] = useState(false);

  // 하이라이트 구간 (홈 피드/큐레이션 노출용 10~30초)
  const [videoDurationSec, setVideoDurationSec] = useState(0);
  const [highlight, setHighlight] = useState<{ start: number; end: number }>({ start: 0, end: 15 });
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fileObjectUrlRef = useRef<string | null>(null);

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
      toast.info("이미 추가된 태그입니다.");
      return;
    }
    if (tagsList.length >= 10) {
      toast.warning("태그는 최대 10개까지 추가할 수 있습니다.");
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
        draft.formData?.standardPrice || draft.formData?.commercialPrice;
      if (!hasContent) {
        setDraftLoaded(true);
        return;
      }

      toast.info("이전에 작성하던 업로드가 있습니다.", {
        description: `${new Date(draft.savedAt).toLocaleString()} 자동 저장됨`,
        action: {
          label: "이어 작성",
          onClick: () => {
            setStep(draft.step || 1);
            setUploadMethod(draft.uploadMethod || null);
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
      uploadMethod,
      formData,
      agreedToTerms,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (e) {
      console.warn("Draft save failed (storage limit?):", e);
    }
  }, [step, uploadMethod, formData, agreedToTerms, user, draftKey, draftLoaded, uploadComplete]);

  // 업로드 완료 시 드래프트 삭제
  useEffect(() => {
    if (uploadComplete && draftKey) {
      localStorage.removeItem(draftKey);
    }
  }, [uploadComplete, draftKey]);

  // 사이즈/시간 포맷터
  const formatBytes = (bytes: number): string => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds) || seconds < 0) return "계산 중...";
    if (seconds < 60) return `${Math.round(seconds)}초`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 ${Math.round(seconds % 60)}초`;
    return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`;
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
      toast.error('지원하지 않는 파일 형식입니다. MP4, MOV, AVI 파일만 업로드 가능합니다.');
      return;
    }

    // 파일 크기 검증 (5GB)
    const maxSize = 5 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('파일 크기가 5GB를 초과합니다.');
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
      toast.success(`영상 정보: ${resolution}, ${formattedDuration}`);

      // 2.5. 하이라이트 기본 구간 설정 (영상 중간 15초)
      setVideoDurationSec(duration);
      if (duration <= 15) {
        // 짧은 영상은 전체를 하이라이트로
        setHighlight({ start: 0, end: duration });
      } else {
        const defaultStart = Math.max(0, duration * 0.4);
        const defaultEnd = Math.min(duration, defaultStart + 15);
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
      toast.warning('동영상 정보를 자동으로 가져오지 못했습니다. 직접 입력해 주세요.');
    };
  };

  // 커스텀 썸네일 업로드
  const handleCustomThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('썸네일은 5MB 이하만 가능합니다.');
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
    return (
      <div className="h-full flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md mx-auto">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] mx-auto mb-6 flex items-center justify-center">
            <UploadIcon className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl mb-3">로그인이 필요합니다</h2>
          <p className="text-muted-foreground mb-6">
            영상을 업로드하고 마켓에 등록하려면 먼저 로그인해주세요.
          </p>
          <Button 
            onClick={onSignInClick}
            className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] py-6 text-lg"
          >
            로그인 / 회원가입
          </Button>
        </div>
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
  const setBunnyThumbnail = async (
    videoId: string,
    libraryId: string,
    apiKey: string,
    thumbnailDataUrl: string
  ): Promise<void> => {
    const blob = await downscaleToJpegBlob(thumbnailDataUrl, 1280, 720, 0.85);
    const url = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}/thumbnail`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        AccessKey: apiKey,
        "Content-Type": blob.type || "image/jpeg",
      },
      body: blob,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Bunny thumbnail upload failed: ${response.status} ${text}`);
    }
  };

  // Bunny.net에 직접 업로드
  const uploadToBunny = async (file: File, videoId: string, libraryId: string, apiKey: string) => {
    if (!apiKey) {
      throw new Error('Bunny.net API Key가 제공되지 않았습니다.');
    }
    
    const uploadUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      const startTime = Date.now();
      let lastLoaded = 0;
      let lastTime = startTime;
      let smoothedSpeed = 0; // 지수 이동 평균으로 속도 안정화

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const now = Date.now();
          const dt = (now - lastTime) / 1000;
          const dl = e.loaded - lastLoaded;

          if (dt > 0.2) {
            const instSpeed = dl / dt; // bytes/s
            // 새 측정치에 70% 가중, 기존 평균에 30% — 안정적인 ETA를 위해
            smoothedSpeed = smoothedSpeed === 0 ? instSpeed : smoothedSpeed * 0.3 + instSpeed * 0.7;
            lastLoaded = e.loaded;
            lastTime = now;
          }

          const remaining = e.total - e.loaded;
          const eta = smoothedSpeed > 0 ? remaining / smoothedSpeed : 0;

          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
          setUploadStats({ loaded: e.loaded, total: e.total, speed: smoothedSpeed, eta });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          console.log('Upload complete to Bunny.net');
          resolve();
        } else {
          console.error('Upload failed:', xhr.status, xhr.responseText);
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        console.error('Upload error');
        reject(new Error('Network error during upload'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('AccessKey', apiKey);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(file);
    });
  };

  // form onSubmit (또는 "업로드 완료" 클릭) → 미리보기 모달 오픈
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) {
      toast.error('저작권 서약에 동의해 주세요.');
      return;
    }
    if (!selectedFile) {
      toast.error('파일을 선택해주세요.');
      return;
    }
    setShowPreview(true);
  };

  // 실제 업로드 수행 (미리보기 모달의 "확인하고 업로드" 버튼이 호출)
  const performUpload = async () => {
    setShowPreview(false);

    if (!user || !accessToken) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    if (!selectedFile) {
      toast.error('파일을 선택해주세요.');
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
        throw new Error('인증 토큰을 찾을 수 없습니다. 다시 로그인해 주세요.');
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
        toast.error(`업로드 서버 오류: ${errorData.error || createResponse.statusText}`);
        throw new Error(errorData.error || `Failed to create video (${createResponse.status})`);
      }

      const createData = await createResponse.json();
      const { videoId, libraryId, apiKey: serverApiKey } = createData;
      console.log('Video created:', videoId);
      setBunnyVideoId(videoId);

      // 2. Bunny.net에 직접 업로드
      console.log('Uploading file to Bunny.net...');
      await uploadToBunny(selectedFile, videoId, libraryId, serverApiKey);
      console.log('File uploaded successfully');

      // 2.5. 커스텀 썸네일 Bunny에 업로드 (선택된 경우)
      // 자동 추출 프레임 또는 사용자 업로드 이미지를 Bunny Stream에 직접 전송
      // 실패해도 Bunny 자동 썸네일이 폴백되므로 치명적이지 않음
      if (selectedThumbnail) {
        console.log('Setting custom thumbnail on Bunny...');
        toast.info('썸네일 처리 중...');
        try {
          await setBunnyThumbnail(videoId, libraryId, serverApiKey, selectedThumbnail);
          console.log('Custom thumbnail set successfully');
        } catch (thumbErr) {
          console.warn('Thumbnail upload failed, falling back to Bunny default:', thumbErr);
          toast.warning('썸네일 업로드 실패 — 자동 생성 썸네일이 사용됩니다.');
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
        tags: formData.tags || "",
        standardPrice: stripCommas(formData.standardPrice) || "0",
        commercialPrice: stripCommas(formData.commercialPrice) || "0",
        exclusivePrice: stripCommas(formData.exclusivePrice) || "0",
        aiTool: formData.aiTool || '',
        aiModelVersion: formData.aiModelVersion || '',
        category: formData.category || '',
        genre: formData.genre || '',
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
        // 공개 설정
        visibility: formData.visibility || 'public',
        // 하이라이트 구간 (홈 피드/큐레이션 노출용)
        highlightStart: highlight.start,
        highlightEnd: highlight.end,
        status: 'ready'
      };

      const saveUrl = `https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/videos/save-metadata`;
      console.log('Saving metadata to:', saveUrl);
      
      const saveResponse = await fetch(
        saveUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`,
            'apikey': supabaseAnonKey
          },
          body: JSON.stringify(metadata),
        }
      );

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json().catch(() => ({}));
        console.error('Metadata saving failed:', errorData);
        throw new Error(errorData.error || `데이터 저장 실패 (${saveResponse.status})`);
      }

      console.log('Metadata saved successfully via Edge Function');
      setUploadComplete(true);
      toast.success('영상이 성공적으로 업로드되었습니다!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setUploadComplete(false);
    setStep(1);
    setUploadMethod(null);
    setSelectedFile(null);
    setBunnyVideoId(null);
    setUploadProgress(0);
    setUploadStats({ loaded: 0, total: 0, speed: 0, eta: 0 });
    setThumbnailOptions([]);
    setSelectedThumbnail(null);
    setSelectedThumbnailIndex(-1);
    setCustomThumbnail(null);
    setTagInput("");
    setVideoDurationSec(0);
    setHighlight({ start: 0, end: 15 });
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
      standardPrice: "",
      commercialPrice: "",
      exclusivePrice: "",
      tags: "",
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
          <h2 className="text-2xl mb-3">업로드 완료!</h2>
          <p className="text-muted-foreground mb-6">
            영상이 성공적으로 등록되었습니다.<br />
            현재 AI가 홈 피드를 위한 <strong>최적의 하이라이트 구간</strong>을 분석하고 있습니다.<br />
            분석이 완료되면 마켓과 홈 피드에 자동으로 게시됩니다.
          </p>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={resetForm}
              className="flex-1"
            >
              계속 업로드
            </Button>
            <Button 
              className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
              onClick={onViewMyProducts}
            >
              내 상품 보기
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!uploadMethod) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-6">
        <div className="max-w-2xl w-full mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl mb-2">영상 업로드</h2>
            <p className="text-muted-foreground">업로드 방식을 선택하세요</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setUploadMethod("single")}
              className="p-6 border-2 border-border rounded-lg hover:border-[#6366f1] transition-colors text-left group"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] mb-4 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Video className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg mb-2">단건 업로드</h3>
              <p className="text-sm text-muted-foreground">
                한 개의 영상을 상세 정보와 함께 등록합니다
              </p>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setUploadMethod("bulk")}
              className="p-6 border-2 border-border rounded-lg hover:border-[#6366f1] transition-colors text-left group"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#3b82f6] mb-4 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg mb-2">대량 업로드</h3>
              <p className="text-sm text-muted-foreground">
                CSV 파일로 여러 영상을 한번에 등록합니다
              </p>
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  if (uploadMethod === "bulk") {
    return (
      <div className="h-full overflow-y-auto bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setUploadMethod(null)}
            className="text-muted-foreground mb-4 hover:text-foreground"
          >
            ← 뒤로
          </button>

          <h2 className="text-2xl mb-6">대량 업로드</h2>

          <div className="space-y-6">
            <div className="p-6 border-2 border-dashed border-border rounded-lg text-center">
              <UploadIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="mb-2">CSV 템플릿을 다운로드하고 작성해주세요</p>
              <Button variant="outline" className="mb-4">
                템플릿 다운로드
              </Button>
              <p className="text-sm text-muted-foreground mb-4">또는</p>
              <Button className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
                작성한 CSV 업로드
              </Button>
            </div>

            <div className="bg-card p-6 rounded-lg border border-border">
              <h3 className="mb-4">CSV 파일 작성 가이드</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• 파일명, 제목, 설명, 카테고리, AI 툴, 해상도, 길이 필수 입력</li>
                <li>• 가격은 Standard, Commercial, Exclusive 순서로 입력</li>
                <li>• 태그는 쉼표(,)로 구분하여 입력</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <button
          onClick={() => setUploadMethod(null)}
          className="text-muted-foreground mb-4 hover:text-foreground"
        >
          ← 뒤로
        </button>

        {/* Bunny Setup Guide Modal */}
        <BunnySetupGuide 
          open={showBunnyGuide} 
          onClose={() => setShowBunnyGuide(false)} 
        />

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
          <div className="absolute top-4 right-4 z-50 pointer-events-none opacity-20 text-[8px] text-white">v1.1.1-final</div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>파일 업로드</span>
            <span>상품 정보</span>
            <span>가격 설정</span>
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
                      크기: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mb-2">영상 파일을 드래그하거나 클릭하여 업로드</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      지원 형식: MP4, MOV, AVI (최대 5GB)
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
                  {selectedFile ? '다른 파일 선택' : '파일 선택'}
                </Button>
              </div>

              {/* 썸네일 선택 — 영상 프레임 자동 추출 + 커스텀 업로드 */}
              {selectedFile && thumbnailOptions.length > 0 && (
                <div className="bg-card p-4 rounded-lg border border-border">
                  <Label className="mb-3 block">
                    썸네일 선택{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      (홈 피드/마켓에 표시될 대표 이미지)
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
                          <img src={frame} alt={`프레임 ${i + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-medium">
                            {["시작", "중간", "마지막"][i] || `${i + 1}`}
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
                    {customThumbnail ? "커스텀 썸네일 변경" : "커스텀 이미지 업로드"}
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
                    하이라이트 구간{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      (홈 피드/큐레이션에 노출될 5~30초)
                    </span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    홈 피드와 큐레이션 행에서 자동 재생되는 미리보기 구간을 직접 정하세요. 영상의 가장 인상적인 부분을 선택하면 클릭률이 올라갑니다.
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
                      시작 <span className="text-white font-semibold">{formatSeconds(highlight.start)}</span>
                    </span>
                    <span className="px-2 py-1 rounded bg-[#6366f1]/15 text-[#a78bfa] font-bold">
                      {(highlight.end - highlight.start).toFixed(1)}초
                    </span>
                    <span className="text-muted-foreground">
                      종료 <span className="text-white font-semibold">{formatSeconds(highlight.end)}</span>
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
                    ▶ 선택 구간 미리보기 재생
                  </button>
                </div>
              )}

              <div className="bg-card p-4 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground">
                  ℹ️ 업로드된 영상에는 자동으로 CREAITE 워터마크가 삽입됩니다.
                  구매자는 결제 후 워터마크가 제거된 원본을 다운로드할 수 있습니다.
                </p>
              </div>

              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!selectedFile}
                className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-50"
              >
                다음
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <Label htmlFor="title">영상 제목 *</Label>
                  <span className={`text-xs ${formData.title.length > 50 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {formData.title.length}/60
                  </span>
                </div>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="예: 우주를 여행하는 코스믹 저니 — 4K 시네마틱"
                  className="bg-card"
                  maxLength={60}
                  required
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <Label htmlFor="description">상품 설명 *</Label>
                  <span className={`text-xs ${formData.description.length > 450 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {formData.description.length}/500
                  </span>
                </div>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="영상의 특징, 분위기, 활용 가능한 용도, 사용된 AI 툴/기법 등을 자세히 설명해주세요. 잘 작성된 설명은 검색·추천에 도움이 됩니다."
                  rows={6}
                  className="bg-card resize-y"
                  maxLength={500}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category" className="mb-2 block">카테고리 *</Label>
                  <select
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                    required
                  >
                    <option value="">선택</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="genre" className="mb-2 block">장르 *</Label>
                  <select
                    id="genre"
                    value={formData.genre}
                    onChange={(e) => setFormData({...formData, genre: e.target.value})}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                    required
                  >
                    <option value="">선택</option>
                    {genres.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="aiTool" className="mb-2 block">사용 AI 툴 *</Label>
                  <select
                    id="aiTool"
                    value={formData.aiTool}
                    onChange={(e) => setFormData({...formData, aiTool: e.target.value})}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                    required
                  >
                    <option value="">선택</option>
                    {aiTools.map(tool => (
                      <option key={tool} value={tool}>{tool}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="aiModelVersion" className="mb-2 block">
                    모델 버전 <span className="text-xs text-muted-foreground font-normal">(선택)</span>
                  </Label>
                  <Input
                    id="aiModelVersion"
                    value={formData.aiModelVersion}
                    onChange={(e) => setFormData({ ...formData, aiModelVersion: e.target.value })}
                    placeholder="예: v2.1, Turbo"
                    className="bg-card"
                    maxLength={30}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="resolution" className="mb-2 block">해상도 *</Label>
                  <select
                    key={`resolution-${forceUpdate}`}
                    id="resolution"
                    value={formData.resolution}
                    onChange={(e) => setFormData({...formData, resolution: e.target.value})}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm"
                    required
                  >
                    <option value="">선택</option>
                    {resolutions.map(res => (
                      <option key={res} value={res}>{res}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="duration" className="mb-2 block">영상 길이 *</Label>
                  <Input
                    id="duration"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: e.target.value})}
                    placeholder="예: 0:15"
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
                    <span className="font-semibold">AI 제작 증빙</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a78bfa]">선택</span>
                  </div>
                  <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 space-y-4 border-t border-border">
                  <p className="text-xs text-muted-foreground pt-3">
                    AI 제작 증빙은 저작권 분쟁 시 강력한 증거가 되며, 다른 크리에이터에게 영감을 줍니다.
                  </p>
                  <div>
                    <Label htmlFor="prompt" className="mb-2 block text-sm">사용한 프롬프트</Label>
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
                    <Label htmlFor="seed" className="mb-2 block text-sm">시드값 (재현용)</Label>
                    <Input
                      id="seed"
                      value={formData.seed}
                      onChange={(e) => setFormData({ ...formData, seed: e.target.value })}
                      placeholder="예: 1234567890"
                      className="bg-background"
                      maxLength={50}
                    />
                  </div>
                </div>
              </details>

              {/* ━━━ 시네마 메타데이터 (선택) ━━━ */}
              <details className="group rounded-lg border border-border bg-card/50 overflow-hidden" open>
                <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between hover:bg-card transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🎬</span>
                    <span className="font-semibold">시네마 메타데이터</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a78bfa]">선택</span>
                  </div>
                  <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <div className="px-4 pb-4 space-y-4 border-t border-border">
                  <p className="text-xs text-muted-foreground pt-3">
                    영화 크레딧처럼 작품 정보를 기록하세요. 작품 페이지에 영화 같은 디테일이 추가됩니다.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="director" className="mb-2 block text-sm">감독</Label>
                      <Input
                        id="director"
                        value={formData.director}
                        onChange={(e) => setFormData({ ...formData, director: e.target.value })}
                        placeholder="예: 홍길동"
                        className="bg-background"
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <Label htmlFor="writer" className="mb-2 block text-sm">각본</Label>
                      <Input
                        id="writer"
                        value={formData.writer}
                        onChange={(e) => setFormData({ ...formData, writer: e.target.value })}
                        placeholder="예: 김작가"
                        className="bg-background"
                        maxLength={50}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="composer" className="mb-2 block text-sm">음악</Label>
                      <Input
                        id="composer"
                        value={formData.composer}
                        onChange={(e) => setFormData({ ...formData, composer: e.target.value })}
                        placeholder="예: AI Suno v3"
                        className="bg-background"
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <Label htmlFor="productionYear" className="mb-2 block text-sm">제작 연도</Label>
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
                    <Label htmlFor="cast" className="mb-2 block text-sm">출연 / 가상 캐릭터</Label>
                    <Input
                      id="cast"
                      value={formData.cast}
                      onChange={(e) => setFormData({ ...formData, cast: e.target.value })}
                      placeholder="예: Aria, Captain Voss (콤마로 구분)"
                      className="bg-background"
                      maxLength={200}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="language" className="mb-2 block text-sm">언어</Label>
                      <select
                        id="language"
                        value={formData.language}
                        onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">선택</option>
                        {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="subtitleLanguage" className="mb-2 block text-sm">자막 언어</Label>
                      <select
                        id="subtitleLanguage"
                        value={formData.subtitleLanguage}
                        onChange={(e) => setFormData({ ...formData, subtitleLanguage: e.target.value })}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">없음</option>
                        {languages.filter(l => l !== "무음/instrumental").map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </details>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <Label htmlFor="tags">태그</Label>
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
                        aria-label={`${tag} 삭제`}
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
                    placeholder={tagsList.length === 0 ? "Enter 또는 쉼표로 추가 (예: 우주, 코스믹)" : ""}
                    className="flex-1 min-w-[140px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Enter나 쉼표로 추가, 빈 칸에서 Backspace로 마지막 태그 삭제
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  이전
                </Button>
                <Button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
                >
                  다음
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
                      <span className="font-medium">업로드 중...</span>
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
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">진행</p>
                      <p className="text-xs font-bold text-white">
                        {formatBytes(uploadStats.loaded)} <span className="text-muted-foreground font-normal">/ {formatBytes(uploadStats.total)}</span>
                      </p>
                    </div>
                    <div className="bg-background/50 rounded-md py-2 px-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">속도</p>
                      <p className="text-xs font-bold text-white">{formatBytes(uploadStats.speed)}/s</p>
                    </div>
                    <div className="bg-background/50 rounded-md py-2 px-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">남은 시간</p>
                      <p className="text-xs font-bold text-white">{formatTime(uploadStats.eta)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 공개 설정 */}
              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="mb-1">공개 설정</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  영상이 누구에게 노출될지 결정합니다. Exclusive 라이선스 판매 후엔 자동으로 비공개 처리됩니다.
                </p>

                <div className="space-y-2">
                  {([
                    { value: "public", icon: "🌐", label: "전체 공개", desc: "검색·홈 피드·시네마 탭에 모두 노출" },
                    { value: "unlisted", icon: "🔗", label: "일부 공개", desc: "링크를 받은 사람만 볼 수 있음 (검색 안 됨)" },
                    { value: "private", icon: "🔒", label: "비공개", desc: "본인과 승인된 구매자만 볼 수 있음" },
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

              <div className="bg-card p-6 rounded-lg border border-border">
                <h3 className="mb-4">라이선스별 가격 설정</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="standard" className="mb-2 block">Standard 라이선스</Label>
                    <Input
                      id="standard"
                      type="text"
                      value={formData.standardPrice}
                      onChange={(e) => setFormData({...formData, standardPrice: formatWithCommas(e.target.value)})}
                      placeholder="19,000"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      유튜브, 개인 SNS 용도
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="commercial" className="mb-2 block">Commercial 라이선스</Label>
                    <Input
                      id="commercial"
                      type="text"
                      value={formData.commercialPrice}
                      onChange={(e) => setFormData({...formData, commercialPrice: formatWithCommas(e.target.value)})}
                      placeholder="59,000"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      기업 광고, 마케팅 용도
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="exclusive" className="mb-2 block">Exclusive 라이선스</Label>
                    <Input
                      id="exclusive"
                      type="text"
                      value={formData.exclusivePrice}
                      onChange={(e) => setFormData({...formData, exclusivePrice: formatWithCommas(e.target.value)})}
                      placeholder="299,000"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      독점 사용권, 구매 후 마켓에서 숨김
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border space-y-4">
                <h3>저작권 서약</h3>
                
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                    className="border-zinc-400 dark:border-zinc-300"
                  />
                  <label htmlFor="terms" className="text-sm leading-relaxed">
                    본 영상은 타인의 저작권을 침해하지 않았으며, 상업적 이용이 가능한 요금제를 사용하여 제작되었음을 확인합니다. 
                    허위 사실 기재 시 법적 책임은 전적으로 본인에게 있음에 동의합니다.
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
                  이전
                </Button>
                <Button
                  type="submit"
                  disabled={!agreedToTerms || isUploading}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      업로드 중...
                    </>
                  ) : (
                    '업로드 완료'
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
              <DialogTitle>업로드 전 미리보기</DialogTitle>
              <DialogDescription>
                등록 후 마켓에 이렇게 표시됩니다. 모든 정보가 정확한지 확인하세요.
              </DialogDescription>
            </DialogHeader>

            {/* 마켓 카드 시뮬레이션 */}
            <div className="bg-[#1a1a1c] rounded-2xl overflow-hidden border border-white/10">
              <div className="aspect-video bg-black relative">
                {selectedThumbnail ? (
                  <img src={selectedThumbnail} alt="thumbnail" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    썸네일 없음
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
                  {formData.title || "제목 없음"}
                </h3>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">AI</span>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">
                    {user?.name || user?.email?.split("@")[0] || "Creator"}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mb-3 line-clamp-2">
                  {formData.description || "설명 없음"}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div>
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Price (Standard)</span>
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
                <p className="text-muted-foreground mb-0.5">공개 설정</p>
                <p className="font-semibold">
                  {formData.visibility === "public" && "🌐 전체 공개"}
                  {formData.visibility === "unlisted" && "🔗 일부 공개"}
                  {formData.visibility === "private" && "🔒 비공개"}
                </p>
              </div>
              <div className="bg-card p-3 rounded border border-border">
                <p className="text-muted-foreground mb-0.5">하이라이트 구간</p>
                <p className="font-semibold">
                  {formatSeconds(highlight.start)} ~ {formatSeconds(highlight.end)}
                  <span className="text-muted-foreground font-normal ml-1">
                    ({(highlight.end - highlight.start).toFixed(1)}초)
                  </span>
                </p>
              </div>
              <div className="bg-card p-3 rounded border border-border">
                <p className="text-muted-foreground mb-0.5">카테고리 / 장르</p>
                <p className="font-semibold">
                  {formData.category || "—"} / {formData.genre || "—"}
                </p>
              </div>
              <div className="bg-card p-3 rounded border border-border">
                <p className="text-muted-foreground mb-0.5">라이선스 가격</p>
                <p className="font-semibold text-[11px] leading-relaxed">
                  S ₩{formData.standardPrice || "0"} · C ₩{formData.commercialPrice || "0"} · E ₩{formData.exclusivePrice || "0"}
                </p>
              </div>
              {(formData.director || formData.writer || formData.composer) && (
                <div className="bg-card p-3 rounded border border-border col-span-2">
                  <p className="text-muted-foreground mb-0.5">시네마 크레딧</p>
                  <p className="font-semibold text-[11px]">
                    {formData.director && `감독 ${formData.director}`}
                    {formData.writer && ` · 각본 ${formData.writer}`}
                    {formData.composer && ` · 음악 ${formData.composer}`}
                  </p>
                </div>
              )}
              {tagsList.length > 0 && (
                <div className="bg-card p-3 rounded border border-border col-span-2">
                  <p className="text-muted-foreground mb-1">태그 ({tagsList.length})</p>
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
                돌아가서 수정
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
                    업로드 중...
                  </>
                ) : (
                  "확인하고 업로드"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}