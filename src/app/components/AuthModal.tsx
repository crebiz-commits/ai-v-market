import { useState } from "react";
import { X, User as UserIcon, Loader2, ChevronLeft, MailCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

interface AuthModalProps {
  onClose: () => void;
  initialMode?: "signin" | "signup";
}

export function AuthModal({ onClose, initialMode = "signin" }: AuthModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  // R2(2026-06-11): 이메일 인증 필수 — 가입 후 확인 메일 발송 안내 화면
  const [verifySentTo, setVerifySentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { signIn, signUp, resendConfirmEmail, signInWithGoogle, signInWithKakao, requestPasswordReset } = useAuth();

  // R2: 인증 메일 재발송
  const handleResendConfirm = async () => {
    if (!verifySentTo) return;
    setResending(true);
    try {
      await resendConfirmEmail(verifySentTo);
      toast.success(t("auth.resendConfirmSuccess"));
    } catch (err: any) {
      toast.error(err?.message || t("auth.resendConfirmFailed"));
    } finally {
      setResending(false);
    }
  };

  // H8: 비밀번호 재설정 메일 발송
  const handleForgotPassword = async () => {
    if (!email.trim()) { toast.error(t("auth.enterEmailFirst", "이메일을 먼저 입력해주세요.")); return; }
    try {
      await requestPasswordReset(email.trim());
      toast.success(t("auth.resetEmailSent", "비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해주세요."));
    } catch (err: any) {
      toast.error(err?.message || t("auth.resetEmailFailed", "재설정 메일 발송에 실패했습니다."));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signin") {
        await signIn(email, password);
        toast.success(t("auth.loginSuccess"));
        onClose();
      } else {
        const result = await signUp(email, password, name);
        if (result?.needsEmailConfirm) {
          // R2: 확인 메일 발송됨 — 인증 안내 화면으로 전환 (로그인은 인증 후 가능)
          setVerifySentTo(email);
        } else {
          // 대시보드에서 이메일 인증이 꺼져 있는 환경 — 즉시 로그인됨
          toast.success(t("auth.loginSuccess"));
          onClose();
        }
      }
    } catch (error: any) {
      toast.error(error.message || t("auth.loginFail"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
    } catch (err: any) {
      const msg: string = err.message || t("auth.googleSignInFailed");
      const isWebViewError = msg.includes("in-app");
      toast.error(msg, { duration: isWebViewError ? 8000 : 4000 });
      setLoading(false);
    }
  };

  const handleKakaoSignIn = async () => {
    try {
      setLoading(true);
      await signInWithKakao();
    } catch (err: any) {
      toast.error(err.message || t("auth.kakaoSignInFailed"));
      setLoading(false);
    }
  };

  // Facebook·Apple·Twitter·LINE: Supabase provider 미설정 — 연결 전까지 '준비 중' 안내.
  //   활성화 시엔 signInWithOAuth({ provider }) 배선으로 교체(AuthContext.signInWithFacebook 준비돼 있음).
  const handleComingSoon = (provider: string) => {
    toast.info(t("auth.providerComingSoon", { provider, defaultValue: "{{provider}} 로그인은 곧 지원될 예정입니다." }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="bg-white w-full max-w-[420px] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl flex flex-col min-h-[500px] md:min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 flex items-center justify-between border-b border-gray-100">
          {showEmailForm && (
            <button
              onClick={() => setShowEmailForm(false)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {!showEmailForm && <div className="w-10 h-10" />}
          
          <h2 className="text-[19px] font-bold text-black text-center absolute left-1/2 -translate-x-1/2">
            {mode === "signin" ? t("auth.modalSignInTitle") : t("auth.modalSignUpTitle")}
          </h2>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <AnimatePresence mode="wait">
            {verifySentTo ? (
              <motion.div
                key="verify-sent"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center py-6"
              >
                <div className="w-16 h-16 mx-auto rounded-full bg-[#fe2c55]/10 flex items-center justify-center mb-4">
                  <MailCheck className="w-8 h-8 text-[#fe2c55]" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {t("auth.verifySentTitle")}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  <Trans
                    i18nKey="auth.verifySentBody"
                    values={{ email: verifySentTo }}
                    components={{ mail: <span className="font-semibold text-gray-900 break-all" /> }}
                  />
                </p>
                <p className="text-xs text-gray-400 mt-3">
                  {t("auth.verifySpamHint")}
                </p>
                <div className="mt-6 space-y-2">
                  <Button
                    type="button"
                    onClick={handleResendConfirm}
                    disabled={resending}
                    variant="outline"
                    className="w-full h-11 border-gray-200 text-gray-700 font-bold rounded-sm"
                  >
                    {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("auth.resendEmail")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => { setVerifySentTo(null); setMode("signin"); setShowEmailForm(true); setPassword(""); }}
                    className="w-full h-11 bg-[#fe2c55] hover:bg-[#ef2950] text-white font-bold rounded-sm"
                  >
                    {t("auth.verifiedSignIn")}
                  </Button>
                </div>
              </motion.div>
            ) : !showEmailForm ? (
              <motion.div
                key="social-list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-3"
              >
                {/* Email Option */}
                <button
                  onClick={() => setShowEmailForm(true)}
                  className="w-full h-12 border border-gray-200 rounded-sm flex items-center px-4 hover:bg-gray-50 transition-colors group relative"
                >
                  <UserIcon className="w-5 h-5 text-gray-800" />
                  <span className="flex-1 text-[15px] font-semibold text-gray-700 text-center pr-5">{t("auth.useEmailOrId")}</span>
                </button>

                {/* Kakao */}
                <button
                  onClick={handleKakaoSignIn}
                  className="w-full h-12 border border-gray-200 rounded-sm flex items-center px-4 hover:bg-gray-50 transition-colors relative"
                >
                  <div className="w-5 h-5 bg-[#FEE500] rounded-full flex items-center justify-center overflow-hidden">
                    <svg className="w-3 h-3 text-black" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M12 3c-4.97 0-9 3.18-9 7.11 0 2.56 1.7 4.8 4.3 6.13-.17.65-.63 2.33-.72 2.64-.13.48.16.47.34.35.14-.1.2.14 2.85-1.93.5.07.9.11 1.23.11 4.97 0 9-3.18 9-7.11S16.97 3 12 3z"/>
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-semibold text-gray-700 text-center pr-5">{t("auth.continueWithKakao")}</span>
                </button>

                {/* Google */}
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full h-12 border border-gray-200 rounded-sm flex items-center px-4 hover:bg-gray-50 transition-colors relative"
                >
                  <div className="w-5 h-5">
                    <svg viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-semibold text-gray-700 text-center pr-5">{t("auth.continueWithGoogle")}</span>
                </button>

                {/* Facebook */}
                <button
                  onClick={() => handleComingSoon("Facebook")}
                  className="w-full h-12 border border-gray-200 rounded-sm flex items-center px-4 hover:bg-gray-50 transition-colors relative"
                >
                  <div className="w-5 h-5 bg-[#1877F2] rounded-full flex items-center justify-center overflow-hidden">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-semibold text-gray-700 text-center pr-5">{t("auth.continueWithFacebook")}</span>
                </button>

                {/* Apple */}
                <button
                  onClick={() => handleComingSoon("Apple")}
                  className="w-full h-12 border border-gray-200 rounded-sm flex items-center px-4 hover:bg-gray-50 transition-colors relative"
                >
                  <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.05 20.28c-.96.95-2.04 1.8-3.26 1.8-1.22 0-1.72-.82-3.15-.82-1.43 0-1.97.82-3.15.82-1.18 0-2.34-.95-3.31-1.8-2.61-2.52-3.92-6.42-3.92-9.61 0-3.19 1.31-7.09 3.92-9.61C5.19 1 6.36.05 7.53.05c1.18 0 1.72.82 3.15.82 1.43 0 1.97-.82 3.15-.82 1.18 0 2.34.95 3.31 1.8 2.61 2.52 1.31 7.09-1.31 9.61-2.62 2.52-1.3 7.09 1.31 9.61z"/>
                  </svg>
                  <span className="flex-1 text-[15px] font-semibold text-gray-700 text-center pr-5">{t("auth.continueWithApple")}</span>
                </button>

                {/* Twitter / X */}
                <button
                  onClick={() => handleComingSoon("Twitter")}
                  className="w-full h-12 border border-gray-200 rounded-sm flex items-center px-4 hover:bg-gray-50 transition-colors relative"
                >
                  <div className="w-5 h-5 flex items-center justify-center">
                    <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-semibold text-gray-700 text-center pr-5">{t("auth.continueWithX")}</span>
                </button>

                {/* LINE */}
                <button
                  onClick={() => handleComingSoon("LINE")}
                  className="w-full h-12 border border-gray-200 rounded-sm flex items-center px-4 hover:bg-gray-50 transition-colors relative"
                >
                  <div className="w-5 h-5 bg-[#00B900] rounded-sm flex items-center justify-center overflow-hidden">
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.058.59.121.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975 1.706-1.841 2.547-3.784 2.547-5.968z"/>
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-semibold text-gray-700 text-center pr-5">{t("auth.continueWithLine")}</span>
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="email-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-gray-700 font-bold">{t("auth.name")}</Label>
                      <Input
                        id="name"
                        type="text"
                        placeholder={t("auth.namePlaceholder")}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors text-gray-900 placeholder:text-gray-400"
                        required={mode === "signup"}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-700 font-bold">{t("auth.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("auth.emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors text-gray-900 placeholder:text-gray-400"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-700 font-bold">{t("auth.password")}</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder={t("auth.passwordPlaceholder")}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors text-gray-900 placeholder:text-gray-400"
                      required
                      minLength={6}
                    />
                  </div>

                  {mode === "signin" && (
                    <div className="text-right -mt-1">
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-[12.5px] text-gray-500 hover:text-[#fe2c55] hover:underline font-medium"
                      >
                        {t("auth.forgotPassword")}
                      </button>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-[#fe2c55] hover:bg-[#ef2950] text-white font-bold text-base mt-2 rounded-sm"
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 text-[12.5px] text-gray-500 leading-normal text-center">
            <Trans
              i18nKey="auth.agreementText"
              components={{
                terms: <a href="?info=terms" className="underline hover:text-gray-700" />,
                privacy: <a href="?info=privacy" className="underline hover:text-gray-700" />,
              }}
            />
          </div>
        </div>

        {!verifySentTo && (
        <div className="p-6 bg-gray-50 border-t border-gray-100 text-center text-sm">
          {mode === "signin" ? (
            <div className="text-gray-900">
              {t("auth.noAccount")}{" "}
              <button
                onClick={() => { setMode("signup"); setShowEmailForm(false); }}
                className="text-[#fe2c55] hover:underline font-bold ml-1"
              >
                {t("auth.signUp")}
              </button>
            </div>
          ) : (
            <div className="text-gray-900">
              {t("auth.haveAccount")}{" "}
              <button
                onClick={() => { setMode("signin"); setShowEmailForm(false); }}
                className="text-[#fe2c55] hover:underline font-bold ml-1"
              >
                {t("auth.signIn")}
              </button>
            </div>
          )}
        </div>
        )}
      </motion.div>
    </motion.div>
  );
}
