import { useState } from "react";
import { X, Mail, Lock, User as UserIcon, Loader2, ChevronLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { signIn, signUp, signInWithGoogle, signInWithKakao } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signin") {
        await signIn(email, password);
        toast.success("로그인 성공!");
        onClose();
      } else {
        await signUp(email, password, name);
        toast.success("회원가입 완료! 자동으로 로그인되었습니다.");
        onClose();
      }
    } catch (error: any) {
      toast.error(error.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Google 로그인 실패:", err);
      setError(err.message || "Google 로그인에 실패했습니다.");
      setLoading(false);
    }
  };

  const handleKakaoSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      await signInWithKakao();
    } catch (err: any) {
      console.error("Kakao 로그인 실패:", err);
      setError(err.message || "Kakao 로그인에 실패했습니다.");
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: "100%", opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="bg-[#121212] w-full max-w-[420px] rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl flex flex-col min-h-[500px] md:min-h-0 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colorful Gradient Header */}
        <div className="relative p-6 bg-gradient-to-r from-[#6b52ff] to-[#9752ff] flex items-center">
          <img src="/logo.png" alt="AI-V-Market Logo" className="w-12 h-12 mr-3 drop-shadow-md object-contain" />
          <div className="flex flex-col">
            <h2 className="text-[22px] font-extrabold text-white leading-tight tracking-tight drop-shadow-sm">
              AI-V-Market
            </h2>
            <p className="text-[13px] text-white/90 mt-0.5 font-medium">로그인하여 시작하기</p>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors backdrop-blur-sm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          
          {/* Segmented Tabs for Signin / Signup */}
          {!showEmailForm && (
            <div className="flex bg-[#222] p-1.5 rounded-xl mb-8 border border-white/5">
              <button
                onClick={() => setMode("signin")}
                className={`flex-1 py-2.5 text-[15px] font-bold rounded-lg transition-all duration-200 ${
                  mode === "signin"
                    ? "bg-black text-white shadow-md border border-white/10"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                로그인
              </button>
              <button
                onClick={() => setMode("signup")}
                className={`flex-1 py-2.5 text-[15px] font-bold rounded-lg transition-all duration-200 ${
                  mode === "signup"
                    ? "bg-black text-white shadow-md border border-white/10"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                회원가입
              </button>
            </div>
          )}

          {/* Back Button when in Email Form */}
          {showEmailForm && (
            <div className="mb-6 flex items-center">
              <button
                onClick={() => setShowEmailForm(false)}
                className="flex items-center text-gray-400 hover:text-white transition-colors text-sm font-bold"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                목록으로 돌아가기
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {!showEmailForm ? (
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
                  className="w-full h-12 border border-white/10 rounded-lg flex items-center px-4 hover:bg-white/5 transition-colors group relative bg-[#1c1c1c]"
                >
                  <UserIcon className="w-5 h-5 text-gray-300 group-hover:text-white transition-colors" />
                  <span className="flex-1 text-[15px] font-bold text-gray-200 text-center pr-5">전화 / 이메일 / 아이디 사용</span>
                </button>

                {/* Kakao */}
                <button
                  onClick={handleKakaoSignIn}
                  className="w-full h-12 border border-white/10 rounded-lg flex items-center px-4 hover:bg-white/5 transition-colors relative bg-[#1c1c1c]"
                >
                  <div className="w-5 h-5 bg-[#FEE500] rounded-full flex items-center justify-center overflow-hidden">
                    <svg className="w-3 h-3 text-black" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M12 3c-4.97 0-9 3.18-9 7.11 0 2.56 1.7 4.8 4.3 6.13-.17.65-.63 2.33-.72 2.64-.13.48.16.47.34.35.14-.1.2.14 2.85-1.93.5.07.9.11 1.23.11 4.97 0 9-3.18 9-7.11S16.97 3 12 3z" />
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-bold text-gray-200 text-center pr-5">카카오톡으로 계속 진행</span>
                </button>

                {/* Google */}
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full h-12 border border-white/10 rounded-lg flex items-center px-4 hover:bg-white/5 transition-colors relative bg-[#1c1c1c]"
                >
                  <div className="w-5 h-5">
                    <svg viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-bold text-gray-200 text-center pr-5">Google로 계속 진행</span>
                </button>

                {/* Facebook */}
                <button
                  className="w-full h-12 border border-white/10 rounded-lg flex items-center px-4 hover:bg-white/5 transition-colors relative bg-[#1c1c1c]"
                >
                  <div className="w-5 h-5 bg-[#1877F2] rounded-full flex items-center justify-center overflow-hidden">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-bold text-gray-200 text-center pr-5">Facebook으로 계속 진행</span>
                </button>

                {/* Apple */}
                <button
                  className="w-full h-12 border border-white/10 rounded-lg flex items-center px-4 hover:bg-white/5 transition-colors relative bg-[#1c1c1c]"
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.05 20.28c-.96.95-2.04 1.8-3.26 1.8-1.22 0-1.72-.82-3.15-.82-1.43 0-1.97.82-3.15.82-1.18 0-2.34-.95-3.31-1.8-2.61-2.52-3.92-6.42-3.92-9.61 0-3.19 1.31-7.09 3.92-9.61C5.19 1 6.36.05 7.53.05c1.18 0 1.72.82 3.15.82 1.43 0 1.97-.82 3.15-.82 1.18 0 2.34.95 3.31 1.8 2.61 2.52 1.31 7.09-1.31 9.61-2.62 2.52-1.3 7.09 1.31 9.61z" />
                  </svg>
                  <span className="flex-1 text-[15px] font-bold text-gray-200 text-center pr-5">Apple로 계속 진행</span>
                </button>

                {/* Twitter / X */}
                <button
                  className="w-full h-12 border border-white/10 rounded-lg flex items-center px-4 hover:bg-white/5 transition-colors relative bg-[#1c1c1c]"
                >
                  <div className="w-5 h-5 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-bold text-gray-200 text-center pr-5">Twitter로 계속 진행</span>
                </button>

                {/* LINE */}
                <button
                  className="w-full h-12 border border-white/10 rounded-lg flex items-center px-4 hover:bg-white/5 transition-colors relative bg-[#1c1c1c]"
                >
                  <div className="w-5 h-5 bg-[#00B900] rounded-sm flex items-center justify-center overflow-hidden">
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.058.59.121.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975 1.706-1.841 2.547-3.784 2.547-5.968z" />
                    </svg>
                  </div>
                  <span className="flex-1 text-[15px] font-bold text-gray-200 text-center pr-5">LINE으로 계속 진행</span>
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
                      <Label htmlFor="name" className="text-gray-300 font-bold">이름</Label>
                      <Input
                        id="name"
                        type="text"
                        placeholder="이름 입력"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11 bg-white/5 border-white/10 focus:bg-white/10 focus:border-purple-500 text-white placeholder-gray-500 transition-colors"
                        required={mode === "signup"}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-300 font-bold">이메일</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="이메일 입력"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 bg-white/5 border-white/10 focus:bg-white/10 focus:border-purple-500 text-white placeholder-gray-500 transition-colors"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" title="로그인 후 이메일 찾기 또는 비밀번호 재설정" className="text-gray-300 font-bold">비밀번호</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="비밀번호 입력"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 bg-white/5 border-white/10 focus:bg-white/10 focus:border-purple-500 text-white placeholder-gray-500 transition-colors"
                      required
                      minLength={6}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white font-bold text-[15px] mt-4 rounded-lg shadow-lg"
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === "signin" ? "로그인" : "회원가입 완료"}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 text-[12.5px] text-gray-500 leading-relaxed text-center">
            {mode === "signin" ? "로그인" : "회원가입"}을 진행할 경우 당사의 <a href="#" className="font-bold text-gray-300 border-b border-gray-500 hover:text-white hover:border-white transition-colors">서비스 약관</a>에 동의하고 <a href="#" className="font-bold text-gray-300 border-b border-gray-500 hover:text-white hover:border-white transition-colors">개인정보 처리방침</a>을 읽었음을 인정하는 것입니다.
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
