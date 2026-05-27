import { useState, useEffect, useMemo } from "react";
import { User, ShoppingBag, CreditCard, Settings, LogOut, TrendingUp, DollarSign, Loader2, Bell, ChevronRight, X, Eye, EyeOff, Lock, Pencil, Crown, Sparkles, ImagePlus, Clock, Trash2, Film, Tv, FolderPlus, Bookmark, ArrowLeft, Play, MessageSquare, Filter, UserX, Download, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useBackButton } from "../hooks/useBackButton";
import { toast } from "sonner";
import { supabase } from "../utils/supabaseClient";
import { InstallGuideCard } from "./InstallPrompt";
import { CommentSettings } from "./CommentSettings";
import { CreatorDashboard } from "./CreatorDashboard";
import { VideoEditModal } from "./VideoEditModal";
import { NotificationSettings } from "./NotificationSettings";
import { TaxInfoSection } from "./TaxInfoSection";
import { MyPaymentsSection } from "./MyPaymentsSection";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { Footer } from "./Footer";
import { formatCompactNumber } from "../i18n/numberFormat";

// Phase 27: 데이터 다운로드 섹션 (개인정보보호법 데이터 이동권)
function DataDownloadSection() {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data, error } = await supabase.rpc("export_my_data");
      if (error) throw error;
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `creaite-my-data-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("mypage.data.downloadSuccess"));
    } catch (e: any) {
      console.error("[DataDownload] error:", e);
      toast.error(t("mypage.data.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Download className="w-5 h-5 text-[#10b981]" />
        <h3 className="font-bold text-white">{t("mypage.data.downloadTitle")}</h3>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        {t("mypage.data.downloadDescription")}
      </p>
      <Button
        onClick={handleDownload}
        disabled={downloading}
        className="bg-[#10b981]/10 hover:bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 font-bold gap-2"
        variant="outline"
      >
        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {downloading ? t("mypage.data.downloading") : t("mypage.data.downloadButton")}
      </Button>
    </div>
  );
}

// Phase 27: 계정 삭제 (위험 영역, 30일 유예)
interface DeletionStatus {
  requested_at: string;
  scheduled_at: string;
  days_left: number;
  reason: string | null;
}

function DangerZoneSection({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_my_deletion_status");
    setStatus((data && data[0]) || null);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleRequest = async () => {
    if (!confirm(t("mypage.danger.confirmRequest"))) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("request_account_deletion", { p_reason: reason.trim() || null });
    setSubmitting(false);
    if (error) {
      toast.error(t("mypage.danger.requestFailed"));
      return;
    }
    toast.success(t("mypage.danger.requestSuccess"));
    setShowConfirm(false);
    setReason("");
    refresh();
  };

  const handleCancel = async () => {
    if (!confirm(t("mypage.danger.confirmCancel"))) return;
    const { error } = await supabase.rpc("cancel_account_deletion");
    if (error) {
      toast.error(t("mypage.danger.cancelFailed"));
      return;
    }
    toast.success(t("mypage.danger.cancelSuccess"));
    refresh();
  };

  if (loading) return null;

  // 삭제 요청 중인 상태
  if (status) {
    return (
      <div className="bg-red-500/10 border-2 border-red-500/30 p-5 md:p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h3 className="font-bold text-red-300">{t("mypage.danger.scheduledTitle")}</h3>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed mb-2">
          <span className="font-bold text-red-300">{t("mypage.danger.daysLeft", { days: status.days_left })}</span> {t("mypage.danger.scheduledIn")}.
        </p>
        <p className="text-xs text-gray-500 mb-4">
          {t("mypage.danger.scheduledDate", { date: new Date(status.scheduled_at).toLocaleDateString() })}
          {status.reason && t("mypage.danger.reasonLine", { reason: status.reason })}
        </p>
        <Button
          onClick={handleCancel}
          className="bg-white text-black hover:bg-gray-100 font-bold gap-2"
        >
          <X className="w-4 h-4" />
          {t("mypage.danger.cancelDeletion")}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-red-500/5 border-2 border-red-500/20 p-5 md:p-6 rounded-2xl shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-red-400" />
        <h3 className="font-bold text-red-300">{t("mypage.danger.title")}</h3>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        {t("mypage.danger.description")}
      </p>

      {!showConfirm ? (
        <Button
          onClick={() => setShowConfirm(true)}
          variant="outline"
          className="bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 font-bold gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {t("mypage.danger.requestButton")}
        </Button>
      ) : (
        <div className="space-y-3 pt-2 border-t border-red-500/20">
          <div>
            <label className="text-xs font-bold text-gray-400 mb-1.5 block">{t("mypage.danger.reasonLabel")}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("mypage.danger.reasonPlaceholder")}
              rows={2}
              maxLength={300}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-400 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => { setShowConfirm(false); setReason(""); }}
              variant="outline"
              className="flex-1 bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
            >
              {t("mypage.danger.cancelButton")}
            </Button>
            <Button
              onClick={handleRequest}
              disabled={submitting}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t("mypage.danger.submitDeletion")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Phase 24: 차단한 사용자 관리 섹션
function BlockedUsersSection() {
  const { t } = useTranslation();
  const { unblockUser } = useBlockedUsers();
  const [list, setList] = useState<{ blocked_user_id: string; display_name: string | null; avatar_url: string | null; blocked_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.rpc("get_my_blocked_users");
    setList((data ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleUnblock = async (id: string, name: string | null) => {
    if (!confirm(t("mypage.blocks.confirmUnblock", { name: name || t("mypage.blocks.thisUser") }))) return;
    const ok = await unblockUser(id);
    if (ok) refresh();
  };

  return (
    <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <UserX className="w-5 h-5 text-red-400" />
        <h3 className="font-bold text-white">{t("mypage.blocks.title")}</h3>
        <span className="text-xs text-gray-500">{t("mypage.blocks.count", { count: list.length })}</span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">
        {t("mypage.blocks.description")}
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-6">{t("mypage.blocks.empty")}</p>
      ) : (
        <div className="space-y-2">
          {list.map((u) => (
            <div key={u.blocked_user_id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center overflow-hidden flex-shrink-0">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-sm font-bold">{(u.display_name || "?").charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{u.display_name || t("mypage.blocks.unknownUser")}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{new Date(u.blocked_at).toLocaleDateString()}{t("mypage.blocks.blockedSuffix")}</p>
              </div>
              <button
                onClick={() => handleUnblock(u.blocked_user_id, u.display_name)}
                className="px-3 py-1.5 text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 transition-colors"
              >
                {t("mypage.blocks.unblock")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Purchase {
  id: string;
  videoId: string;
  thumbnail: string;
  title: string;
  license: string;
  price: number;
  date: string;
  status: string;
}

interface MyProduct {
  id: string;
  thumbnail: string;
  title: string;
  views: number;
  sales: number;
  revenue: number;
  status: string;
}

type PageMode = 'select' | 'user' | 'creator';

const PAGE_MODE_STORAGE_KEY = 'creaite_mypage_mode';

interface MyPageProps {
  onSignInClick?: () => void;
  onVideoClick?: (videoId: string) => void;  // Phase 17: 시청 기록에서 영상 클릭
  onViewMyChannel?: () => void;              // 내 채널 가기 (Channel 탭으로 이동)
  onNavigate?: (tab: string) => void;
}

// 모드 선택 화면 (마이 탭 진입 시)
function ModeSelectScreen({
  isCreator,
  onSelectUser,
  onSelectCreator,
}: {
  isCreator: boolean;
  onSelectUser: () => void;
  onSelectCreator: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0a] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full"
      >
        <h2 className="text-2xl md:text-3xl font-black text-white text-center mb-2">
          {t("mypage.modeSelect.title")}
        </h2>
        <p className="text-sm text-gray-400 text-center mb-8">
          {t("mypage.modeSelect.subtitle")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.button
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSelectUser}
            className="bg-gradient-to-br from-[#6366f1]/10 to-[#8b5cf6]/10 hover:from-[#6366f1]/20 hover:to-[#8b5cf6]/20 border border-[#6366f1]/30 hover:border-[#6366f1]/50 rounded-2xl p-6 md:p-8 text-left transition-colors group"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center mb-5 shadow-lg">
              <ShoppingBag className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-black text-white mb-1.5">{t("mypage.modeSelect.userCorner")}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {t("mypage.modeSelect.userCornerDesc")}
            </p>
          </motion.button>

          <motion.button
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSelectCreator}
            className="relative bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-500/30 hover:border-amber-500/50 rounded-2xl p-6 md:p-8 text-left transition-colors group overflow-hidden"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-5 shadow-lg">
              <Crown className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-black text-white mb-1.5 flex items-center gap-2">
              {t("mypage.modeSelect.creatorCorner")}
              {!isCreator && <Lock className="w-4 h-4 text-amber-400/70" />}
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              {isCreator
                ? t("mypage.modeSelect.creatorCornerEnabled")
                : t("mypage.modeSelect.creatorCornerDisabled")}
            </p>
            <Crown className="absolute -right-6 -bottom-6 w-28 h-28 text-amber-500/5 rotate-12" />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// 영상 0개 크리에이터 안내 화면
function CreatorOnboardingScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0a] p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full text-center"
      >
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center mb-6">
          <Crown className="w-10 h-10 text-amber-400" />
        </div>
        <h2 className="text-2xl font-black text-white mb-3">
          {t("mypage.creatorEmpty.title")}
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-8">
          {t("mypage.creatorEmpty.descriptionLine1")}<br />
          {t("mypage.creatorEmpty.descriptionLine2")}
        </p>
        <Button
          onClick={onBack}
          variant="outline"
          className="bg-white/5 border-white/10 hover:bg-white/10 text-white font-medium"
        >
          {t("mypage.creatorEmpty.viewOtherCorner")}
        </Button>
      </motion.div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

export function MyPage({ onSignInClick, onVideoClick, onViewMyChannel, onNavigate }: MyPageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("profile");
  const [pageMode, setPageMode] = useState<PageMode>(() => {
    if (typeof window === 'undefined') return 'select';
    const saved = localStorage.getItem(PAGE_MODE_STORAGE_KEY);
    return saved === 'user' || saved === 'creator' ? saved : 'select';
  });
  const { user, profile, subscriptionTier, isSubscriber, signOut, isAuthenticated } = useAuth();
  const [purchaseHistory, setPurchaseHistory] = useState<Purchase[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [myProducts, setMyProducts] = useState<MyProduct[]>([]);
  const [monthlySales, setMonthlySales] = useState<{month: string, sales: number}[]>([]);
  const [adStats, setAdStats] = useState<{ impressions: number; clicks: number; completes: number; skips: number }>({
    impressions: 0, clicks: 0, completes: 0, skips: 0,
  });
  // 영상별 광고 노출 통계 (분배율 가중평균 계산용)
  const [adStatsByVideo, setAdStatsByVideo] = useState<Record<string, { impressions: number; clicks: number }>>({});
  // 영상 분류 정보 (광고 분배율 tier 결정용)
  const [videoTiers, setVideoTiers] = useState<Record<string, "home" | "cinema" | "ott">>({});
  // 플랫폼 정책 설정 (어드민이 변경 가능, RPC로 로드)
  const [policyRates, setPolicyRates] = useState<Record<string, number>>({});
  // Phase 17: 시청 기록
  const [watchHistory, setWatchHistory] = useState<any[]>([]);
  const [watchHistoryLoading, setWatchHistoryLoading] = useState(false);
  // Phase 18: 플레이리스트
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [activePlaylistName, setActivePlaylistName] = useState<string>("");
  const [playlistVideos, setPlaylistVideos] = useState<any[]>([]);
  const [playlistVideosLoading, setPlaylistVideosLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // 프로필 편집 모달
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("mypage.profileEditModal.avatarTooLarge"));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(t("mypage.profileEditModal.imageOnly"));
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('user-avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('user-avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setEditAvatarUrl(publicUrl);
      toast.success(t("mypage.profileEditModal.avatarUploadSuccess"));
    } catch (err: any) {
      toast.error(err?.message || t("mypage.profileEditModal.avatarUploadFailed"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("mypage.profileEditModal.bannerTooLarge"));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(t("mypage.profileEditModal.imageOnly"));
      return;
    }
    setUploadingBanner(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/banner.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('user-banners')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('user-banners').getPublicUrl(path);
      // 캐시 무력화 — Storage가 같은 경로에 덮어쓰면 브라우저가 옛 이미지 캐시
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setEditBannerUrl(publicUrl);
      toast.success(t("mypage.profileEditModal.bannerUploadSuccess"));
    } catch (err: any) {
      toast.error(err?.message || t("mypage.profileEditModal.bannerUploadFailed"));
    } finally {
      setUploadingBanner(false);
    }
  };

  // 비밀번호 변경 모달
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPwNew, setShowPwNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // 뒤로가기로 프로필/비밀번호 모달 닫기
  useBackButton(showProfileEdit, () => setShowProfileEdit(false));
  useBackButton(showPasswordChange, () => setShowPasswordChange(false));

  // 라이선스 영상 다운로드 — log_download RPC + Bunny mp4 URL 새 탭 열기
  // (Bunny CDN cross-origin 이라 <a download> 속성이 무시될 수 있어 새 탭 우클릭 저장 안내)
  const handleDownloadPurchase = async (purchase: Purchase) => {
    if (downloadingId) return;
    setDownloadingId(purchase.id);
    try {
      const { data, error } = await supabase.rpc('log_download', {
        p_order_id: purchase.id,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      const videoId = (data && data[0]?.video_id) || purchase.videoId;
      if (!videoId) throw new Error('영상 ID 가 없습니다');
      const libraryId = (import.meta as any).env?.VITE_BUNNY_LIBRARY_ID || '';
      const bunnyHostname = (import.meta as any).env?.VITE_BUNNY_HOSTNAME || `vz-${libraryId}.b-cdn.net`;
      const mp4Url = `https://${bunnyHostname}/${videoId}/play_720p.mp4`;
      window.open(mp4Url, '_blank', 'noopener,noreferrer');
      toast.success(t('mypage.purchases.downloadStarted'));
    } catch (err: any) {
      console.error('[MyPage] 다운로드 실패:', err);
      toast.error(`${t('mypage.purchases.downloadFailed')}: ${err?.message || ''}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // 각 쿼리를 독립적으로 try/catch — 한 쿼리 실패가 다른 쿼리를 막지 않음
  // 실패한 쿼리는 console.warn만 (사용자 toast 안 띄움) — 빈 화면 대신 부분 데이터 표시
  const fetchMyData = async () => {
    if (!user) return;
    setLoading(true);
    let unexpectedError = false;

    // ── 1. 구매 내역 (orders 테이블)
    try {
      const { data: purchaseData, error: purchaseError } = await supabase
        .from('orders')
        .select('*, videos(title, thumbnail)')
        .eq('buyer_id', user.id);

      if (purchaseError) {
        // orders 테이블이 아직 생성 안 됐을 수 있음 (정상 케이스)
        console.warn('[MyPage] orders 쿼리 실패 (테이블 미생성 가능):', purchaseError.message);
      } else if (purchaseData) {
        setPurchaseHistory(purchaseData.map((item: any) => ({
          id: item.id,
          videoId: item.video_id,
          thumbnail: item.videos?.thumbnail || '',
          title: item.videos?.title || 'Unknown Video',
          license: item.license_type,
          price: item.amount,
          date: new Date(item.created_at).toLocaleDateString('ko-KR'),
          status: t("mypage.purchases.statusAvailable")
        })));
      }
    } catch (err) {
      console.warn('[MyPage] 구매 내역 조회 예외:', err);
      unexpectedError = true;
    }

    // ── 2. 내 등록 영상 + 매출 (videos + orders JOIN)
    let videoData: any[] | null = null;
    try {
      // orders 테이블이 없을 수 있으므로 JOIN 없이 먼저 시도
      const { data, error: videoError } = await supabase
        .from('videos')
        .select('*, orders(amount, created_at)')
        .eq('creator_id', user.id);

      if (videoError) {
        // orders JOIN 실패 시 → orders 없이 videos만 다시 가져옴
        console.warn('[MyPage] videos+orders JOIN 실패, videos만 조회:', videoError.message);
        const { data: videosOnly } = await supabase
          .from('videos')
          .select('*')
          .eq('creator_id', user.id);
        videoData = (videosOnly || []).map((v: any) => ({ ...v, orders: [] }));
      } else {
        videoData = data;
      }
    } catch (err) {
      console.warn('[MyPage] videos 조회 예외:', err);
      unexpectedError = true;
    }

    if (videoData) {
      const products = videoData.map((item: any) => {
        const salesCount = item.orders?.length || 0;
        const revenue = (item.orders || []).reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
        return {
          id: item.id,
          thumbnail: item.thumbnail,
          title: item.title,
          views: parseInt(item.views || "0"),
          sales: salesCount,
          revenue: revenue,
          status: item.status || t("mypage.statusOnSale")
        };
      });
      setMyProducts(products);

      // 영상별 tier 매핑 (광고 분배율 가중평균 계산용)
      const tierMap: Record<string, "home" | "cinema" | "ott"> = {};
      for (const v of videoData) {
        if (v.show_on_ott) tierMap[v.id] = "ott";
        else if (v.show_on_cinema) tierMap[v.id] = "cinema";
        else tierMap[v.id] = "home";
      }
      setVideoTiers(tierMap);

      // 월별 매출 차트 (orders 데이터 기반 — 없으면 0으로 채워진 6개월)
      const monthMap: Record<string, number> = {};
      videoData.forEach((video: any) => {
        (video.orders || []).forEach((order: any) => {
          const date = new Date(order.created_at);
          const key = t("mypage.chartMonth", { n: date.getMonth() + 1 });
          monthMap[key] = (monthMap[key] || 0) + (order.amount || 0);
        });
      });

      const chartData = Object.entries(monthMap).map(([month, sales]) => ({
        month,
        sales
      })).sort((a, b) => parseInt(a.month) - parseInt(b.month));

      if (chartData.length === 0) {
        const defaultData = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          defaultData.push({ month: t("mypage.chartMonth", { n: d.getMonth() + 1 }), sales: 0 });
        }
        setMonthlySales(defaultData);
      } else {
        setMonthlySales(chartData);
      }

      // ── 3. 광고 수익 통계 (영상 1개 이상 있는 크리에이터만)
      if (videoData.length > 0) {
        try {
          const { data: adStatsData, error: adErr } = await supabase.rpc('get_creator_ad_stats');
          if (adErr) {
            console.warn('[MyPage] get_creator_ad_stats RPC 실패 (마이그레이션 미적용 가능):', adErr.message);
          } else if (adStatsData && adStatsData.length > 0) {
            const row = adStatsData[0];
            setAdStats({
              impressions: Number(row.total_impressions || 0),
              clicks: Number(row.total_clicks || 0),
              completes: Number(row.total_completes || 0),
              skips: Number(row.total_skips || 0),
            });
          }
        } catch (err) {
          console.warn('[MyPage] 광고 통계 조회 예외:', err);
        }

        // 영상별 광고 통계 (분배율 가중평균용)
        try {
          const { data: byVideo, error: byVideoErr } = await supabase.rpc('get_creator_ad_stats_by_video');
          if (byVideoErr) {
            console.warn('[MyPage] get_creator_ad_stats_by_video 실패:', byVideoErr.message);
          } else if (byVideo) {
            const map: Record<string, { impressions: number; clicks: number }> = {};
            for (const row of byVideo) {
              map[row.video_id] = {
                impressions: Number(row.impressions || 0),
                clicks: Number(row.clicks || 0),
              };
            }
            setAdStatsByVideo(map);
          }
        } catch (err) {
          console.warn('[MyPage] 영상별 광고 통계 예외:', err);
        }
      }

      // ── 4. 플랫폼 정책 (어드민이 변경 가능) — 분배율/CPM/정산 최소액
      try {
        const { data: settingsData, error: settingsErr } = await supabase.rpc('get_active_platform_settings');
        if (settingsErr) {
          console.warn('[MyPage] get_active_platform_settings 실패 (마이그레이션 미적용 가능):', settingsErr.message);
        } else if (settingsData) {
          const map: Record<string, number> = {};
          for (const s of settingsData) map[s.key] = Number(s.value);
          setPolicyRates(map);
        }
      } catch (err) {
        console.warn('[MyPage] 정책 조회 예외:', err);
      }
    }

    // 예상치 못한 예외만 사용자에게 알림 (개별 테이블 누락은 무시)
    if (unexpectedError) {
      toast.error(t("mypage.fetchPartialFail"));
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchMyData();
    }
  }, [isAuthenticated, user?.id]);

  // Phase 17: 시청 기록 탭 활성 시 로드
  useEffect(() => {
    if (activeTab !== 'history' || !isAuthenticated) return;
    (async () => {
      setWatchHistoryLoading(true);
      const { data, error } = await supabase.rpc('get_my_watch_history', { p_limit: 50, p_offset: 0 });
      if (error) {
        console.warn('[MyPage] watch history 조회 실패:', error.message);
        setWatchHistory([]);
      } else {
        setWatchHistory(data || []);
      }
      setWatchHistoryLoading(false);
    })();
  }, [activeTab, isAuthenticated]);

  const handleDeleteHistoryItem = async (videoId: string) => {
    if (!confirm(t("mypage.watchHistory.confirmDeleteOne"))) return;
    const { error } = await supabase.rpc('delete_my_watch_history', { p_video_id: videoId });
    if (error) return toast.error(t("mypage.watchHistory.deleteFailed", { message: error.message }));
    setWatchHistory(prev => prev.filter(h => h.video_id !== videoId));
    toast.success(t("mypage.watchHistory.deleteSuccess"));
  };

  const handleClearAllHistory = async () => {
    if (!confirm(t("mypage.watchHistory.confirmDeleteAll"))) return;
    const { error } = await supabase.rpc('delete_my_watch_history', { p_video_id: null });
    if (error) return toast.error(t("mypage.watchHistory.deleteFailed", { message: error.message }));
    setWatchHistory([]);
    toast.success(t("mypage.watchHistory.clearAllSuccess"));
  };

  // Phase 18: 플레이리스트 탭 활성 시 로드
  const loadPlaylists = async () => {
    setPlaylistsLoading(true);
    const { data, error } = await supabase.rpc('get_my_playlists');
    if (error) {
      console.warn('[MyPage] 플레이리스트 조회 실패:', error.message);
      setPlaylists([]);
    } else {
      setPlaylists(data || []);
    }
    setPlaylistsLoading(false);
  };
  useEffect(() => {
    if (activeTab !== 'playlists' || !isAuthenticated) return;
    loadPlaylists();
    setActivePlaylistId(null);  // 탭 재진입 시 그리드로 돌아감
  }, [activeTab, isAuthenticated]);

  // 특정 플레이리스트 진입 시 영상 목록 로드
  useEffect(() => {
    if (!activePlaylistId) {
      setPlaylistVideos([]);
      return;
    }
    (async () => {
      setPlaylistVideosLoading(true);
      const { data, error } = await supabase.rpc('get_playlist_videos', { p_playlist_id: activePlaylistId });
      if (error) {
        toast.error(t("mypage.playlist.videoLoadFailed", { message: error.message }));
        setPlaylistVideos([]);
      } else {
        setPlaylistVideos(data || []);
      }
      setPlaylistVideosLoading(false);
    })();
  }, [activePlaylistId]);

  const handleDeletePlaylist = async (playlistId: string, name: string, isWatchLater: boolean) => {
    if (isWatchLater) {
      toast.info(t("mypage.playlist.watchLaterUndeletable"));
      return;
    }
    if (!confirm(t("mypage.playlist.confirmDelete", { name }))) return;
    const { error } = await supabase.rpc('delete_playlist', { p_playlist_id: playlistId });
    if (error) return toast.error(t("mypage.playlist.deleteFailed", { message: error.message }));
    toast.success(t("mypage.playlist.deleteSuccess"));
    await loadPlaylists();
  };

  const handleRemoveFromPlaylist = async (videoId: string) => {
    if (!activePlaylistId) return;
    const { error } = await supabase.rpc('remove_from_playlist', { p_playlist_id: activePlaylistId, p_video_id: videoId });
    if (error) return toast.error(t("mypage.playlist.removeFailed", { message: error.message }));
    setPlaylistVideos(prev => prev.filter(v => v.id !== videoId));
    toast.success(t("mypage.playlist.removeSuccess"));
  };

  const totalRevenue = useMemo(() => myProducts.reduce((sum, p) => sum + p.revenue, 0), [myProducts]);
  const totalSales = useMemo(() => myProducts.reduce((sum, p) => sum + p.sales, 0), [myProducts]);

  // 분배 정책 (platform_settings에서 로드, 미로드 시 기본값 = 정책 메모리 2026-05-12 기준)
  const CREATOR_SHARE_SALE   = policyRates.creator_share_sale            ?? 0.80;
  const CREATOR_SHARE_HOME   = policyRates.creator_share_ad_home         ?? 0.50;
  const CREATOR_SHARE_CINEMA = policyRates.creator_share_ad_cinema       ?? 0.55;
  const CREATOR_SHARE_OTT    = policyRates.creator_share_ad_ott          ?? 0.60;
  const AD_CPM_KRW           = policyRates.ad_cpm_krw                    ?? 2000;
  const PAYOUT_MIN_KRW       = policyRates.payout_minimum_krw            ?? 10000;

  const platformFee = Math.floor(totalRevenue * (1 - CREATOR_SHARE_SALE));
  const expectedPayout = totalRevenue - platformFee;

  // 광고 수익 가중평균 — 영상별 tier(home/cinema/ott)에 따라 분배율 적용
  const tierShare = { home: CREATOR_SHARE_HOME, cinema: CREATOR_SHARE_CINEMA, ott: CREATOR_SHARE_OTT };
  let adWeightedPayout = 0;
  let adGrossRevenue = 0;
  for (const [videoId, stats] of Object.entries(adStatsByVideo)) {
    const tier = videoTiers[videoId] || "home";
    const gross = (stats.impressions / 1000) * AD_CPM_KRW;
    adGrossRevenue += gross;
    adWeightedPayout += gross * tierShare[tier];
  }
  // 영상별 통계 미로드 시 fallback: 전체 노출 × 시네마 비율 (중간값)
  if (adGrossRevenue === 0 && adStats.impressions > 0) {
    adGrossRevenue = (adStats.impressions / 1000) * AD_CPM_KRW;
    adWeightedPayout = adGrossRevenue * CREATOR_SHARE_CINEMA;
  }
  const adCreatorPayout = Math.floor(adWeightedPayout);
  const avgAdShare = adGrossRevenue > 0 ? adWeightedPayout / adGrossRevenue : CREATOR_SHARE_CINEMA;
  const adCTR = adStats.impressions > 0 ? (adStats.clicks / adStats.impressions) * 100 : 0;

  // 크리에이터 여부 — 영상 1개 이상 업로드한 사용자만 판매(크리에이터) 탭 노출
  const isCreator = myProducts.length > 0;

  // 구독 등급 표시용 메타
  const tierMeta = {
    free: { label: 'FREE', color: 'from-gray-500 to-gray-600', icon: User, desc: t("mypage.subscription.freeDesc") },
    basic: { label: 'BASIC', color: 'from-[#6366f1] to-[#8b5cf6]', icon: Sparkles, desc: t("mypage.subscription.basicDesc") },
    premium: { label: 'PREMIUM', color: 'from-amber-500 to-orange-500', icon: Crown, desc: t("mypage.subscription.premiumDesc") },
  }[subscriptionTier];
  const TierIcon = tierMeta.icon;

  // 사용자가 비크리에이터인데 sales 탭이 활성화돼 있으면 profile로 리다이렉트
  // user 모드인데 sales 탭, creator 모드인데 purchases 탭이면 profile로
  useEffect(() => {
    if (!isCreator && activeTab === 'sales') setActiveTab('profile');
    if (pageMode === 'user' && activeTab === 'sales') setActiveTab('profile');
    if (pageMode === 'creator' && activeTab === 'purchases') setActiveTab('profile');
    if ((pageMode !== 'creator' || !isCreator) && activeTab === 'comments') setActiveTab('profile');
  }, [isCreator, activeTab, pageMode]);

  const [showCommentSettings, setShowCommentSettings] = useState(false);
  // Phase 22: 영상 편집 모달
  const [editingVideo, setEditingVideo] = useState<{ id: string; thumbnail: string; chapters: any[]; subtitle_url: string | null; age_rating: string } | null>(null);

  const handleOpenEditVideo = async (productId: string, thumbnail: string) => {
    const { data } = await supabase
      .from("videos")
      .select("chapters, subtitle_url, age_rating")
      .eq("id", productId)
      .maybeSingle();
    setEditingVideo({
      id: productId,
      thumbnail,
      chapters: Array.isArray((data as any)?.chapters) ? (data as any).chapters : [],
      subtitle_url: (data as any)?.subtitle_url || null,
      age_rating: (data as any)?.age_rating || "all",
    });
  };

  const handleSelectMode = (mode: 'user' | 'creator') => {
    setPageMode(mode);
    localStorage.setItem(PAGE_MODE_STORAGE_KEY, mode);
    setActiveTab(mode === 'creator' && isCreator ? 'sales' : 'profile');
  };

  const handleBackToSelect = () => {
    setPageMode('select');
    localStorage.removeItem(PAGE_MODE_STORAGE_KEY);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { toast.error(t("mypage.profileEditModal.nameRequired")); return; }
    if (!user) return;
    setSavingProfile(true);
    try {
      // 1) auth.users 메타데이터 (이름)
      const { error: authErr } = await supabase.auth.updateUser({ data: { name: editName.trim() } });
      if (authErr) throw authErr;

      // 2) public.profiles (display_name / bio / avatar_url / banner_url) — upsert
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          display_name: editName.trim(),
          bio: editBio.trim() || null,
          avatar_url: editAvatarUrl.trim() || null,
          banner_url: editBannerUrl.trim() || null,
          updated_at: new Date().toISOString(),
        });
      if (profileErr) throw profileErr;

      toast.success(t("mypage.profileEditModal.saveSuccess"));
      setShowProfileEdit(false);
    } catch (err: any) {
      toast.error(err.message || t("mypage.profileEditModal.saveFailed"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwNew.trim()) { toast.error(t("mypage.passwordModal.passwordRequired")); return; }
    if (pwNew.length < 6) { toast.error(t("mypage.passwordModal.passwordTooShort")); return; }
    if (pwNew !== pwConfirm) { toast.error(t("mypage.passwordModal.passwordMismatch")); return; }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      toast.success(t("mypage.passwordModal.changeSuccess"));
      setPwNew(""); setPwConfirm("");
      setShowPasswordChange(false);
    } catch (err: any) {
      toast.error(err.message || t("mypage.passwordModal.changeFailed"));
    } finally {
      setSavingPassword(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="h-full overflow-y-auto bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="text-center max-w-md mx-auto"
        >
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] mx-auto mb-6 flex items-center justify-center shadow-[0_10px_30px_rgba(99,102,241,0.4)] border border-white/20"
          >
            <User className="w-12 h-12 text-white" />
          </motion.div>
          <h2 className="text-3xl font-extrabold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">{t("mypage.loginRequiredTitle")}</h2>
          <p className="text-muted-foreground mb-8 text-[15px]">
            {t("mypage.loginRequiredDescLine1")}<br/>
            {t("mypage.loginRequiredDescLine2")}
          </p>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={onSignInClick}
              className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 transition-opacity py-7 text-lg font-bold shadow-[0_10px_20px_-10px_rgba(99,102,241,0.5)] border border-white/10 rounded-xl"
            >
              {t("mypage.loginButton")}
            </Button>
          </motion.div>
        </motion.div>
        </div>
        <Footer onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="mx-auto mb-4 w-10 h-10 text-[#6366f1]"
          >
            <Loader2 className="w-10 h-10" />
          </motion.div>
          <p className="text-muted-foreground font-medium">{t("mypage.profileLoading")}</p>
        </motion.div>
        </div>
        <Footer onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  // 모드 선택 화면
  if (pageMode === 'select') {
    return (
      <ModeSelectScreen
        isCreator={isCreator}
        onSelectUser={() => handleSelectMode('user')}
        onSelectCreator={() => handleSelectMode('creator')}
      />
    );
  }

  // 영상 0개인 사용자가 크리에이터 모드 진입 시: 안내 화면
  if (pageMode === 'creator' && !isCreator) {
    return <CreatorOnboardingScreen onBack={handleBackToSelect} />;
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] selection:bg-[#6366f1]/30 pb-20">
      <CommentSettings open={showCommentSettings} onClose={() => setShowCommentSettings(false)} />
      {/* Phase 22: 영상 편집 모달 */}
      {editingVideo && (
        <VideoEditModal
          open={!!editingVideo}
          videoId={editingVideo.id}
          initialThumbnail={editingVideo.thumbnail}
          initialChapters={editingVideo.chapters}
          initialSubtitleUrl={editingVideo.subtitle_url}
          initialAgeRating={editingVideo.age_rating}
          onClose={() => setEditingVideo(null)}
          onSaved={() => { setEditingVideo(null); /* 추후 myProducts 갱신 */ }}
        />
      )}
      <div className="max-w-6xl mx-auto md:p-6 pb-6">

      {/* 모드 표시 + 코너 전환 버튼 */}
      <div className="px-4 md:px-0 pt-4 md:pt-0 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${
            pageMode === 'creator'
              ? 'bg-gradient-to-br from-amber-500 to-orange-500'
              : 'bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]'
          }`}>
            {pageMode === 'creator' ? <Crown className="w-4 h-4 text-white" /> : <ShoppingBag className="w-4 h-4 text-white" />}
          </div>
          <span className="text-sm font-bold text-white">
            {pageMode === 'creator' ? t("mypage.header.creatorCorner") : t("mypage.header.userCorner")}
          </span>
        </div>
        <button
          onClick={handleBackToSelect}
          className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5"
        >
          <ChevronRight className="w-3.5 h-3.5 rotate-180" />
          {t("mypage.header.otherCorner")}
        </button>
      </div>

      {/* Profile Header Parallax/Entrance */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-[#121212] md:rounded-3xl overflow-hidden border border-white/5 shadow-xl mb-6"
      >
        <div className="h-32 md:h-40 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] opacity-90" />
        <div className="px-6 pb-6 relative z-10">
          <div className="relative -mt-16 mb-4 flex items-end justify-between">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
              className="w-28 h-28 rounded-full border-[6px] border-[#121212] overflow-hidden shadow-lg"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={user?.name || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-4xl font-bold">
                  {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
                </div>
              )}
            </motion.div>
            <div className="flex items-center gap-2 mb-2">
              {onViewMyChannel && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    onClick={onViewMyChannel}
                    className="bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] hover:opacity-90 text-white font-semibold rounded-lg shadow-md shadow-[#8b5cf6]/30 gap-2 border-0"
                  >
                    <Tv className="w-4 h-4" />
                    {t("mypage.header.myChannel")}
                  </Button>
                </motion.div>
              )}
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditName(user?.name || "");
                    setEditBio(profile?.bio || "");
                    setEditAvatarUrl(profile?.avatar_url || "");
                    setEditBannerUrl(profile?.banner_url || "");
                    setShowProfileEdit(true);
                  }}
                  className="bg-white/5 border-white/10 hover:bg-white/10 text-white font-semibold rounded-lg shadow-sm gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  {t("mypage.header.editProfile")}
                </Button>
              </motion.div>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white mb-1 drop-shadow-sm">{user?.name || 'AI Creator'}</h2>
            <p className="text-sm font-medium text-[#6366f1] mb-6">{user?.email}</p>
          </div>
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-3 gap-3 md:gap-5"
          >
            {[
              { label: t("mypage.statsTotalSales"), value: totalSales, color: 'text-[#6366f1]' },
              { label: t("mypage.statsProducts"), value: myProducts.length, color: 'text-[#8b5cf6]' },
              { label: t("mypage.statsRating"), value: '4.8', color: 'text-[#10b981]' },
            ].map((stat, idx) => (
              <motion.div 
                key={idx}
                variants={itemVariants} 
                whileHover={{ y: -5, scale: 1.02 }}
                className="bg-[#1c1c1e] p-4 rounded-2xl border border-white/5 text-center flex flex-col justify-center shadow-sm hover:border-white/10 transition-colors cursor-default"
              >
                <p className={`text-2xl md:text-3xl font-black mb-1 drop-shadow-sm ${stat.color}`}>{stat.value}</p>
                <p className="text-[11px] md:text-xs font-bold text-gray-500 uppercase tracking-wider">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Tabs Layout */}
      <div className="px-4 md:px-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList
            className={`grid w-full ${pageMode === 'creator' && isCreator ? 'grid-cols-6' : 'grid-cols-5'} bg-[#1c1c1e] p-1.5 rounded-2xl mb-8 border border-white/5 shadow-inner`}
          >
            {([
              { id: 'profile', icon: User, label: t('mypage.tabs.profile') },
              ...(pageMode === 'user' ? [{ id: 'purchases', icon: ShoppingBag, label: t('mypage.tabs.purchases') }] : []),
              ...(pageMode === 'creator' && isCreator ? [{ id: 'sales', icon: TrendingUp, label: t('mypage.tabs.sales') }] : []),
              ...(pageMode === 'creator' && isCreator ? [{ id: 'comments', icon: MessageSquare, label: t('mypage.tabs.comments') }] : []),
              { id: 'history', icon: Clock, label: t('mypage.tabs.watchHistory') },
              { id: 'playlists', icon: FolderPlus, label: t('mypage.tabs.playlists') },
              { id: 'settings', icon: Settings, label: t('mypage.tabs.settings') },
            ] as { id: string; icon: any; label: string }[]).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`relative py-3 rounded-xl transition-all duration-300 font-bold text-[13px] md:text-sm
                    ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}
                  data-[state=active]:bg-transparent data-[state=active]:shadow-none`}
                >
                  <Icon className="w-4 h-4 mr-1.5 hidden md:block relative z-10" />
                  <span className="relative z-10 flex items-center justify-center">
                    {tab.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="mypage-active-tab"
                      className="absolute inset-0 bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899] rounded-xl shadow-lg shadow-[#8b5cf6]/30 -z-0"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <TabsContent value="profile" className="space-y-4 m-0">
                {/* 구독 상태 카드 */}
                <div className={`relative bg-gradient-to-br ${tierMeta.color} p-5 md:p-6 rounded-2xl border border-white/10 shadow-md overflow-hidden`}>
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mb-2">{t("mypage.subscription.currentTier")}</p>
                      <p className="text-2xl font-black text-white drop-shadow-sm flex items-center gap-2">
                        <TierIcon className="w-6 h-6" />
                        {tierMeta.label}
                      </p>
                      <p className="text-xs font-medium text-white/80 mt-1">{tierMeta.desc}</p>
                      {isSubscriber && profile?.subscription_expires_at && (
                        <p className="text-[11px] text-white/60 mt-2">
                          {t("mypage.subscription.expiresAt", { date: new Date(profile.subscription_expires_at).toLocaleDateString() })}
                        </p>
                      )}
                    </div>
                    {!isSubscriber && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toast.info(t("mypage.subscription.upgradeComingSoon"))}
                        className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-bold border border-white/20 transition-colors shadow-sm"
                      >
                        {t("mypage.subscription.upgrade")}
                      </motion.button>
                    )}
                  </div>
                  <TierIcon className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10 rotate-12" />
                </div>

                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="text-lg font-bold text-white mb-5 flex items-center"><User className="w-5 h-5 mr-2 text-[#6366f1]" />{t("mypage.account.title")}</h3>
                  <div className="space-y-4">
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between group hover:border-white/10 transition-colors">
                      <div>
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t("mypage.account.email")}</p>
                        <p className="text-gray-200 font-medium">{user?.email}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 hidden md:block" />
                    </div>
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between group hover:border-white/10 transition-colors">
                      <div>
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t("mypage.account.name")}</p>
                        <p className="text-gray-200 font-medium">{user?.name}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 hidden md:block" />
                    </div>
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between group hover:border-white/10 transition-colors">
                      <div>
                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t("mypage.account.accountType")}</p>
                        <p className="inline-flex items-center gap-2 text-gray-200 font-medium">
                          {isCreator ? t("mypage.account.creator") : t("mypage.account.regular")}
                          {isCreator && (
                            <span className="px-2 py-0.5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded text-[10px] font-black tracking-wider shadow-sm">
                              CREATOR
                            </span>
                          )}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 hidden md:block" />
                    </div>
                  </div>
                </div>

                {/* 정산 계좌 — 크리에이터에게만 노출 */}
                {isCreator && (
                  <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                    <h3 className="text-lg font-bold text-white mb-5 flex items-center"><CreditCard className="w-5 h-5 mr-2 text-[#8b5cf6]" />{t("mypage.payout.title")}</h3>
                    <div className="bg-[#1c1c1e] p-5 rounded-xl border border-white/5 flex items-center justify-between relative overflow-hidden group">
                      <div className="relative z-10">
                        {profile?.payout_info?.bank_name ? (
                          <>
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">{profile.payout_info.bank_name}</p>
                            <p className="text-lg text-gray-200 font-medium tracking-wider">{profile.payout_info.account_number}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">{t("mypage.payout.notRegistered")}</p>
                            <p className="text-sm text-gray-400 font-medium">{t("mypage.payout.registerHint")}</p>
                          </>
                        )}
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toast.info(t("mypage.payout.comingSoon"))}
                        className="relative z-10 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-bold border border-white/10 transition-colors shadow-sm"
                      >
                        {profile?.payout_info?.bank_name ? t("mypage.payout.change") : t("mypage.payout.register")}
                      </motion.button>
                      <CreditCard className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 rotate-12 group-hover:text-white/10 transition-colors" />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="purchases" className="space-y-4 m-0">
                <div className="bg-gradient-to-r from-[#1E1E24] to-[#121212] p-6 rounded-2xl border border-white/5 shadow-md mb-6 relative overflow-hidden">
                  <div className="relative z-10">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t("mypage.purchases.totalSpent")}</p>
                    <p className="text-3xl font-black text-white drop-shadow-sm">₩{purchaseHistory.reduce((sum, p) => sum + p.price, 0).toLocaleString()}</p>
                  </div>
                  <ShoppingBag className="absolute right-4 top-1/2 -translate-y-1/2 w-20 h-20 text-[#6366f1]/20 rotate-[-15deg]" />
                </div>

                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {purchaseHistory.map((purchase) => (
                    <motion.div key={purchase.id} variants={itemVariants} className="bg-[#121212] rounded-2xl border border-white/5 overflow-hidden flex hover:border-white/10 transition-colors group">
                      <div className="relative w-28 md:w-36 h-full flex-shrink-0 bg-black">
                        <img 
                          src={purchase.thumbnail} 
                          alt={purchase.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#121212]" />
                      </div>
                      <div className="p-4 flex flex-col flex-1 pb-4">
                        <h3 className="font-bold text-gray-200 mb-1 line-clamp-1">{purchase.title}</h3>
                        <p className="text-[10px] text-gray-500 font-medium mb-3">{purchase.date}</p>
                        
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-2 py-0.5 bg-[#6366f1]/10 border border-[#6366f1]/20 text-[#6366f1] rounded text-[10px] font-bold">
                            {purchase.license}
                          </span>
                          <span className="font-bold text-gray-300">₩{purchase.price.toLocaleString()}</span>
                        </div>
                        
                        <div className="flex gap-2 mt-auto">
                          <motion.button
                            onClick={() => handleDownloadPurchase(purchase)}
                            disabled={downloadingId === purchase.id}
                            whileHover={{ scale: downloadingId === purchase.id ? 1 : 1.02 }}
                            whileTap={{ scale: downloadingId === purchase.id ? 1 : 0.98 }}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 rounded-lg transition-colors border border-white/5 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1.5"
                          >
                            {downloadingId === purchase.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t("mypage.purchases.downloading")}
                              </>
                            ) : (
                              <>
                                <Download className="w-3 h-3" />
                                {t("mypage.purchases.download")}
                              </>
                            )}
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {purchaseHistory.length === 0 && (
                    <div className="col-span-full py-10 text-center text-gray-500 font-medium bg-[#121212] rounded-2xl border border-white/5">
                      {t("mypage.purchases.empty")}
                    </div>
                  )}
                </motion.div>
              </TabsContent>

              <TabsContent value="sales" className="space-y-4 m-0">
                {/* 수익 정책 안내 링크 (대시보드 위) */}
                <a
                  href="?info=creator-revenue"
                  className="flex items-center gap-3 p-3 md:p-4 rounded-xl bg-gradient-to-br from-[#a78bfa]/10 to-[#ec4899]/10 border border-[#a78bfa]/20 hover:border-[#a78bfa]/40 transition-colors group"
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-[#a78bfa]/15 flex items-center justify-center text-[#a78bfa] text-base">
                    📊
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{t("mypage.sales.revenueGuideLabel")}</p>
                    <p className="text-xs text-gray-400">{t("mypage.sales.revenueGuideDesc")}</p>
                  </div>
                  <span className="text-xs text-[#a78bfa] group-hover:translate-x-0.5 transition-transform">→</span>
                </a>

                {/* Phase 21: 크리에이터 대시보드 (KPI 4개 + 일별 그래프) */}
                <CreatorDashboard />

                {/* 기존 KPI 2개 (실 정산액 — 수수료 공제 후 미리보기) */}
                <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-4">
                  <motion.div variants={itemVariants} className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="relative z-10">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t("mypage.sales.totalRevenue")}</p>
                      <p className="text-2xl font-black text-white">₩{totalRevenue.toLocaleString()}</p>
                    </div>
                    <DollarSign className="absolute right-2 bottom-2 w-16 h-16 text-[#6366f1]/10 group-hover:scale-110 transition-transform duration-500" />
                  </motion.div>
                  <motion.div variants={itemVariants} className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="relative z-10">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">{t("mypage.sales.netPayout")}</p>
                      <p className="text-2xl font-black text-[#8b5cf6]">₩{expectedPayout.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-500 font-medium mt-1">{t("mypage.sales.feeNote", { rate: Math.round((1 - CREATOR_SHARE_SALE) * 100) })}</p>
                    </div>
                    <TrendingUp className="absolute right-2 bottom-2 w-16 h-16 text-[#8b5cf6]/10 group-hover:scale-110 transition-transform duration-500" />
                  </motion.div>
                </motion.div>

                {/* 광고 수익 통계 */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-gradient-to-br from-[#1a1a1c] to-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-400" />
                      {t("mypage.sales.adRevenue")}
                    </h3>
                    <span className="text-[10px] text-gray-500 font-medium">{t("mypage.sales.adRevenueDetail", { cpm: AD_CPM_KRW.toLocaleString(), share: Math.round(avgAdShare * 100) })}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[#1c1c1e] p-3 rounded-xl border border-white/5 text-center">
                      <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{t("mypage.sales.impressions")}</p>
                      <p className="text-lg font-black text-white">{adStats.impressions.toLocaleString()}</p>
                    </div>
                    <div className="bg-[#1c1c1e] p-3 rounded-xl border border-white/5 text-center">
                      <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">{t("mypage.sales.clicks")}</p>
                      <p className="text-lg font-black text-white">{adStats.clicks.toLocaleString()}</p>
                    </div>
                    <div className="bg-[#1c1c1e] p-3 rounded-xl border border-white/5 text-center">
                      <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">CTR</p>
                      <p className="text-lg font-black text-white">{adCTR.toFixed(2)}%</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 p-3 rounded-xl border border-amber-500/30 text-center">
                      <p className="text-[10px] text-amber-300/80 font-bold uppercase mb-1">{t("mypage.sales.estimatedRevenue")}</p>
                      <p className="text-lg font-black text-amber-300">₩{adCreatorPayout.toLocaleString()}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Payout Schedule */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-r from-[#6366f1]/10 to-[#8b5cf6]/10 p-5 rounded-2xl border border-[#6366f1]/20 shadow-inner">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#6366f1]/20 flex items-center justify-center shrink-0">
                      <CreditCard className="w-5 h-5 text-[#6366f1]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white mb-1">{t("mypage.sales.nextPayoutTitle")}</h4>
                      <p className="text-[13px] text-gray-300 font-medium mb-1">
                        {(() => {
                          const now = new Date();
                          const nextPayout = new Date(now.getFullYear(), now.getDate() <= 15 ? now.getMonth() : now.getMonth() + 1, 15);
                          return t("mypage.sales.payoutDate", { year: nextPayout.getFullYear(), month: nextPayout.getMonth() + 1, day: nextPayout.getDate() });
                        })()} • <span className="font-bold text-[#8b5cf6]">₩{expectedPayout.toLocaleString()}</span>
                      </p>
                      <p className="text-[11px] text-gray-500">{t("mypage.sales.payoutSchedule")}</p>
                    </div>
                  </div>
                </motion.div>

                {/* Sales Chart */}
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-6">{t("mypage.sales.monthlyRevenueTrend")}</h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlySales} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="month" stroke="#666" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 500 }} dy={10} />
                        <YAxis stroke="#666" axisLine={false} tickLine={false} tickFormatter={(val) => `₩${formatCompactNumber(val)}`} tick={{ fontSize: 12, fontWeight: 500 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', color: '#fff' }}
                          itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                          formatter={(value: number) => [`₩${value.toLocaleString()}`, t("mypage.sales.revenue")]}
                          cursor={{ stroke: '#333', strokeWidth: 2 }}
                        />
                        <Line type="monotone" dataKey="sales" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#121212' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>

                {/* Product List */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-5 flex items-center justify-between">
                    {t("mypage.sales.registeredProducts")}
                    <span className="px-2.5 py-1 bg-white/5 text-gray-400 rounded-md text-[11px]">{t("mypage.sales.productsCount", { count: myProducts.length })}</span>
                  </h3>
                  <div className="space-y-4">
                    {myProducts.map((product) => (
                      <div key={product.id} className="flex gap-4 pb-4 border-b border-white/5 last:border-0 last:pb-0 group">
                        <div className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden bg-black">
                          <img 
                            src={product.thumbnail} 
                            alt={product.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                          <h4 className="font-bold text-gray-200 mb-2 line-clamp-1">{product.title}</h4>
                          <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-500 mb-2 bg-[#1c1c1e] p-2 rounded-lg border border-white/5">
                            <div className="text-center">
                              <p className="mb-0.5">{t("mypage.sales.viewsLabel")}</p>
                              <p className="text-white font-bold">{product.views.toLocaleString()}</p>
                            </div>
                            <div className="text-center border-x border-white/5">
                              <p className="mb-0.5">{t("mypage.sales.salesLabel")}</p>
                              <p className="text-white font-bold">{t("mypage.sales.salesCount", { count: product.sales })}</p>
                            </div>
                            <div className="text-center">
                              <p className="mb-0.5">{t("mypage.sales.salesRevenue")}</p>
                              <p className="text-[#8b5cf6] font-bold">₩{product.revenue.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 bg-[#10b981]/10 border border-[#10b981]/20 text-[#10b981] rounded text-[10px] font-bold shadow-sm">
                              {product.status}
                            </span>
                            <button
                              onClick={() => handleOpenEditVideo(product.id, product.thumbnail)}
                              className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              {t("mypage.sales.edit")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {myProducts.length === 0 && (
                       <div className="py-8 text-center text-gray-500 font-medium">
                         {t("mypage.sales.noProducts")}
                       </div>
                    )}
                  </div>
                </motion.div>

                {/* 수익 창출 가이드 */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#6366f1]" />
                    {t("mypage.sales.guideTitle")}
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5">
                      <p className="font-bold text-white mb-1.5">{t("mypage.sales.guideRevenueSources")}</p>
                      <p className="text-gray-400 text-[13px] leading-relaxed">
                        <span className="text-white font-medium">{t("mypage.sales.guideRevenueSources1")}</span>: <span className="text-[#8b5cf6] font-bold">{Math.round(CREATOR_SHARE_SALE * 100)}%</span><br />
                        <span className="text-white font-medium">{t("mypage.sales.guideRevenueSources2")}</span>: Home <span className="text-amber-300 font-bold">{Math.round(CREATOR_SHARE_HOME * 100)}%</span> / Cinema <span className="text-amber-300 font-bold">{Math.round(CREATOR_SHARE_CINEMA * 100)}%</span> / OTT <span className="text-amber-300 font-bold">{Math.round(CREATOR_SHARE_OTT * 100)}%</span>
                      </p>
                    </div>
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5">
                      <p className="font-bold text-white mb-1.5">{t("mypage.sales.guidePayoutCycle")}</p>
                      <p className="text-gray-400 text-[13px] leading-relaxed">
                        {t("mypage.sales.payoutSchedule")} (Min ₩{PAYOUT_MIN_KRW.toLocaleString()})
                      </p>
                    </div>
                    <div className="bg-[#1c1c1e] p-4 rounded-xl border border-white/5">
                      <p className="font-bold text-white mb-1.5">{t("mypage.sales.guideTips")}</p>
                      <ul className="text-gray-400 text-[13px] leading-relaxed space-y-1 list-disc list-inside">
                        <li>{t("mypage.sales.guideTip1")}</li>
                        <li>{t("mypage.sales.guideTip2")}</li>
                        <li>{t("mypage.sales.guideTip3")}</li>
                        <li>{t("mypage.sales.guideTip4")}</li>
                      </ul>
                    </div>
                  </div>
                </motion.div>

                {/* 주의사항 / 약관 */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-amber-500/20 shadow-sm">
                  <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-amber-400" />
                    {t("mypage.sales.warningTitle")}
                  </h3>
                  <div className="space-y-3 text-[13px]">
                    <div className="flex gap-3">
                      <div className="w-1 bg-amber-500/50 rounded-full shrink-0" />
                      <div>
                        <p className="font-bold text-white mb-0.5">{t("mypage.sales.warningCopyrightTitle")}</p>
                        <p className="text-gray-400 leading-relaxed">{t("mypage.sales.warningCopyrightDesc")}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-1 bg-amber-500/50 rounded-full shrink-0" />
                      <div>
                        <p className="font-bold text-white mb-0.5">{t("mypage.sales.warningAiTitle")}</p>
                        <p className="text-gray-400 leading-relaxed">{t("mypage.sales.warningAiDesc")}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-1 bg-red-500/50 rounded-full shrink-0" />
                      <div>
                        <p className="font-bold text-white mb-0.5">{t("mypage.sales.warningProhibitedTitle")}</p>
                        <p className="text-gray-400 leading-relaxed">{t("mypage.sales.warningProhibitedDesc")}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-1 bg-amber-500/50 rounded-full shrink-0" />
                      <div>
                        <p className="font-bold text-white mb-0.5">{t("mypage.sales.warningPayoutAccuracyTitle")}</p>
                        <p className="text-gray-400 leading-relaxed">{t("mypage.sales.warningPayoutAccuracyDesc")}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-1 bg-gray-500/50 rounded-full shrink-0" />
                      <div>
                        <p className="font-bold text-white mb-0.5">{t("mypage.sales.warningStagedTitle")}</p>
                        <p className="text-gray-400 leading-relaxed">{t("mypage.sales.warningStagedDesc")}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </TabsContent>

              {/* Phase 23: 댓글 관리 탭 (크리에이터 전용) */}
              <TabsContent value="comments" className="space-y-4 m-0">
                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-md">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white">{t("mypage.commentsTab.title")}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{t("mypage.commentsTab.subtitle")}</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 mb-5">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <Filter className="w-5 h-5 text-[#8b5cf6] mb-2" />
                      <p className="text-sm font-bold text-white mb-1">{t("mypage.commentsTab.filterWords")}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{t("mypage.commentsTab.filterWordsDesc")}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <Lock className="w-5 h-5 text-[#f43f5e] mb-2" />
                      <p className="text-sm font-bold text-white mb-1">{t("mypage.commentsTab.blockedUsers")}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{t("mypage.commentsTab.blockedUsersDesc")}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <Eye className="w-5 h-5 text-amber-400 mb-2" />
                      <p className="text-sm font-bold text-white mb-1">{t("mypage.commentsTab.filterReview")}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{t("mypage.commentsTab.filterReviewDesc")}</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => setShowCommentSettings(true)}
                    className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white font-bold rounded-xl py-3 gap-2"
                  >
                    <Filter className="w-4 h-4" />
                    {t("mypage.commentsTab.openButton")}
                  </Button>

                  <p className="text-[11px] text-gray-600 text-center mt-3">
                    {t("mypage.commentsTab.directHint")}
                  </p>
                </div>
              </TabsContent>

              {/* Phase 17: 시청 기록 탭 */}
              <TabsContent value="history" className="space-y-4 m-0">
                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-white flex items-center">
                      <Clock className="w-5 h-5 mr-2 text-gray-400" />
                      {t("mypage.watchHistory.title")}
                    </h3>
                    {watchHistory.length > 0 && (
                      <button
                        onClick={handleClearAllHistory}
                        className="text-xs text-red-400 hover:text-red-300 font-medium"
                      >
                        {t("mypage.watchHistory.clearAll")}
                      </button>
                    )}
                  </div>

                  {watchHistoryLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-7 h-7 text-[#6366f1] animate-spin" />
                    </div>
                  ) : watchHistory.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">{t("mypage.watchHistory.empty")}</p>
                      <p className="text-xs mt-1 text-gray-600">{t("mypage.watchHistory.emptyHint")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {watchHistory.map((h: any) => {
                        const pct = h.watch_ratio ? Math.round(h.watch_ratio * 100) : 0;
                        const date = new Date(h.occurred_at);
                        const dateStr = date.toLocaleString(undefined, {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        });
                        return (
                          <div
                            key={h.view_id}
                            className="flex gap-3 p-2.5 rounded-lg bg-[#1c1c1e] hover:bg-[#2a2a2e] transition-colors group"
                          >
                            <button
                              onClick={() => onVideoClick?.(h.video_id)}
                              className="flex gap-3 flex-1 min-w-0 text-left"
                            >
                              {h.thumbnail ? (
                                <img
                                  src={h.thumbnail}
                                  alt=""
                                  className="w-24 h-16 rounded object-cover flex-shrink-0 bg-muted"
                                />
                              ) : (
                                <div className="w-24 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                  <Film className="w-5 h-5 text-muted-foreground/40" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white truncate">{h.title || t("mypage.watchHistory.noTitle")}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                  {h.creator_name || t("mypage.watchHistory.nameless")} · {dateStr}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${
                                        h.is_valid ? 'bg-[#8b5cf6]' : 'bg-amber-400/50'
                                      }`}
                                      style={{ width: `${Math.max(pct, 2)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-mono text-gray-500">{pct}%</span>
                                </div>
                              </div>
                            </button>
                            <button
                              onClick={() => handleDeleteHistoryItem(h.video_id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-red-500/15 text-red-400 self-start"
                              title={t("mypage.watchHistory.deleteEntry")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Phase 18: 플레이리스트 탭 */}
              <TabsContent value="playlists" className="space-y-4 m-0">
                {activePlaylistId ? (
                  /* ── 플레이리스트 상세 (영상 목록) ─────────────────── */
                  <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                    <div className="flex items-center gap-3 mb-5">
                      <button
                        onClick={() => setActivePlaylistId(null)}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                        title={t("mypage.playlist.backToList")}
                      >
                        <ArrowLeft className="w-5 h-5 text-white" />
                      </button>
                      <h3 className="font-bold text-white text-lg flex-1 truncate">{activePlaylistName}</h3>
                      <span className="text-xs text-gray-500 font-bold">{t("mypage.playlist.videosCount", { count: playlistVideos.length })}</span>
                    </div>

                    {playlistVideosLoading ? (
                      <div className="py-12 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                      </div>
                    ) : playlistVideos.length === 0 ? (
                      <div className="py-12 text-center text-sm text-gray-500">
                        {t("mypage.playlist.playlistEmpty")}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {playlistVideos.map((v: any) => (
                          <div key={v.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                            <button
                              onClick={() => onVideoClick?.(v.id)}
                              className="relative flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden bg-black group/thumb"
                              title={t("mypage.playlist.playVideo")}
                            >
                              {v.thumbnail ? (
                                <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[#1c1c1e] to-[#2d2d30]" />
                              )}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 bg-black/40 transition-opacity">
                                <Play className="w-6 h-6 text-white fill-white" />
                              </div>
                              {v.duration && (
                                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-white text-[10px] font-bold">
                                  {v.duration}
                                </div>
                              )}
                            </button>
                            <button
                              onClick={() => onVideoClick?.(v.id)}
                              className="flex-1 min-w-0 text-left"
                            >
                              <p className="text-sm font-bold text-white line-clamp-2 leading-tight mb-0.5">{v.title}</p>
                              <p className="text-xs text-gray-500 line-clamp-1">{v.creator_display_name || v.creator}</p>
                            </button>
                            <button
                              onClick={() => handleRemoveFromPlaylist(v.id)}
                              className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                              title={t("mypage.playlist.removeFromPlaylist")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── 플레이리스트 그리드 ─────────────────────────── */
                  <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="font-bold text-white flex items-center">
                        <FolderPlus className="w-5 h-5 mr-2 text-[#8b5cf6]" />
                        {t("mypage.playlist.myPlaylists")}
                      </h3>
                      <span className="text-xs text-gray-500 font-bold">{t("mypage.playlist.count", { count: playlists.length })}</span>
                    </div>

                    {playlistsLoading ? (
                      <div className="py-12 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
                      </div>
                    ) : playlists.length === 0 ? (
                      <div className="py-12 text-center">
                        <FolderPlus className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                        <p className="text-sm text-gray-400 mb-1">{t("mypage.playlist.empty")}</p>
                        <p className="text-xs text-gray-500">{t("mypage.playlist.emptyHint")}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {playlists.map((pl: any) => (
                          <div key={pl.id} className="relative group">
                            <button
                              onClick={() => {
                                setActivePlaylistId(pl.id);
                                setActivePlaylistName(pl.name);
                              }}
                              className="block w-full text-left rounded-xl overflow-hidden border border-white/5 hover:border-[#8b5cf6]/60 bg-[#1c1c1e] hover:bg-[#222226] transition-all"
                            >
                              <div className="relative aspect-video bg-black">
                                {pl.preview_thumbnail ? (
                                  <img src={pl.preview_thumbnail} alt={pl.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-[#1c1c1e] to-[#2d2d30] flex items-center justify-center">
                                    <FolderPlus className="w-10 h-10 text-gray-700" />
                                  </div>
                                )}
                                {/* 영상 개수 뱃지 */}
                                <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/80 backdrop-blur-sm rounded text-white text-[11px] font-bold">
                                  {t("mypage.playlist.count", { count: pl.video_count })}
                                </div>
                                {/* Watch Later 표시 */}
                                {pl.is_watch_later && (
                                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-[#ec4899]/90 backdrop-blur-sm rounded-full text-white text-[10px] font-black flex items-center gap-1">
                                    <Bookmark className="w-3 h-3 fill-white" />
                                    {t("mypage.playlist.watchLaterLabel")}
                                  </div>
                                )}
                              </div>
                              <div className="p-3">
                                <p className="text-sm font-bold text-white line-clamp-1">{pl.name}</p>
                              </div>
                            </button>
                            {/* 삭제 버튼 (Watch Later 제외) */}
                            {!pl.is_watch_later && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePlaylist(pl.id, pl.name, pl.is_watch_later);
                                }}
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-all"
                                title={t("mypage.playlist.deletePlaylist")}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 m-0">
                {/* Phase 34: 알림 설정 (이메일/푸시 ON·OFF) */}
                <NotificationSettings />

                {/* C1: 결제 내역 + 환불 요청 (Terms 7조 ③항 이행) */}
                <MyPaymentsSection />

                {/* Phase 32: 세금 정보 등록 (3.3% 원천징수 / 사업자 세금계산서) */}
                <TaxInfoSection />

                {/* Phase 24: 차단한 사용자 관리 */}
                <BlockedUsersSection />

                {/* Phase 27: 내 데이터 다운로드 (개인정보보호법 데이터 이동권) */}
                <DataDownloadSection />

                <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
                  <h3 className="font-bold text-white mb-5">{t("mypage.settings.accountSecurity")}</h3>
                  <div className="space-y-3">
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      <Button
                        variant="outline"
                        onClick={() => { setPwNew(""); setPwConfirm(""); setShowPasswordChange(true); }}
                        className="w-full justify-between bg-[#1c1c1e] text-gray-300 border-white/5 hover:bg-white/5 hover:text-white font-medium rounded-xl h-12 shadow-sm"
                      >
                        <span className="flex items-center gap-2"><Lock className="w-4 h-4" />{t("mypage.settings.changePassword")}</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                      <Button
                        variant="outline"
                        onClick={() => toast.info(t("mypage.settings.twoFactorComingSoon"))}
                        className="w-full justify-between bg-[#1c1c1e] text-gray-300 border-white/5 hover:bg-white/5 hover:text-white font-medium rounded-xl h-12 shadow-sm"
                      >
                        <span>{t("mypage.settings.twoFactorAuth")}</span>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  </div>
                </div>

                <div className="pt-4">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      variant="destructive" 
                      className="w-full gap-2 h-14 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-xl font-bold transition-all shadow-sm" 
                      onClick={() => {
                        signOut();
                        toast.success(t("mypage.settings.signOutSuccess"));
                      }}
                    >
                      <LogOut className="w-5 h-5" />
                      {t("mypage.settings.signOut")}
                    </Button>
                  </motion.div>

                  {/* PWA 앱 설치 안내 카드 */}
                  <InstallGuideCard />
                </div>

                {/* Phase 27: 위험 영역 — 계정 삭제 (가장 아래) */}
                <DangerZoneSection onSignOut={signOut} />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
    </div>

      {/* 프로필 편집 모달 */}
      <AnimatePresence>
        {showProfileEdit && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowProfileEdit(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-sm mx-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Pencil className="w-5 h-5 text-[#8b5cf6]" />{t("mypage.profileEditModal.title")}</h3>
                <button onClick={() => setShowProfileEdit(false)} className="p-1.5 hover:bg-white/10 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">{t("mypage.profileEditModal.emailLabel")}</label>
                <p className="px-4 py-3 bg-white/5 rounded-xl text-sm text-gray-500 border border-white/5">{user?.email}</p>
              </div>

              {/* 아바타 업로드 (Phase 6.6) */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">{t("mypage.profileEditModal.avatarLabel")}</label>
                <div className="flex items-center gap-3">
                  <label className="relative w-20 h-20 rounded-full cursor-pointer bg-gradient-to-br from-[#1E1E24] to-[#2B2B36] border-2 border-white/10 overflow-hidden hover:border-white/20 transition-colors shrink-0">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={uploadingAvatar}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarUpload(file);
                        e.target.value = '';
                      }}
                    />
                    {editAvatarUrl ? (
                      <img src={editAvatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                        <ImagePlus className="w-6 h-6" />
                      </div>
                    )}
                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-white" />
                      </div>
                    )}
                  </label>
                  <div className="flex-1">
                    <p className="text-[11px] text-gray-500 mb-1">{t("mypage.profileEditModal.avatarHint")}</p>
                    {editAvatarUrl && !uploadingAvatar && (
                      <button
                        type="button"
                        onClick={() => setEditAvatarUrl('')}
                        className="text-[11px] text-red-400 hover:text-red-300 font-medium"
                      >
                        {t("mypage.profileEditModal.remove")}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">{t("mypage.profileEditModal.displayNameLabel")}</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={30}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
                  placeholder={t("mypage.profileEditModal.displayNamePlaceholder")}
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">{t("mypage.profileEditModal.bioLabel")}</label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  maxLength={200}
                  rows={3}
                  placeholder={t("mypage.profileEditModal.bioPlaceholder")}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors resize-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">{editBio.length}/200</p>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">{t("mypage.profileEditModal.bannerLabel")}</label>
                <label className="relative block aspect-[3/1] cursor-pointer rounded-xl border border-white/10 border-dashed bg-white/5 overflow-hidden hover:bg-white/10 transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={uploadingBanner}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBannerUpload(file);
                      e.target.value = '';
                    }}
                  />
                  {editBannerUrl ? (
                    <img src={editBannerUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-xs gap-1.5">
                      <ImagePlus className="w-6 h-6" />
                      <span>{t("mypage.profileEditModal.bannerUploadPrompt")}</span>
                    </div>
                  )}
                  {uploadingBanner && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                  )}
                </label>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-gray-500">{t("mypage.profileEditModal.bannerHint")}</p>
                  {editBannerUrl && !uploadingBanner && (
                    <button
                      type="button"
                      onClick={() => setEditBannerUrl('')}
                      className="text-[11px] text-red-400 hover:text-red-300 font-medium"
                    >
                      {t("mypage.profileEditModal.remove")}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowProfileEdit(false)} className="flex-1 border-white/10">{t("mypage.profileEditModal.cancel")}</Button>
                <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile || !editName.trim()}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
                  {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : t("mypage.profileEditModal.save")}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 비밀번호 변경 모달 */}
      <AnimatePresence>
        {showPasswordChange && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowPasswordChange(false)}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring" as const, stiffness: 300, damping: 30 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-[#1a1a1c] rounded-2xl border border-white/10 p-5 max-w-sm mx-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Lock className="w-5 h-5 text-[#8b5cf6]" />{t("mypage.passwordModal.title")}</h3>
                <button onClick={() => setShowPasswordChange(false)} className="p-1.5 hover:bg-white/10 rounded-full text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">{t("mypage.passwordModal.newPasswordLabel")}</label>
                  <div className="relative">
                    <input type={showPwNew ? "text" : "password"} value={pwNew} onChange={e => setPwNew(e.target.value)}
                      placeholder={t("mypage.passwordModal.newPasswordPlaceholder")}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors" />
                    <button onClick={() => setShowPwNew(!showPwNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showPwNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">{t("mypage.passwordModal.confirmPasswordLabel")}</label>
                  <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
                    placeholder={t("mypage.passwordModal.confirmPasswordPlaceholder")}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors" />
                </div>
              </div>
              <p className="text-xs text-gray-600 mb-4">{t("mypage.passwordModal.socialHint")}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPasswordChange(false)} className="flex-1 border-white/10">{t("mypage.passwordModal.cancel")}</Button>
                <Button size="sm" onClick={handleChangePassword} disabled={savingPassword || !pwNew || !pwConfirm}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : t("mypage.passwordModal.change")}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <Footer onNavigate={onNavigate || (() => {})} />
  </div>
  );
}