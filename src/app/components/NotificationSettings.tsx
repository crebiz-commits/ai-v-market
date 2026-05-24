// ════════════════════════════════════════════════════════════════════════════
// Phase 34 — 알림 설정 (MyPage 설정 탭)
//
// 동작:
//   - 진입 시: get_my_notification_preferences RPC로 현재 설정 로드
//   - 토글 변경 시: update_my_notification_preferences RPC로 즉시 저장
//   - 낙관적 업데이트 + 실패 시 롤백
//   - 푸시는 컬럼만 있고 FCM 미연동 → "준비 중" 표시 + 토글은 가능
//   - 일부 이메일 항목(new_video_from_followed, ad_budget_low)은 트리거 미구현 → "준비 중" 표시 + 비활성화
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  labelKey: string;
  descKey: string;
  /** 트리거 미구현 — UI에 "준비 중" 표시 + 토글 비활성화 (메모리: phase34_*_pending) */
  comingSoon?: boolean;
}

const ITEMS: NotificationItem[] = [
  {
    emailKey: "email_welcome",
    pushKey: "push_welcome",
    labelKey: "notificationSettings.items.welcomeLabel",
    descKey: "notificationSettings.items.welcomeDesc",
  },
  {
    emailKey: "email_subscription_receipt",
    pushKey: "push_subscription_receipt",
    labelKey: "notificationSettings.items.subscriptionReceiptLabel",
    descKey: "notificationSettings.items.subscriptionReceiptDesc",
  },
  {
    emailKey: "email_new_video_from_followed",
    pushKey: "push_new_video_from_followed",
    labelKey: "notificationSettings.items.newVideoFromFollowedLabel",
    descKey: "notificationSettings.items.newVideoFromFollowedDesc",
    comingSoon: true,
  },
  {
    emailKey: "email_comment_reply",
    pushKey: "push_comment_reply",
    labelKey: "notificationSettings.items.commentReplyLabel",
    descKey: "notificationSettings.items.commentReplyDesc",
  },
  {
    emailKey: "email_new_follower",
    pushKey: "push_new_follower",
    labelKey: "notificationSettings.items.newFollowerLabel",
    descKey: "notificationSettings.items.newFollowerDesc",
  },
  {
    emailKey: "email_revenue_settled",
    pushKey: "push_revenue_settled",
    labelKey: "notificationSettings.items.revenueSettledLabel",
    descKey: "notificationSettings.items.revenueSettledDesc",
  },
  {
    emailKey: "email_report_result",
    pushKey: "push_report_result",
    labelKey: "notificationSettings.items.reportResultLabel",
    descKey: "notificationSettings.items.reportResultDesc",
  },
  // 광고 예산 소진 임박(email_ad_budget_low) — 광고주 셀프 서비스 도입 시 광고주에게만 노출
  // (메모리: project_advertiser_self_service_pending.md). DB 컬럼·i18n 키는 보존.
];

export function NotificationSettings() {
  const { t } = useTranslation();
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
        toast.error(t("notificationSettings.loadError"));
      } else if (data) {
        setPrefs(data as NotificationPreferences);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, t]);

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
      toast.error(t("notificationSettings.saveError"));
    } else if (data) {
      setPrefs(data as NotificationPreferences);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
        <h3 className="font-bold text-white mb-5 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          {t("notificationSettings.title")}
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
        {t("notificationSettings.title")}
      </h3>
      <p className="text-sm text-gray-500 mb-5">{t("notificationSettings.subtitle")}</p>

      {/* 이메일 알림 그룹 */}
      <div className="mb-7">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
          {t("notificationSettings.emailSection")}
        </h4>
        <div className="space-y-1">
          {ITEMS.map((item) => {
            const isComingSoon = !!item.comingSoon;
            return (
              <div
                key={item.emailKey}
                className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">{t(item.labelKey)}</p>
                    {isComingSoon && (
                      <span className="text-[9px] font-bold text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                        {t("notificationSettings.comingSoonBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{t(item.descKey)}</p>
                </div>
                <Switch
                  checked={isComingSoon ? false : prefs[item.emailKey]}
                  onCheckedChange={isComingSoon ? undefined : (v) => handleToggle(item.emailKey, v)}
                  disabled={isComingSoon || saving.has(item.emailKey)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 푸시 알림 그룹 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
            {t("notificationSettings.pushSection")}
          </h4>
          <span className="text-[10px] font-bold text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-full">
            {t("notificationSettings.pushBadge")}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t("notificationSettings.pushDescription")}</p>
        <div className="space-y-1 opacity-60">
          {ITEMS.map((item) => (
            <div
              key={item.pushKey}
              className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{t(item.labelKey)}</p>
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
