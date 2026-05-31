// ════════════════════════════════════════════════════════════════════════════
// 비밀번호 재설정 화면 (H8, 2026-05-31)
//
// 재설정 메일 링크로 진입(onAuthStateChange PASSWORD_RECOVERY)하면 App 이 이 화면을
// 전체화면으로 띄움. 새 비밀번호 입력 → updateUser({password}) → 완료.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";
import { Lock, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

export function PasswordResetScreen() {
  const { t } = useTranslation();
  const { updatePassword, clearPasswordRecovery } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = pw.length >= 6 && pw === pw2;

  const handleSubmit = async () => {
    if (pw.length < 6) { toast.error(t("passwordReset.tooShort", "비밀번호는 6자 이상이어야 합니다.")); return; }
    if (pw !== pw2) { toast.error(t("passwordReset.mismatch", "비밀번호가 일치하지 않습니다.")); return; }
    setSaving(true);
    try {
      await updatePassword(pw);
      setDone(true);
      toast.success(t("passwordReset.success", "비밀번호가 변경되었습니다."));
    } catch (err: any) {
      toast.error(t("passwordReset.failed", "변경 실패: ") + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0a0a0a] p-4">
      <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center mb-3">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">{t("passwordReset.title", "새 비밀번호 설정")}</h2>
          <p className="text-xs text-gray-500 mt-1">{t("passwordReset.subtitle", "새로 사용할 비밀번호를 입력해주세요.")}</p>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-green-400" />
            </div>
            <p className="text-sm text-gray-300 mb-5">{t("passwordReset.successDesc", "비밀번호가 변경되었습니다. 이제 새 비밀번호로 이용하실 수 있습니다.")}</p>
            <Button onClick={clearPasswordRecovery} className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
              {t("passwordReset.goHome", "시작하기")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t("passwordReset.newPassword", "새 비밀번호 (6자 이상)")}
              className="w-full px-3 py-2.5 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none"
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder={t("passwordReset.confirmPassword", "비밀번호 확인")}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) handleSubmit(); }}
              className="w-full px-3 py-2.5 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none"
            />
            <Button onClick={handleSubmit} disabled={saving || !canSubmit} className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("passwordReset.submit", "비밀번호 변경")}
            </Button>
            <button onClick={clearPasswordRecovery} className="w-full text-xs text-gray-500 hover:text-gray-300 py-1">
              {t("common.cancel", "취소")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
