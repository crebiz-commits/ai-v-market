import { useState, useRef, useMemo, useCallback } from "react";
import { Upload as UploadIcon, Video, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
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
    resolution: "",
    duration: "",
    prompt: "",
    creativityDescription: "",
    standardPrice: "",
    commercialPrice: "",
    exclusivePrice: "",
    tags: "",
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [showBunnyGuide, setShowBunnyGuide] = useState(false);

  // 파일 선택 핸들러
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
    const maxSize = 5 * 1024 * 1024 * 1024; // 5GB in bytes
    if (file.size > maxSize) {
      toast.error('파일 크기가 5GB를 초과합니다.');
      return;
    }

    setSelectedFile(file);

    // 영상 정보 자동 측정 (길이, 해상도)
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      
      // 1. 영상 길이 측정
      const duration = video.duration;
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      // 2. 해상도 측정
      const width = video.videoWidth;
      const height = video.videoHeight;
      let resolution = '';
      
      console.log('Raw video dimensions:', { width, height });
      
      // 해상도 자동 판별
      if (height >= 4320) {
        resolution = '8K';
      } else if (height >= 2160) {
        resolution = '4K';
      } else if (height >= 1080) {
        resolution = '1080p';
      } else if (height >= 720) {
        resolution = '720p';
      } else {
        resolution = '1080p'; // 기본값
      }
      
      console.log('Detected resolution:', resolution);
      console.log('Video metadata detected:', {
        duration: formattedDuration,
        resolution: `${width}x${height} (${resolution})`,
      });
      
      // 상태 업데이트 + 강제 리렌더링
      setFormData(prev => {
        const updated = {
          ...prev,
          duration: formattedDuration,
          resolution: resolution
        };
        console.log('Updated formData:', updated);
        return updated;
      });
      
      // 강제 리렌더링 트리거 (약간의 지연 후)
      setTimeout(() => {
        setForceUpdate(prev => prev + 1);
        console.log('Force update triggered, resolution should now be:', resolution);
      }, 100);
      
      toast.success(`영상 정보: ${resolution}, ${formattedDuration}`);
    };
    
    video.onerror = (e) => {
      const error = video.error;
      console.error('Failed to read video metadata:', {
        code: error?.code,
        message: error?.message,
        event: e
      });
      // v1.0.7: 에러 메시지 브라우저 캐시 방지를 위해 버전 명시
      toast.warning('동영상 정보를 자동으로 가져오지 못했습니다. 직접 입력해 주세요. (v1.0.7)');
    };
    
    video.src = URL.createObjectURL(file);

    // 모바일 환경 대응: 10초 후에도 메타데이터가 로드되지 않으면 소스 정리 (업로드는 가능하게 유지)
    const cleanupTimeout = setTimeout(() => {
      if (video.src) {
        window.URL.revokeObjectURL(video.src);
        video.src = '';
        console.log('Metadata extraction timed out, source revoked.');
      }
    }, 10000);

    // 성공 시 타임아웃 해제
    const originalOnLoaded = video.onloadedmetadata;
    video.onloadedmetadata = (e) => {
      clearTimeout(cleanupTimeout);
      if (typeof originalOnLoaded === 'function') {
        originalOnLoaded.call(video, e);
      }
    };
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

  // Bunny.net에 직접 업로드
  const uploadToBunny = async (file: File, videoId: string, libraryId: string, apiKey: string) => {
    if (!apiKey) {
      throw new Error('Bunny.net API Key가 제공되지 않았습니다.');
    }
    
    const uploadUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentComplete);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
        category: formData.category || '',
        genre: formData.genre || '',
        prompt: formData.prompt || '',
        resolution: formData.resolution || '',
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
    setFormData({
      title: "",
      description: "",
      category: "",
      genre: "",
      aiTool: "",
      resolution: "",
      duration: "",
      prompt: "",
      creativityDescription: "",
      standardPrice: "",
      commercialPrice: "",
      exclusivePrice: "",
      tags: "",
    });
    setAgreedToTerms(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
            현재 AI가 탐색 피드를 위한 <strong>최적의 하이라이트 구간</strong>을 분석하고 있습니다.<br />
            분석이 완료되면 마켓과 탐색 피드에 자동으로 게시됩니다.
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

              <div className="bg-card p-4 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground">
                  ℹ️ 업로드된 영상에는 자동으로 AI-V-Market 워터마크가 삽입됩니다. 
                  구매자는 결제 후 워터마크가 제거된 원본을  다운로드할 수 있습니다.
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
                <Label htmlFor="title" className="mb-2 block">영상 제목 * (30자 제한)</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="예: 우주를 여행하는 코스믹 저니"
                  className="bg-card"
                  maxLength={30}
                  required
                />
              </div>

              <div>
                <Label htmlFor="description" className="mb-2 block">상품 설명 * (50자 제한)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="영상의 특징, 활용 가능한 용도 등을 자세히 설명해주세요"
                  rows={4}
                  className="bg-card"
                  maxLength={50}
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

              <div>
                <Label htmlFor="tags" className="mb-2 block">태그</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                  placeholder="쉼표로 구분 (예: 우주, 코스믹, 사이파이, 배경영상)"
                  className="bg-card"
                />
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
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="w-5 h-5 animate-spin text-[#6366f1]" />
                    <span className="font-medium">업로드 중...</span>
                  </div>
                  <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 text-center">
                    {uploadProgress}% 완료
                  </p>
                </div>
              )}

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
      </div>
    </div>
  );
}