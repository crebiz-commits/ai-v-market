import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Bell, Heart, MessageCircle, ShoppingBag, TrendingUp, Zap, CheckCheck, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { timeAgo } from "../utils/timeAgo";

interface Notification {
  id: string;
  type: "like" | "comment" | "purchase" | "sale" | "system" | "challenge" | "collab";
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  created_at: string;
}

// 미인증 샘플 알림의 읽음 상태를 localStorage 에 보관 — 패널을 닫으면 컴포넌트가 언마운트되고
//   재오픈 시 SAMPLE 이 다시 세팅돼 '읽었는데 또 안읽음'으로 보이던 문제 해결(로그인 유저는 DB가 담당).
const SAMPLE_READ_KEY = "creaite_sample_notif_read";
function loadSampleRead(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SAMPLE_READ_KEY) || "[]")); } catch { return new Set(); }
}
function saveSampleRead(ids: Set<string>) {
  try { localStorage.setItem(SAMPLE_READ_KEY, JSON.stringify([...ids])); } catch { /* 저장 실패 무시 */ }
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  like: <Heart className="w-4 h-4 text-red-400" />,
  comment: <MessageCircle className="w-4 h-4 text-blue-400" />,
  purchase: <ShoppingBag className="w-4 h-4 text-green-400" />,
  sale: <TrendingUp className="w-4 h-4 text-yellow-400" />,
  system: <Zap className="w-4 h-4 text-[#8b5cf6]" />,
  challenge: <Bell className="w-4 h-4 text-orange-400" />,
  collab: <MessageCircle className="w-4 h-4 text-purple-400" />,
};
const DEFAULT_ICON = <Zap className="w-4 h-4 text-[#8b5cf6]" />;

const TYPE_BG: Record<string, string> = {
  like: "bg-red-500/10",
  comment: "bg-blue-500/10",
  purchase: "bg-green-500/10",
  sale: "bg-yellow-500/10",
  system: "bg-[#6366f1]/10",
  challenge: "bg-orange-500/10",
  collab: "bg-purple-500/10",
};
const DEFAULT_BG = "bg-[#6366f1]/10";

interface NotificationPanelProps {
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
  /** 알림 클릭 시 link(예: "/?video=X", "/?tab=mypage")로 이동 */
  onNavigate?: (link: string) => void;
}

export function NotificationPanel({ onClose, onUnreadCountChange, onNavigate }: NotificationPanelProps) {
  const { t, i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  // 미인증 시 보여줄 샘플 알림
  const SAMPLE = useMemo<Notification[]>(() => [
    {
      id: "s1",
      type: "system",
      title: t("notificationPanel.sample.welcomeTitle"),
      body: t("notificationPanel.sample.welcomeBody"),
      read: false,
      created_at: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: "s2",
      type: "challenge",
      title: t("notificationPanel.sample.challengeTitle"),
      body: t("notificationPanel.sample.challengeBody"),
      read: false,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "s3",
      type: "system",
      title: t("notificationPanel.sample.newVideosTitle"),
      body: t("notificationPanel.sample.newVideosBody"),
      read: true,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ], [t]);
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);   // 정확한 미읽음 총계(30개 상한과 무관) — 헤더 배지·벨 리포트용
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);   // 이동 대상 없는 긴 공지/시스템 알림 전문 펼침
  const seenIdsRef = useRef<Set<string>>(new Set());   // fetch+실시간 공통 dedup — 중복 INSERT/재전송 시 미읽음 이중집계 방지

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      // 미인증에게만 샘플 티저. 로그인 유저는 실제 데이터만(0건이면 빈 상태) — 가짜 샘플/배지 불일치 방지.
      //   이전에 읽은 샘플은 localStorage 기록을 반영해 재오픈 시에도 읽음 유지.
      const seen = loadSampleRead();
      const samples = SAMPLE.map((n) => (seen.has(n.id) ? { ...n, read: true } : n));
      setNotifications(samples);
      setUnreadTotal(samples.filter((n) => !n.read).length);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 최근 30개 목록 + 정확한 미읽음 총계(별도 count) — 30개 상한 밖 미읽음도 벨에 정확히 반영.
      const [{ data, error }, { count }] = await Promise.all([
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false),
      ]);
      if (error) throw error;
      const notifs = (data as Notification[]) || [];
      seenIdsRef.current = new Set(notifs.map((n) => n.id));   // 목록 확정 시 seen 리셋(실시간 dedup 기준)
      setNotifications(notifs);
      const exactUnread = count ?? notifs.filter((n) => !n.read).length;
      setUnreadTotal(exactUnread);
      onUnreadCountChange?.(exactUnread);
    } catch {
      setNotifications([]);   // 에러 시에도 샘플 대신 빈 목록(로그인 유저)
      setUnreadTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, onUnreadCountChange, SAMPLE]);

  useEffect(() => {
    fetchNotifications();
    // 인증 상태 변화 시에만 재조회 — 콜백 정체성(SAMPLE/t 참조) 변화로 인한 재조회 루프
    //   (→ "Maximum update depth" 크래시) 방지. 언어 변경 등 콜백 재생성엔 재조회 안 함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // 패널이 열려 있는 동안 새 알림 실시간 반영 — App 의 벨 카운트 구독(notif-<id>)과 별개 채널.
  //   새 INSERT 를 목록 맨 위에 끼우고 미읽음 총계 +1(벨은 App 구독이 자체 +1 → 여기선 report 안 해 이중집계 방지).
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const channel = supabase
      .channel(`notif-panel-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notification;
          if (seenIdsRef.current.has(n.id)) return;   // 재전송·fetch 중복 → 목록·카운트 이중반영 방지
          seenIdsRef.current.add(n.id);
          setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
          if (!n.read) setUnreadTotal((c) => c + 1);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated, user?.id]);

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadTotal(0);
    if (isAuthenticated) onUnreadCountChange?.(0);
    if (!isAuthenticated) {
      // 샘플 전부 읽음으로 영속화(재오픈 시 유지)
      const s = loadSampleRead();
      notifications.forEach((n) => s.add(n.id));
      saveSampleRead(s);
      return;
    }
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("read", false);
    } catch {}
  };

  const markRead = async (id: string) => {
    const wasUnread = notifications.some((n) => n.id === id && !n.read);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (wasUnread) {
      const next = Math.max(0, unreadTotal - 1);   // 총계에서 감산(30개 상한 밖이어도 벨 정확)
      setUnreadTotal(next);
      if (isAuthenticated) onUnreadCountChange?.(next);
    }
    if (id.startsWith("s")) {
      // 샘플 읽음 영속화(재오픈 시 유지)
      const s = loadSampleRead();
      s.add(id);
      saveSampleRead(s);
      return;
    }
    if (!isAuthenticated) return;
    try {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    } catch {}
  };

  const handleClick = (notif: Notification) => {
    void markRead(notif.id);
    // link 있으면 해당 화면으로 이동 + 패널 닫기(샘플·"/"는 이동 안 함).
    const navigable = !notif.id.startsWith("s") && notif.link && notif.link !== "/";
    if (navigable) {
      onNavigate?.(notif.link!);
      onClose();
      return;
    }
    // 이동 대상 없는 알림(공지·시스템 등)은 전문 펼침 토글 — 긴 내용이 잘려 안 보이던 문제 해결.
    setExpandedId((cur) => (cur === notif.id ? null : notif.id));
  };

  const unreadCount = unreadTotal;   // 헤더 배지·"모두 읽음" 노출은 정확한 총계 기준(목록 30개 상한과 무관)

  return (
    <div className="flex flex-col h-full bg-[#111] border-l border-white/10 w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#8b5cf6]" />
          <span className="font-semibold text-white">{t("notificationPanel.title")}</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 bg-[#ef4444] rounded-full text-xs text-white font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              title={t("notificationPanel.markAllRead")}
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Bell className="w-10 h-10 text-gray-600 mb-3" />
            <p className="text-gray-500 text-sm">{t("notificationPanel.empty")}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {notifications.map((notif) => (
              <motion.button
                key={notif.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => handleClick(notif)}
                className={`w-full flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 ${
                  !notif.read ? "bg-white/[0.03]" : ""
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${TYPE_BG[notif.type] || DEFAULT_BG}`}>
                  {TYPE_ICON[notif.type] || DEFAULT_ICON}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${expandedId === notif.id ? "" : "line-clamp-2"} ${notif.read ? "text-gray-400" : "text-white font-medium"}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className={`text-xs text-gray-500 mt-0.5 whitespace-pre-wrap ${expandedId === notif.id ? "" : "line-clamp-1"}`}>{notif.body}</p>
                  )}
                  <p className="text-[11px] text-gray-600 mt-1">{timeAgo(notif.created_at, isKo)}</p>
                </div>
                {!notif.read && (
                  <div className="w-2 h-2 rounded-full bg-[#6366f1] mt-1.5 flex-shrink-0" />
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
