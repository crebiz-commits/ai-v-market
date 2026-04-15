import { useState, useEffect, useCallback } from "react";
import { X, Bell, Heart, MessageCircle, ShoppingBag, TrendingUp, Zap, CheckCheck, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

interface Notification {
  id: string;
  type: "like" | "comment" | "purchase" | "sale" | "system" | "challenge";
  title: string;
  body?: string;
  read: boolean;
  created_at: string;
}

// 미인증 시 보여줄 샘플 알림
const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: "s1",
    type: "system",
    title: "AI-V-Market에 오신 것을 환영합니다!",
    body: "로그인하면 맞춤 알림을 받을 수 있습니다.",
    read: false,
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: "s2",
    type: "challenge",
    title: "새 챌린지 시작: 미래 도시 영상 공모",
    body: "상금 500만원! 지금 참여해보세요.",
    read: false,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "s3",
    type: "system",
    title: "신규 AI 영상 15개가 업로드됐습니다",
    body: "탐색 탭에서 확인해보세요.",
    read: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

const TYPE_ICON: Record<string, React.ReactNode> = {
  like: <Heart className="w-4 h-4 text-red-400" />,
  comment: <MessageCircle className="w-4 h-4 text-blue-400" />,
  purchase: <ShoppingBag className="w-4 h-4 text-green-400" />,
  sale: <TrendingUp className="w-4 h-4 text-yellow-400" />,
  system: <Zap className="w-4 h-4 text-[#8b5cf6]" />,
  challenge: <Bell className="w-4 h-4 text-orange-400" />,
};

const TYPE_BG: Record<string, string> = {
  like: "bg-red-500/10",
  comment: "bg-blue-500/10",
  purchase: "bg-green-500/10",
  sale: "bg-yellow-500/10",
  system: "bg-[#6366f1]/10",
  challenge: "bg-orange-500/10",
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

interface NotificationPanelProps {
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationPanel({ onClose, onUnreadCountChange }: NotificationPanelProps) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications(SAMPLE_NOTIFICATIONS);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      const notifs = (data as Notification[]) || [];
      setNotifications(notifs.length > 0 ? notifs : SAMPLE_NOTIFICATIONS);
      onUnreadCountChange?.(notifs.filter((n) => !n.read).length);
    } catch {
      setNotifications(SAMPLE_NOTIFICATIONS);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, onUnreadCountChange]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onUnreadCountChange?.(0);
    if (!isAuthenticated) return;
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("read", false);
    } catch {}
  };

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    onUnreadCountChange?.(notifications.filter((n) => !n.read && n.id !== id).length);
    if (!isAuthenticated || id.startsWith("s")) return;
    try {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col h-full bg-[#111] border-l border-white/10 w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#8b5cf6]" />
          <span className="font-semibold text-white">알림</span>
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
              title="모두 읽음"
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
            <p className="text-gray-500 text-sm">알림이 없습니다</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {notifications.map((notif) => (
              <motion.button
                key={notif.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => markRead(notif.id)}
                className={`w-full flex gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 ${
                  !notif.read ? "bg-white/[0.03]" : ""
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${TYPE_BG[notif.type]}`}>
                  {TYPE_ICON[notif.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${notif.read ? "text-gray-400" : "text-white font-medium"}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{notif.body}</p>
                  )}
                  <p className="text-[11px] text-gray-600 mt-1">{timeAgo(notif.created_at)}</p>
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
