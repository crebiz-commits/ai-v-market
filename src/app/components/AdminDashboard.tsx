import { useState, useEffect, useRef } from "react";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Play,
  BarChart2, Eye, MousePointerClick, Megaphone,
  ImageIcon, Video, Link, Calendar, Save, X, Loader2, ShieldAlert,
  Upload as UploadIcon
} from "lucide-react";
import { Button } from "./ui/button";
import { supabase, supabaseAnonKey } from "../utils/supabaseClient";
import { tusUploadToBunny } from "../utils/bunnyUpload";
import { BUNNY_HOST } from "../utils/bunnyHost";
import { HOME_FEED_SELF_ADS } from "../config/ads";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

const SUPABASE_PROJECT_ID = "tvbpiuwmvrccfnplhwer";
// ─────────────────────────────────────────────────────────────────

type AdType = "feed_display" | "video_preroll" | "overlay" | "hero_display";
// Phase 28: 광고 형식 (DB의 ads.format 컬럼)
type AdFormat = "feed" | "preroll" | "midroll" | "overlay" | "postroll" | "bumper" | "hero";
type AdTier = "home" | "cinema" | "ott";

// 광고 형식 메타데이터 (UI 표시용)
const AD_FORMAT_META: Record<AdFormat, { label: string; emoji: string; desc: string }> = {
  feed:     { label: "홈 피드 카드", emoji: "📰", desc: "홈 피드 영상 사이에 노출" },
  preroll:  { label: "Pre-roll",     emoji: "▶️", desc: "영상 재생 전 광고" },
  midroll:  { label: "Mid-roll",     emoji: "⏸",  desc: "재생 중간 광고 (10분+ OTT)" },
  overlay:  { label: "Overlay",      emoji: "🎯", desc: "재생 중 하단 배너 (1분+)" },
  postroll: { label: "Post-roll",    emoji: "⏭",  desc: "영상 종료 후 광고" },
  bumper:   { label: "Bumper",       emoji: "⚡", desc: "6초 SKIP 불가 광고" },
  hero:     { label: "OTT 히어로",   emoji: "🎬", desc: "OTT 상단 히어로 영상광고 (세로 소재)" },
};

const AD_CATEGORIES = ["AI영화", "AI드라마", "AI애니메이션", "AI다큐멘터리", "AI뮤직비디오", "SF", "액션", "로맨스", "공포", "판타지", "드라마", "코미디", "자연/풍경", "추상", "기타"];

// 기존 ad_type → 새 format 매핑 (호환성)
const AD_TYPE_TO_FORMAT: Record<AdType, AdFormat> = {
  feed_display: "feed",
  video_preroll: "preroll",
  overlay: "overlay",
  hero_display: "hero",
};
// 노출면 상호 배타: overlay 는 ad_type='overlay' 로 (피드 쿼리 ad_type='feed_display' 와 분리).
const FORMAT_TO_AD_TYPE: Record<AdFormat, AdType> = {
  feed: "feed_display",
  preroll: "video_preroll",
  midroll: "video_preroll",
  overlay: "overlay",
  postroll: "video_preroll",
  bumper: "video_preroll",
  hero: "hero_display",
};

interface Ad {
  id: string;
  title: string;
  advertiser: string;
  status?: string | null;   // 심사 상태(approved/pending_review/rejected/draft) — 노출 게이트는 approved 만
  image_url: string | null;
  image_url_mobile: string | null;   // 모바일 피드 카드 전용(선택). 없으면 image_url 폴백.
  video_url: string | null;
  thumbnail_url: string | null;
  link_url: string;
  cta_text: string;
  interval_count: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  created_at: string;
  // 비디오 pre-roll 광고 (Phase 2)
  ad_type: AdType;
  skip_offset: number;
  max_duration: number;
  weight: number;
  // Phase 8.5: 광고 예산 회계
  budget_krw: number | null;
  spent_krw: number;
  // Phase 28: 광고 형식 다변화
  format: AdFormat;
  trigger_position_pct: number | null;
  duration_seconds: number | null;
  skip_after_seconds: number | null;
  target_tiers: AdTier[] | null;
  target_categories: string[] | null;
  min_video_duration_sec: number;
  // 소유자: NULL=자체광고(운영팀 직접), 값 있음=광고주 셀프서비스 등록 광고
  owner_id?: string | null;
}

const emptyForm = (): Omit<Ad, "id" | "impressions" | "clicks" | "created_at" | "spent_krw"> => ({
  title: "",
  advertiser: "",
  image_url: null,
  image_url_mobile: null,
  video_url: null,
  thumbnail_url: null,
  link_url: "",
  cta_text: "자세히 보기",
  interval_count: 4,
  is_active: true,
  starts_at: null,
  ends_at: null,
  ad_type: "feed_display",
  skip_offset: 5,
  max_duration: 30,
  weight: 1,
  budget_krw: null,  // 하우스 광고 기본 = 무제한(null). 값을 넣으면 소진(spent_krw≥budget) 시 자동중단되므로 비워둠.
  // Phase 28
  format: "feed",
  trigger_position_pct: null,
  duration_seconds: null,
  skip_after_seconds: 5,
  target_tiers: null,
  target_categories: null,
  min_video_duration_sec: 0,
});

// 광고 형식 변경 시 형식별 기본값을 자동 설정
function applyFormatDefaults(prev: ReturnType<typeof emptyForm>, format: AdFormat): ReturnType<typeof emptyForm> {
  const base = { ...prev, format, ad_type: FORMAT_TO_AD_TYPE[format] };
  switch (format) {
    case "feed":
      return { ...base, trigger_position_pct: null, duration_seconds: null, skip_after_seconds: null, min_video_duration_sec: 0 };
    case "preroll":
      return { ...base, trigger_position_pct: 0, duration_seconds: prev.max_duration || 30, skip_after_seconds: prev.skip_offset ?? 5, min_video_duration_sec: 0 };
    case "midroll":
      return { ...base, trigger_position_pct: 50, duration_seconds: 30, skip_after_seconds: 5, target_tiers: ["ott"], min_video_duration_sec: 600 };
    case "overlay":
      return { ...base, trigger_position_pct: 30, duration_seconds: 10, skip_after_seconds: null, min_video_duration_sec: 60 };
    case "postroll":
      return { ...base, trigger_position_pct: 100, duration_seconds: 15, skip_after_seconds: 5, min_video_duration_sec: 0 };
    case "bumper":
      return { ...base, trigger_position_pct: 0, duration_seconds: 6, skip_after_seconds: null, min_video_duration_sec: 0 };
    case "hero":
      // OTT 히어로 영상광고 — 그냥 재생(트리거·스킵 없음), 세로 소재 30초 권장
      return { ...base, trigger_position_pct: null, duration_seconds: prev.max_duration || 30, skip_after_seconds: null, min_video_duration_sec: 0 };
    default:
      return base;
  }
}

function ctr(impressions: number, clicks: number) {
  if (impressions === 0) return "0%";
  return ((clicks / impressions) * 100).toFixed(1) + "%";
}

function fmt(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1) + "만";
  return n.toLocaleString();
}

export function AdminDashboard() {
  const { user, profile } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // 인라인 영상 프리뷰 (콘텐츠 관리와 동일) — 열린 광고 id
  const [previewId, setPreviewId] = useState<string | null>(null);
  // HLS(.m3u8) → 네이티브 <video> 미지원이라 mp4 렌디션으로 변환 (AdminContent·프리롤과 동일)
  const toMp4 = (url: string | null) =>
    url && url.includes("/playlist.m3u8") ? url.replace("/playlist.m3u8", "/play_720p.mp4") : url;
  // Bunny HLS(video_url)에서 썸네일 유도 — 영상 광고는 thumbnail_url 미설정이 많음(목록 표시용 폴백)
  const bunnyThumb = (url: string | null) =>
    url && url.includes("/playlist.m3u8") ? url.replace("/playlist.m3u8", "/thumbnail.jpg") : null;
  // 광고 목록 탭: 자체광고(owner_id 없음) / 광고주 광고(owner_id 있음)
  const [adTab, setAdTab] = useState<"house" | "advertiser">("house");

  // 광고 영상 직접 업로드 (Bunny에만 저장, videos 테이블 미등록)
  const adVideoFileRef = useRef<HTMLInputElement>(null);
  const [adUploading, setAdUploading] = useState(false);
  const [adUploadProgress, setAdUploadProgress] = useState(0);

  // 광고 이미지 직접 업로드 (Supabase Storage 'ad-images' 버킷)
  const adImageFileRef = useRef<HTMLInputElement>(null);
  const adImageMobileFileRef = useRef<HTMLInputElement>(null);   // 모바일 전용 이미지 업로드
  const [imgUploading, setImgUploading] = useState(false);

  const isAdmin = !!profile?.is_admin;

  // 광고 이미지 직접 업로드 핸들러 (target: 데스크탑 image_url / 모바일 image_url_mobile)
  // Supabase Storage 'ad-images' 버킷에 업로드 후 public URL을 폼에 자동 입력
  const handleAdImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, target: 'image_url' | 'image_url_mobile' = 'image_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 검증
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error("JPG·PNG·WebP·GIF 형식만 업로드 가능합니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("이미지는 10MB 이하여야 합니다.");
      return;
    }

    setImgUploading(true);

    try {
      // 파일명: timestamp-원본명 (충돌 방지)
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      // Supabase Storage에 업로드
      const { data, error } = await supabase.storage
        .from('ad-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // public URL 생성
      const { data: urlData } = supabase.storage
        .from('ad-images')
        .getPublicUrl(data.path);

      setForm(f => ({ ...f, [target]: urlData.publicUrl }));
      toast.success("이미지가 업로드됐습니다!");
    } catch (err: any) {
      console.error('Ad image upload error:', err);
      toast.error("업로드 실패: " + (err.message || '알 수 없는 에러'));
    } finally {
      setImgUploading(false);
      const ref = target === 'image_url_mobile' ? adImageMobileFileRef : adImageFileRef;
      if (ref.current) ref.current.value = '';
    }
  };

  // 광고 영상 직접 업로드 핸들러
  // - Bunny Stream에 영상 업로드 (create-upload + PUT)
  // - videos 테이블엔 저장 안 함 (마켓·홈피드 노출 차단)
  // - 업로드 완료 후 HLS URL을 폼의 video_url 필드에 자동 입력
  const handleAdVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 검증
    const validExts = ['.mp4', '.mov', '.avi'];
    const fileName = file.name.toLowerCase();
    if (!validExts.some(ext => fileName.endsWith(ext))) {
      toast.error("MP4, MOV, AVI 형식만 업로드 가능합니다.");
      return;
    }
    const maxSize = 500 * 1024 * 1024; // 광고는 500MB 제한 (보통 짧음)
    if (file.size > maxSize) {
      toast.error("광고 영상은 500MB 이하여야 합니다.");
      return;
    }

    setAdUploading(true);
    setAdUploadProgress(0);

    try {
      // 1. Bunny에 비디오 셸 생성
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("로그인이 필요합니다.");

      const createUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/server/videos/create-upload`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ title: form.title || `Ad: ${file.name}` }),
      });

      if (!createResponse.ok) {
        const err = await createResponse.json().catch(() => ({}));
        throw new Error(err.error || `Bunny 비디오 생성 실패 (${createResponse.status})`);
      }

      const { videoId, libraryId, tusSignature, tusExpire } = await createResponse.json();

      // 2. Bunny에 TUS presigned 업로드 — R1(2026-06-11): 라이브러리 키 클라이언트 전달 제거
      await tusUploadToBunny(file, { videoId, libraryId, tusSignature, tusExpire }, (loaded, total) => {
        setAdUploadProgress(Math.round((loaded / total) * 100));
      });

      // 3. HLS URL 구성 후 폼에 자동 입력 + 썸네일도 같은 videoId 에서 유도 저장(목록·포스터 표시용).
      //    (인코딩 완료 후 생성되므로 직후 잠시 404일 수 있으나, 목록 img onError 로 아이콘 폴백)
      const hlsUrl = `https://${BUNNY_HOST}/${videoId}/playlist.m3u8`;
      const thumbUrl = `https://${BUNNY_HOST}/${videoId}/thumbnail.jpg`;
      setForm(f => ({ ...f, video_url: hlsUrl, thumbnail_url: f.thumbnail_url || thumbUrl }));

      toast.success("광고 영상 업로드 완료! Bunny에 저장됐습니다 (마켓 노출 X)");
    } catch (err: any) {
      console.error('Ad video upload error:', err);
      toast.error("업로드 실패: " + (err.message || '알 수 없는 에러'));
    } finally {
      setAdUploading(false);
      setAdUploadProgress(0);
      if (adVideoFileRef.current) adVideoFileRef.current.value = '';
    }
  };

  useEffect(() => {
    if (isAdmin) fetchAds();
  }, [isAdmin]);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAds(data || []);
    } catch (err: any) {
      toast.error("광고 목록 로드 실패: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (ad: Ad) => {
    setEditingId(ad.id);
    // 기존 ad_type 으로 format 추론 (호환성: 마이그레이션 전 데이터)
    const inferredFormat: AdFormat = ad.format || AD_TYPE_TO_FORMAT[ad.ad_type || "feed_display"] || "feed";
    setForm({
      title: ad.title,
      advertiser: ad.advertiser,
      image_url: ad.image_url,
      image_url_mobile: ad.image_url_mobile,
      video_url: ad.video_url,
      thumbnail_url: ad.thumbnail_url,
      link_url: ad.link_url,
      cta_text: ad.cta_text,
      interval_count: ad.interval_count,
      is_active: ad.is_active,
      starts_at: ad.starts_at ? ad.starts_at.slice(0, 16) : null,
      ends_at: ad.ends_at ? ad.ends_at.slice(0, 16) : null,
      ad_type: ad.ad_type || FORMAT_TO_AD_TYPE[inferredFormat],
      skip_offset: ad.skip_offset ?? 5,
      max_duration: ad.max_duration ?? 30,
      weight: ad.weight ?? 1,
      budget_krw: ad.budget_krw,  // Phase 8.5
      // Phase 28
      format: inferredFormat,
      trigger_position_pct: ad.trigger_position_pct,
      duration_seconds: ad.duration_seconds,
      skip_after_seconds: ad.skip_after_seconds,
      target_tiers: ad.target_tiers,
      target_categories: ad.target_categories,
      min_video_duration_sec: ad.min_video_duration_sec ?? 0,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("광고명을 입력하세요."); return; }
    if (!form.link_url.trim()) { toast.error("랜딩 URL을 입력하세요."); return; }
    // 랜딩 URL 은 http(s) 만 — javascript:/data: 등 저장형 피싱·XSS 벡터 차단
    if (!/^https?:\/\//i.test(form.link_url.trim())) {
      toast.error("랜딩 URL 은 http:// 또는 https:// 로 시작해야 합니다.");
      return;
    }
    // 예산은 1원 이상 정수 — 0/음수는 즉시 '소진'으로 서빙에서 제외돼 조용히 미노출되므로 거부.
    //   무제한(자체광고)은 빈칸(null). (onChange 가 음수를 0으로 클램프하므로 여기서 0 도 거부해야 함)
    if (form.budget_krw != null && (form.budget_krw <= 0 || !Number.isFinite(form.budget_krw))) {
      toast.error("예산은 1원 이상이어야 합니다. 무제한은 비워두세요.");
      return;
    }

    // Phase 28: 형식별 입력 검증
    const videoFormats: AdFormat[] = ["preroll", "midroll", "postroll", "bumper", "hero"];
    if (videoFormats.includes(form.format) && !form.video_url?.trim()) {
      toast.error(`${AD_FORMAT_META[form.format].label} 광고는 Bunny 영상 URL이 필수입니다.`);
      return;
    }
    if ((form.format === "feed" || form.format === "overlay") && !form.image_url && !form.video_url) {
      toast.error("이미지 URL 또는 Bunny 영상 URL을 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        link_url: form.link_url.trim(),   // 앞뒤 공백 제거 — 서버 VAST safeLink(trim 없음)에서 클릭 죽던 것 방지
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
      };

      if (editingId) {
        const { error } = await supabase.from("ads").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("광고가 수정되었습니다.");
      } else {
        const { error } = await supabase.from("ads").insert(payload);
        if (error) throw error;
        toast.success("광고가 등록되었습니다.");
      }

      setShowForm(false);
      fetchAds();
    } catch (err: any) {
      toast.error("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ad: Ad) => {
    try {
      const { error } = await supabase
        .from("ads")
        .update({ is_active: !ad.is_active })
        .eq("id", ad.id);
      if (error) throw error;
      setAds(prev => prev.map(a => a.id === ad.id ? { ...a, is_active: !a.is_active } : a));
      toast.success(ad.is_active ? "광고가 비활성화되었습니다." : "광고가 활성화되었습니다.");
    } catch (err: any) {
      toast.error("상태 변경 실패: " + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const target = ads.find(a => a.id === id);
      const { error } = await supabase.from("ads").delete().eq("id", id);
      if (error) throw error;
      setAds(prev => prev.filter(a => a.id !== id));
      setDeleteConfirm(null);
      toast.success("광고가 삭제되었습니다.");
      // 첨부 이미지(ad-images 버킷) 정리 — best-effort(고아파일·비용 방지). Bunny 영상은 별도 GC.
      const marker = "/ad-images/";
      const iu = target?.image_url || "";
      const idx = iu.indexOf(marker);
      if (idx >= 0) {
        const path = iu.slice(idx + marker.length).split("?")[0];
        if (path) { const { error: rmErr } = await supabase.storage.from("ad-images").remove([path]); if (rmErr) console.warn("[AdminDashboard] ad-images 정리 실패:", rmErr.message); }
      }
    } catch (err: any) {
      toast.error("삭제 실패: " + err.message);
    }
  };

  // ── 접근 제한 ───────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <ShieldAlert className="w-12 h-12 text-[#6366f1]" />
        <p className="text-lg font-semibold">로그인이 필요합니다.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <p className="text-lg font-semibold text-foreground">접근 권한이 없습니다.</p>
        <p className="text-sm">관리자 계정으로 로그인해 주세요.</p>
        <p className="text-xs text-muted-foreground/50">현재 계정: {user.email}</p>
      </div>
    );
  }

  // ── 메인 대시보드 ────────────────────────────────────────────────
  // 자체광고(운영팀 직접 — 구글애드/오프라인 수주/계열사) vs 광고주 셀프서비스 등록 광고 분리
  const houseAds = ads.filter(a => !a.owner_id);
  const advertiserAds = ads.filter(a => a.owner_id);
  const visibleAds = adTab === "house" ? houseAds : advertiserAds;
  const totalImpressions = visibleAds.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = visibleAds.reduce((s, a) => s + a.clicks, 0);
  const activeCount = visibleAds.filter(a => a.is_active).length;

  // 광고 형식별로 필요한 소재/필드만 노출 (수정 폼) — 포맷마다 입력란이 달라 헷갈리던 문제 해소
  const ff = form.format;
  const showImageField    = ff === "feed" || ff === "overlay";      // 이미지 배너: 피드 카드 / 오버레이
  const showVideoField    = ff !== "overlay";                       // 영상 소재: 피드(영상)·프리롤·미드롤·포스트롤·범퍼
  const showVideoTargeting = ff !== "feed";                         // 영상에 붙는 광고만 tier/카테고리/최소영상길이 타겟 적용

  return (
    <div>
      {/* 광고 구분 탭 + (자체광고 탭에서만) 광고 추가 버튼 */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="inline-flex p-1 rounded-xl bg-muted/50 border border-border">
          {([
            ["house", "자체광고", houseAds.length],
            ["advertiser", "광고주 광고", advertiserAds.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setAdTab(key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                adTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label} <span className="text-xs opacity-70">{count}</span>
            </button>
          ))}
        </div>
        {adTab === "house" && (
          <Button
            onClick={openCreate}
            className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold"
          >
            <Plus className="w-4 h-4" />
            광고 추가
          </Button>
        )}
      </div>

      {/* 탭 설명 */}
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
        {adTab === "house"
          ? "운영팀이 직접 올리는 광고 — 구글애드/외부 애드 연결, 오프라인 수주, 계열사 광고."
          : "광고주가 광고센터에서 직접 등록·충전하는 셀프서비스 광고. 심사는 [광고 심사] 탭에서 처리합니다."}
      </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: Megaphone, label: "활성 광고", value: activeCount + "개", color: "text-[#6366f1]" },
            { icon: Eye,       label: "총 노출",   value: fmt(totalImpressions), color: "text-blue-400" },
            { icon: MousePointerClick, label: "총 클릭", value: fmt(totalClicks), color: "text-green-400" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <Icon className={`w-5 h-5 mb-2 ${color}`} />
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Ad List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
          </div>
        ) : visibleAds.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
            {adTab === "house" ? (
              <>
                <p>등록된 자체광고가 없습니다.</p>
                <p className="text-sm mt-1">위의 [광고 추가] 버튼으로 첫 광고를 만들어 보세요.</p>
              </>
            ) : (
              <>
                <p>광고주가 등록한 광고가 없습니다.</p>
                <p className="text-sm mt-1">광고주가 광고센터에서 등록하면 여기에 표시됩니다.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleAds.map(ad => {
              const isDepleted = ad.budget_krw != null && (ad.spent_krw || 0) >= ad.budget_krw;
              return (
              <div
                key={ad.id}
                className={`bg-card border rounded-xl overflow-hidden transition-opacity ${
                  isDepleted ? "border-red-500/30 opacity-60" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3 p-4">
                  {/* 썸네일 = 영상 프리뷰 토글 (콘텐츠 관리와 동일). 영상 소재가 있는 광고만 재생 가능. */}
                  <button
                    type="button"
                    onClick={() => ad.video_url && setPreviewId(cur => (cur === ad.id ? null : ad.id))}
                    disabled={!ad.video_url}
                    title={ad.video_url ? (previewId === ad.id ? "프리뷰 닫기" : "영상 재생") : "영상 소재 없음 (이미지 광고)"}
                    className="relative w-20 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 group disabled:cursor-default"
                  >
                    {/* 배경 아이콘 — 썸네일 없거나 로드 실패 시 뒤로 비침 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Video className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    {(ad.thumbnail_url || ad.image_url || bunnyThumb(ad.video_url)) && (
                      <img
                        src={ad.thumbnail_url || ad.image_url || bunnyThumb(ad.video_url)!}
                        alt={ad.title}
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    {ad.video_url && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        {previewId === ad.id ? <X className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white fill-white" />}
                      </span>
                    )}
                  </button>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{ad.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        ad.is_active
                          ? "bg-green-500/15 text-green-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {ad.is_active ? "활성" : "비활성"}
                      </span>
                      {/* 심사 상태 배지 — 노출 게이트는 status='approved' 라 미승인이면 is_active 여도
                          노출 0. "활성"만 보고 반려/심사중 광고를 노출 중으로 오인하던 것 방지(2026-07-14). */}
                      {ad.status && ad.status !== "approved" && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          ad.status === "rejected" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {ad.status === "pending_review" ? "심사 대기 · 노출 안 됨"
                            : ad.status === "rejected" ? "반려됨 · 노출 안 됨"
                            : "임시저장 · 노출 안 됨"}
                        </span>
                      )}
                      {ad.video_url && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6366f1]/15 text-[#6366f1] font-bold">영상</span>
                      )}
                      {/* Phase 28: 광고 형식 배지 */}
                      {ad.format && AD_FORMAT_META[ad.format] && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#8b5cf6]/15 text-[#8b5cf6] font-bold">
                          {AD_FORMAT_META[ad.format].emoji} {AD_FORMAT_META[ad.format].label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ad.advertiser || "광고주 미설정"}
                      {ad.format === "feed" && ` · 매 ${ad.interval_count}개마다 노출`}
                      {ad.format === "midroll" && ad.trigger_position_pct != null && ` · ${ad.trigger_position_pct}% 지점`}
                      {ad.format === "overlay" && ad.trigger_position_pct != null && ` · ${ad.trigger_position_pct}% 지점 / ${ad.duration_seconds ?? 10}초`}
                      {ad.target_tiers && ad.target_tiers.length > 0 && ` · ${ad.target_tiers.join(",")}`}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(ad.impressions)}</span>
                      <span className="flex items-center gap-1"><MousePointerClick className="w-3 h-3" />{fmt(ad.clicks)}</span>
                      <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />CTR {ctr(ad.impressions, ad.clicks)}</span>
                    </div>
                    {/* Phase 8.5 — 예산 진행률 */}
                    {(() => {
                      if (ad.budget_krw == null) {
                        return (
                          <p className="text-xs text-amber-300/80 mt-1.5 flex items-center gap-1">
                            🏠 자체 광고 · 예산 무제한
                          </p>
                        );
                      }
                      const spent = ad.spent_krw || 0;
                      const ratio = ad.budget_krw > 0 ? Math.min(spent / ad.budget_krw, 1) : 0;
                      const depleted = spent >= ad.budget_krw;
                      const pct = Math.round(ratio * 100);
                      return (
                        <div className="mt-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className={depleted ? "text-red-400 font-bold" : "text-muted-foreground"}>
                              {depleted ? "예산 소진" : "예산"} ₩{spent.toLocaleString()} / ₩{ad.budget_krw.toLocaleString()}
                            </span>
                            <span className={`font-mono ${depleted ? "text-red-400" : "text-[#8b5cf6]"}`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${
                                depleted
                                  ? "bg-red-500"
                                  : ratio >= 0.8
                                    ? "bg-amber-400"
                                    : "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
                              }`}
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    {(ad.starts_at || ad.ends_at) && (
                      <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {ad.starts_at ? ad.starts_at.slice(0, 10) : "즉시"} ~ {ad.ends_at ? ad.ends_at.slice(0, 10) : "무기한"}
                      </p>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(ad)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      title={ad.is_active ? "비활성화" : "활성화"}
                    >
                      {ad.is_active
                        ? <ToggleRight className="w-5 h-5 text-green-400" />
                        : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    {/* 자체광고·광고주 광고 모두 운영팀 직접 수정 가능(모더레이션·긴급 정정). 소유자(owner_id)는 보존됨 */}
                    <button
                      onClick={() => openEdit(ad)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      title={ad.owner_id ? "수정 (광고주 광고 — 운영팀 직접 수정)" : "수정"}
                    >
                      <Pencil className="w-4 h-4 text-[#6366f1]" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(ad.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>

                {/* 인라인 영상 프리뷰 — 썸네일 클릭 시 그 광고만 재생 (mp4 렌디션). 세로 소재(히어로)도 max-h로 안전. */}
                {previewId === ad.id && ad.video_url && (
                  <div className="px-4 pb-4">
                    <video
                      key={ad.id}
                      src={toMp4(ad.video_url) || undefined}
                      poster={ad.thumbnail_url || ad.image_url || bunnyThumb(ad.video_url) || undefined}
                      controls autoPlay preload="metadata"
                      onError={() => toast.error("프리뷰 재생 실패 — 이 영상은 720p 렌디션이 없을 수 있습니다.")}
                      className="w-full max-w-xl max-h-[70vh] rounded-lg bg-black border border-white/10"
                    />
                  </div>
                )}

                {/* 삭제 확인 */}
                {deleteConfirm === ad.id && (
                  <div className="border-t border-border bg-red-500/5 px-4 py-3 flex items-center justify-between">
                    <p className="text-sm text-red-400 font-medium">정말 삭제하시겠습니까?</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>취소</Button>
                      <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => handleDelete(ad.id)}>삭제</Button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

      {/* ── 광고 등록/수정 폼 (슬라이드 패널) ── */}
      {/* z-[120]: 모바일 하단 탭바(z-50) 위로 올려야 sticky 저장 버튼이 가려지지 않음 */}
      {showForm && (
        <div className="fixed inset-0 z-[120] flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          {/* Panel */}
          <div className="w-full max-w-md bg-background border-l border-border overflow-y-auto flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-background z-10">
              <h3 className="font-bold text-lg">{editingId ? "광고 수정" : "광고 추가"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-5 space-y-5">

              {/* 광고주 광고를 운영팀이 직접 수정하는 경우 — 안내 */}
              {editingId && ads.find(a => a.id === editingId)?.owner_id && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 leading-relaxed">
                  ⚠️ 광고주가 등록한 광고입니다. 운영팀이 직접 수정하면 광고주 계정에 그대로 반영됩니다.
                  예산·형식 변경은 신중히 하세요. (소유자·소진액은 보존됩니다)
                </div>
              )}

              {/* Phase 28: 광고 형식 6개 선택 */}
              <Field label="광고 형식 *">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(AD_FORMAT_META) as AdFormat[]).map(fmt => {
                    const meta = AD_FORMAT_META[fmt];
                    const active = form.format === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setForm(f => applyFormatDefaults(f, fmt))}
                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                          active
                            ? "border-[#6366f1] bg-[#6366f1]/10"
                            : "border-border hover:border-[#6366f1]/50"
                        }`}
                      >
                        <div className="font-semibold text-sm mb-0.5">{meta.emoji} {meta.label}</div>
                        <div className="text-[11px] text-muted-foreground">{meta.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* 자체 피드광고 노출면 OFF 경고 — 등록해도 안 나오는 죽은 설정 방지 */}
              {form.format === "feed" && !HOME_FEED_SELF_ADS && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
                  ⚠️ 현재 <b>자체 피드 광고 노출면이 꺼져 있어</b> 이 형식으로 등록해도 홈 피드에 노출되지 않습니다.
                  프리롤·오버레이 등 영상 광고 형식을 쓰거나, 노출면을 켠 뒤 등록하세요.
                </div>
              )}

              {/* 광고명 */}
              <Field label="광고명 *">
                <input
                  className="input-base"
                  placeholder="예: 런웨이 신규 플랜 프로모션"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </Field>

              {/* 광고주 */}
              <Field label="광고주명">
                <input
                  className="input-base"
                  placeholder="예: Runway AI"
                  value={form.advertiser}
                  onChange={e => setForm(f => ({ ...f, advertiser: e.target.value }))}
                />
              </Field>

              {/* 이미지 URL + 직접 업로드 — 피드 카드/오버레이만 */}
              {showImageField && (<>
              <Field label={ff === "feed" ? "이미지 URL (데스크탑 · 16:9)" : "이미지 URL"} icon={<ImageIcon className="w-4 h-4 text-muted-foreground" />}>
                <input
                  className="input-base"
                  placeholder={ff === "feed" ? "https://... (가로 16:9 배너, 1920×1080)" : "https://... (배너 이미지)"}
                  value={form.image_url || ""}
                  onChange={e => setForm(f => ({ ...f, image_url: e.target.value || null }))}
                  disabled={imgUploading}
                />

                {/* 직접 업로드 */}
                <input
                  ref={adImageFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAdImageFileSelect}
                  className="hidden"
                />

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => adImageFileRef.current?.click()}
                  disabled={imgUploading}
                  className="w-full mt-2 gap-2 border-[#6366f1]/40 hover:bg-[#6366f1]/10"
                >
                  {imgUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      업로드 중...
                    </>
                  ) : (
                    <>
                      <UploadIcon className="w-4 h-4" />
                      이미지 직접 업로드 (JPG·PNG·WebP·GIF)
                    </>
                  )}
                </Button>

                {form.image_url && (
                  <img src={form.image_url} alt="preview" className="mt-2 w-full h-32 object-cover rounded-lg border border-border" />
                )}

                {ff === "feed" && (
                  <p className="text-xs text-[#8b5cf6] mt-1 font-medium leading-relaxed">
                    📐 데스크탑 피드 카드 권장: <b>가로 16:9 (1920×1080)</b>. 아래 <b>모바일 이미지</b>를 비워두면 모바일에선 이 이미지의 <b>좌우가 잘려 가운데만</b> 보입니다 → 잘림 없이 하려면 모바일 이미지를 따로 넣으세요.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  💡 이미지 직접 업로드 시 Supabase Storage에 저장됩니다 (10MB 이하).
                </p>
              </Field>

              {/* 모바일 전용 이미지(선택) — 피드 카드만. 비우면 데스크탑 이미지로 폴백 */}
              {ff === "feed" && (
              <Field label="모바일 이미지 URL (선택 · 가로 4:3)" icon={<ImageIcon className="w-4 h-4 text-muted-foreground" />}>
                <input
                  className="input-base"
                  placeholder="https://... (가로 4:3 권장, 1080×810 — 데스크탑 16:9보다 세로가 더 보임)"
                  value={form.image_url_mobile || ""}
                  onChange={e => setForm(f => ({ ...f, image_url_mobile: e.target.value || null }))}
                  disabled={imgUploading}
                />

                <input
                  ref={adImageMobileFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={e => handleAdImageFileSelect(e, 'image_url_mobile')}
                  className="hidden"
                />

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => adImageMobileFileRef.current?.click()}
                  disabled={imgUploading}
                  className="w-full mt-2 gap-2 border-[#6366f1]/40 hover:bg-[#6366f1]/10"
                >
                  {imgUploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 업로드 중...</>
                  ) : (
                    <><UploadIcon className="w-4 h-4" /> 모바일 이미지 직접 업로드</>
                  )}
                </Button>

                {form.image_url_mobile && (
                  <img src={form.image_url_mobile} alt="mobile preview" className="mt-2 w-48 h-36 object-cover rounded-lg border border-border mx-auto" />
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  💡 비워두면 모바일에서도 데스크탑 이미지를 사용합니다(좌우 잘림). 모바일 카드는 <b>가로형(대략 4:3~3:2, 기기별로 정사각~3:2)</b>이라 <b>가로 4:3(1080×810)</b> 정도를 넣고 핵심은 가운데 두면 잘림이 크게 줄어듭니다.
                </p>
              </Field>
              )}
              </>)}

              {/* Bunny 영상 URL + 직접 업로드 버튼 — 영상 소재 형식만 */}
              {showVideoField && (<>
              <Field label="Bunny 영상 URL (HLS)" icon={<Video className="w-4 h-4 text-muted-foreground" />}>
                <input
                  className="input-base"
                  placeholder="https://...bunnycdn.com/.../playlist.m3u8"
                  value={form.video_url || ""}
                  onChange={e => setForm(f => ({ ...f, video_url: e.target.value || null }))}
                  disabled={adUploading}
                />

                {/* 광고 영상 직접 업로드 */}
                <input
                  ref={adVideoFileRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi"
                  onChange={handleAdVideoFileSelect}
                  className="hidden"
                />

                {!adUploading ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => adVideoFileRef.current?.click()}
                    className="w-full mt-2 gap-2 border-[#6366f1]/40 hover:bg-[#6366f1]/10"
                  >
                    <UploadIcon className="w-4 h-4" />
                    광고 영상 직접 업로드 (마켓에 노출 안 됨)
                  </Button>
                ) : (
                  <div className="mt-2 bg-card p-3 rounded-lg border border-[#6366f1]/40">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#6366f1]" />
                        <span className="text-sm font-medium">Bunny에 업로드 중...</span>
                      </div>
                      <span className="text-sm font-bold text-[#6366f1]">{adUploadProgress}%</span>
                    </div>
                    <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full transition-all"
                        style={{ width: `${adUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-2">
                  💡 직접 업로드 시 자동으로 Bunny에 저장되며, **광고로만 사용**됩니다 (마켓·홈피드 노출 X).
                  <br />
                  또는 기존 Bunny URL을 직접 입력해도 됩니다.
                </p>
              </Field>

              {/* 썸네일 URL (영상 광고용) */}
              {form.video_url && (
                <Field label="썸네일 URL (영상 광고용)">
                  <input
                    className="input-base"
                    placeholder="https://... (영상 미리보기 이미지)"
                    value={form.thumbnail_url || ""}
                    onChange={e => setForm(f => ({ ...f, thumbnail_url: e.target.value || null }))}
                  />
                </Field>
              )}
              </>)}

              {/* 랜딩 URL */}
              <Field label="랜딩 URL *" icon={<Link className="w-4 h-4 text-muted-foreground" />}>
                <input
                  className="input-base"
                  placeholder="https://... (클릭 시 이동할 주소)"
                  value={form.link_url}
                  onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                />
              </Field>

              {/* CTA 텍스트 */}
              <Field label="CTA 버튼 텍스트">
                <input
                  className="input-base"
                  placeholder="예: 자세히 보기, 무료 체험"
                  value={form.cta_text}
                  onChange={e => setForm(f => ({ ...f, cta_text: e.target.value }))}
                />
              </Field>

              {/* Phase 8.5 — 광고 예산 (CPM 차감) */}
              <Field label="광고 예산 (₩)">
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="input-base"
                  placeholder="예: 100000 (₩100,000) — 비워두면 무제한 (자체 광고)"
                  value={form.budget_krw ?? ""}
                  onChange={e => setForm(f => ({
                    ...f,
                    budget_krw: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value) || 0)),
                  }))}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  노출 1회당 약 ₩{Math.ceil(2000 / 1000)} 차감 (CPM ₩2,000 기준).
                  잔액 0 시 광고 자동 중단. 비워두면 자체 광고로 무제한 노출.
                </p>
              </Field>

              {/* Feed — 노출 간격 */}
              {form.format === "feed" && (
                <Field label={`노출 간격: 매 ${form.interval_count}개 영상마다`}>
                  <input
                    type="range" min={2} max={10} step={1}
                    value={form.interval_count}
                    onChange={e => setForm(f => ({ ...f, interval_count: Number(e.target.value) }))}
                    className="w-full accent-[#6366f1]"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>2개마다 (고빈도)</span>
                    <span>10개마다 (저빈도)</span>
                  </div>
                </Field>
              )}

              {/* Pre-roll 전용 옵션 */}
              {form.format === "preroll" && (
                <>
                  <Field label={`SKIP 가능 시점: ${form.skip_offset}초 후`}>
                    <input
                      type="range" min={0} max={15} step={1}
                      value={form.skip_offset}
                      onChange={e => setForm(f => ({ ...f, skip_offset: Number(e.target.value), skip_after_seconds: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>즉시 SKIP</span>
                      <span>15초 후</span>
                    </div>
                  </Field>

                  <Field label={`광고 최대 길이: ${form.max_duration}초`}>
                    <input
                      type="range" min={5} max={60} step={5}
                      value={form.max_duration}
                      onChange={e => setForm(f => ({ ...f, max_duration: Number(e.target.value), duration_seconds: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>5초</span>
                      <span>60초</span>
                    </div>
                  </Field>

                  <Field label={`노출 가중치: ${form.weight}`}>
                    <input
                      type="number" min={1} max={100} step={1}
                      value={form.weight}
                      onChange={e => setForm(f => ({ ...f, weight: Math.max(1, Number(e.target.value) || 1) }))}
                      className="input-base"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      여러 비디오 광고 중 랜덤 선택될 확률 가중치 (1~100). 높을수록 자주 노출.
                    </p>
                  </Field>
                </>
              )}

              {/* Mid-roll 전용 옵션 */}
              {form.format === "midroll" && (
                <>
                  <Field label={`삽입 시점: 영상의 ${form.trigger_position_pct ?? 50}% 지점`}>
                    <input
                      type="range" min={20} max={80} step={5}
                      value={form.trigger_position_pct ?? 50}
                      onChange={e => setForm(f => ({ ...f, trigger_position_pct: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>20% (앞쪽)</span>
                      <span>80% (뒤쪽)</span>
                    </div>
                  </Field>
                  <Field label={`광고 길이: ${form.duration_seconds ?? 30}초`}>
                    <input
                      type="range" min={5} max={60} step={5}
                      value={form.duration_seconds ?? 30}
                      onChange={e => setForm(f => ({ ...f, duration_seconds: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                  </Field>
                  <Field label={`SKIP 가능 시점: ${form.skip_after_seconds ?? 5}초 후`}>
                    <input
                      type="range" min={0} max={15} step={1}
                      value={form.skip_after_seconds ?? 5}
                      onChange={e => setForm(f => ({ ...f, skip_after_seconds: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                  </Field>
                  <p className="text-xs text-amber-300/80">
                    💡 Mid-roll은 10분 이상 영상(OTT tier)에만 권장됩니다.
                  </p>
                </>
              )}

              {/* Overlay 전용 옵션 */}
              {form.format === "overlay" && (
                <>
                  <Field label={`노출 시점: 영상의 ${form.trigger_position_pct ?? 30}% 지점`}>
                    <input
                      type="range" min={10} max={80} step={5}
                      value={form.trigger_position_pct ?? 30}
                      onChange={e => setForm(f => ({ ...f, trigger_position_pct: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>10% (앞쪽)</span>
                      <span>80% (뒤쪽)</span>
                    </div>
                  </Field>
                  <Field label={`노출 시간: ${form.duration_seconds ?? 10}초`}>
                    <input
                      type="range" min={3} max={30} step={1}
                      value={form.duration_seconds ?? 10}
                      onChange={e => setForm(f => ({ ...f, duration_seconds: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      💰 예산 광고는 노출시간 비례 과금 — 10초 ₩2 기준 (20초 ₩4, 30초 ₩6).
                    </p>
                  </Field>
                  <p className="text-xs text-amber-300/80">
                    💡 Overlay는 1분 이상 영상에서만 노출됩니다 (아래 "최소 영상 길이" 60초로 기본 설정).
                  </p>
                </>
              )}

              {/* Post-roll 전용 옵션 */}
              {form.format === "postroll" && (
                <>
                  <Field label={`광고 길이: ${form.duration_seconds ?? 15}초`}>
                    <input
                      type="range" min={5} max={30} step={5}
                      value={form.duration_seconds ?? 15}
                      onChange={e => setForm(f => ({ ...f, duration_seconds: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                  </Field>
                  <Field label={`SKIP 가능 시점: ${form.skip_after_seconds ?? 5}초 후`}>
                    <input
                      type="range" min={0} max={15} step={1}
                      value={form.skip_after_seconds ?? 5}
                      onChange={e => setForm(f => ({ ...f, skip_after_seconds: Number(e.target.value) }))}
                      className="w-full accent-[#6366f1]"
                    />
                  </Field>
                </>
              )}

              {/* Bumper 전용 옵션 */}
              {form.format === "bumper" && (
                <div className="p-3 rounded-lg bg-[#6366f1]/10 border border-[#6366f1]/30 text-sm space-y-2">
                  <p className="font-semibold">⚡ Bumper 광고 (6초 고정)</p>
                  <p className="text-xs text-muted-foreground">
                    • 무료 사용자: SKIP 불가 (6초 시청 강제)
                    <br />• BASIC 사용자: 5초 후 SKIP 가능
                    <br />• PREMIUM 사용자: 광고 자동 제거
                  </p>
                </div>
              )}

              {/* 영상에 붙는 광고(프리롤/미드롤/오버레이/포스트롤/범퍼)만 — 어느 영상에 노출할지 타겟팅 */}
              {showVideoTargeting && (<>
              {/* Phase 28: 공통 타겟팅 — tier */}
              <Field label="노출 영상 tier (체크한 tier에만 노출, 모두 해제 시 전체)">
                <div className="flex gap-2 flex-wrap">
                  {(["home", "cinema", "ott"] as AdTier[]).map(tier => {
                    const selected = form.target_tiers?.includes(tier) ?? false;
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setForm(f => {
                          const cur = f.target_tiers || [];
                          const next = selected ? cur.filter(t => t !== tier) : [...cur, tier];
                          return { ...f, target_tiers: next.length === 0 ? null : next };
                        })}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                          selected
                            ? "border-[#6366f1] bg-[#6366f1]/15 text-[#6366f1]"
                            : "border-border text-muted-foreground hover:border-[#6366f1]/40"
                        }`}
                      >
                        {tier === "home" && "🏠 Home (<3분)"}
                        {tier === "cinema" && "🎬 Cinema (3~10분)"}
                        {tier === "ott" && "📺 OTT (10분+)"}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Phase 28: 공통 타겟팅 — 카테고리 */}
              <Field label="노출 카테고리 (체크한 카테고리만, 모두 해제 시 전체)">
                <div className="flex gap-1.5 flex-wrap">
                  {AD_CATEGORIES.map(cat => {
                    const selected = form.target_categories?.includes(cat) ?? false;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm(f => {
                          const cur = f.target_categories || [];
                          const next = selected ? cur.filter(c => c !== cat) : [...cur, cat];
                          return { ...f, target_categories: next.length === 0 ? null : next };
                        })}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                          selected
                            ? "border-[#8b5cf6] bg-[#8b5cf6]/15 text-[#8b5cf6]"
                            : "border-border text-muted-foreground hover:border-[#8b5cf6]/40"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {/* Phase 28: 최소 영상 길이 */}
              <Field label={`최소 영상 길이: ${form.min_video_duration_sec}초`}>
                <input
                  type="number"
                  min={0}
                  step={30}
                  className="input-base"
                  value={form.min_video_duration_sec}
                  onChange={e => setForm(f => ({ ...f, min_video_duration_sec: Math.max(0, Number(e.target.value) || 0) }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  이 길이 미만의 영상에는 광고를 노출하지 않습니다. (Overlay 권장: 60, Mid-roll 권장: 600)
                </p>
              </Field>
              </>)}

              {/* 기간 */}
              <Field label="노출 기간" icon={<Calendar className="w-4 h-4 text-muted-foreground" />}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">시작일 (비워두면 즉시)</label>
                    <input
                      type="datetime-local"
                      className="input-base text-sm"
                      value={form.starts_at || ""}
                      onChange={e => setForm(f => ({ ...f, starts_at: e.target.value || null }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">종료일 (비워두면 무기한)</label>
                    <input
                      type="datetime-local"
                      className="input-base text-sm"
                      value={form.ends_at || ""}
                      onChange={e => setForm(f => ({ ...f, ends_at: e.target.value || null }))}
                    />
                  </div>
                </div>
              </Field>

              {/* 활성화 */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
                <div>
                  <p className="font-medium text-sm">광고 활성화</p>
                  <p className="text-xs text-muted-foreground">비활성 광고는 피드에 노출되지 않습니다.</p>
                </div>
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                  {form.is_active
                    ? <ToggleRight className="w-8 h-8 text-green-400" />
                    : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
                </button>
              </div>

            </div>

            {/* 저장 버튼 */}
            <div className="px-5 py-4 border-t border-border sticky bottom-0 bg-background">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 font-bold h-11"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? "수정 저장" : "광고 등록"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}
