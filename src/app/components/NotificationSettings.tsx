// ════════════════════════════════════════════════════════════════════════════
// Phase 34 — 알림 설정 (MyPage 설정 탭)
//
// 동작:
//   - 진입 시: get_my_notification_preferences RPC로 현재 설정 로드
//   - 토글 변경 시: update_my_notification_preferences RPC로 즉시 저장
//   - 낙관적 업데이트 + 실패 시 롤백
//   - 푸시는 컬럼만 있고 FCM 미연동 → "준비 중" 표시 + 토글은 가능
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { Switch } from "./ui/switch";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NotificationPreferences {
  email_welcome: boolean;
  email_subscription_receipt: boolean;
  email_new_video_from_followed: boolean;
  email_comment_reply: boolean;
  email_new_follower: boolean;
  email_revenue_settled: boolean;
  email_report_result: boolean;
  email_ad_budget_low: boolean;
  push_welcome: boolean;
  push_subscription_receipt: boolean;
  push_new_video_from_followed: boolean;
  push_comment_reply: boolean;
  push_new_follower: boolean;
  push_revenue_settled: boolean;
  push_report_result: boolean;
  push_ad_budget_low: boolean;
}

interface NotificationItem {
  emailKey: keyof NotificationPreferences;
  pushKey: keyof NotificationPreferences;
  label: string;
  description: string;
}

const ITEMS: NotificationItem[] = [
  {
    emailKey: "email_welcome",
    pushKey: "push_welcome",
    label: "환영 메일",
    description: "가입 시 받는 환영 메일",
  },
  {
    emailKey: "email_subscription_receipt",
    pushKey: "push_subscription_receipt",
    label: "결제·구독 영수증",
    description: "결제 완료 시 영수증 (전자상거래법 권장)",
  },
  {
    emailKey: "email_new_video_from_followed",
    pushKey: "push_new_video_from_followed",
    label: "팔로우한 크리에이터의 새 영상",
    description: "팔로우 중인 크리에이터가 새 영상을 올렸을 때",
  },
  {
    emailKey: "email_comment_reply",
    pushKey: "push_comment_reply",
    label: "댓글 답글",
    description: "내 댓글에 답글이 달렸을 때",
  },
  {
    emailKey: "email_new_follower",
    pushKey: "push_new_follower",
    label: "새 팔로워",
    description: "내 채널에 새 팔로워가 생겼을 때",
  },
  {
    emailKey: "email_revenue_settled",
    pushKey: "push_revenue_settled",
    label: "정산 완료 (크리에이터)",
    description: "수익 정산이 완료되었을 때",
  },
  {
    emailKey: "email_report_result",
    pushKey: "push_report_result",
    label: "신고 처리 결과",
    description: "내가 신고한 콘텐츠 처리 결과 안내",
  },
  {
    emailKey: "email_ad_budget_low",
    pushKey: "push_ad_budget_low",
    label: "광고 예산 소진 임박",
    description: "내 광고 예산이 거의 떨어졌을 때",
  },
];

export function NotificationSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_my_notification_preferences");
      if (cancelled) return;
      if (error) {
        console.error("[NotificationSettings] 설정 조회 실패:", error);
        toast.error("알림 설정을 불러오지 못했습니다.");
      } else if (data) {
        setPrefs(data as NotificationPreferences);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!prefs) return;

    // 낙관적 업데이트
    const prevValue = prefs[key];
    setPrefs({ ...prefs, [key]: value });
    setSaving((prev) => new Set(prev).add(key));

    const { data, error } = await supabase.rpc("update_my_notification_preferences", {
      p_settings: { [key]: value },
    });

    setSaving((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (error) {
      console.error("[NotificationSettings] 저장 실패:", error);
      // 롤백
      setPrefs((p) => (p ? { ...p, [key]: prevValue } : p));
      toast.error("저장 실패. 다시 시도해주세요.");
    } else if (data) {
      setPrefs(data as NotificationPreferences);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
        <h3 className="font-bold text-white mb-5 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          알림 설정
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  if (!prefs) {
    return null;
  }

  return (
    <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
      <h3 className="font-bold text-white mb-2 flex items-center gap-2">
        <Bell className="w-4 h-4" />
        알림 설정
      </h3>
      <p className="text-sm text-gray-500 mb-5">알림을 어떤 방식으로 받을지 선택하세요.</p>

      {/* 이메일 알림 그룹 */}
      <div className="mb-7">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">이메일 알림</h4>
        <div className="space-y-1">
          {ITEMS.map((item) => (
            <div
              key={item.emailKey}
              className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
              </div>
              <Switch
                checked={prefs[item.emailKey]}
                onCheckedChange={(v) => handleToggle(item.emailKey, v)}
                disabled={saving.has(item.emailKey)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 푸시 알림 그룹 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">푸시 알림</h4>
          <span className="text-[10px] font-bold text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-full">
            준비 중
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          푸시 알림은 향후 브라우저/모바일 권한 설정 후 활성화됩니다. 미리 설정해두실 수 있습니다.
        </p>
        <div className="space-y-1 opacity-60">
          {ITEMS.map((item) => (
            <div
              key={item.pushKey}
              className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{item.label}</p>
              </div>
              <Switch
                checked={prefs[item.pushKey]}
                onCheckedChange={(v) => handleToggle(item.pushKey, v)}
                disabled={saving.has(item.pushKey)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
