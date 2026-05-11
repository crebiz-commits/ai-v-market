import { useState } from "react";
import { Briefcase, TrendingUp, Handshake, Layers, Send, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

type Category = "advertising" | "investment" | "partnership" | "b2b_license";

interface BusinessPageProps {
  onBack: () => void;
}

const CATEGORIES: Array<{
  id: Category;
  icon: any;
  title: string;
  desc: string;
  color: string;
}> = [
  {
    id: "advertising",
    icon: Briefcase,
    title: "광고 문의",
    desc: "브랜드 캠페인, 인비디오 광고, 스폰서십",
    color: "from-amber-500 to-orange-500",
  },
  {
    id: "investment",
    icon: TrendingUp,
    title: "투자 / IR",
    desc: "VC, 엔젤, 사모펀드 등 투자 제안",
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: "partnership",
    icon: Handshake,
    title: "사업 제휴",
    desc: "콘텐츠 파트너, 채널 협업, 공동 기획",
    color: "from-[#6366f1] to-[#8b5cf6]",
  },
  {
    id: "b2b_license",
    icon: Layers,
    title: "B2B 라이선스",
    desc: "기업 영상 라이선스, API, 화이트라벨",
    color: "from-rose-500 to-pink-500",
  },
];

export function BusinessPage({ onBack }: BusinessPageProps) {
  const { user } = useAuth();
  const [category, setCategory] = useState<Category>("advertising");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim() || !email.trim() || !message.trim()) {
      toast.error("필수 항목을 모두 입력해주세요.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("올바른 이메일 형식이 아닙니다.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("business_inquiries").insert({
        category,
        company_name: companyName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        message: message.trim(),
        source_url: window.location.href,
        user_agent: navigator.userAgent.substring(0, 200),
        submitted_by: user?.id || null,
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success("문의가 접수됐습니다. 영업일 기준 2~3일 내 답변드리겠습니다.");
    } catch (err: any) {
      toast.error(err?.message || "문의 전송에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-black text-white mb-3">문의가 접수됐습니다</h2>
          <p className="text-sm text-gray-400 leading-relaxed mb-8">
            영업일 기준 2~3일 내에 입력하신<br />
            <span className="text-white font-bold">{email}</span>로 답변드리겠습니다.
          </p>
          <Button
            onClick={onBack}
            variant="outline"
            className="bg-white/5 border-white/10 hover:bg-white/10 text-white font-medium"
          >
            메인으로 돌아가기
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] pb-20">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          돌아가기
        </button>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">비즈니스 문의</h1>
          <p className="text-gray-400 text-sm md:text-base leading-relaxed">
            광고·투자·제휴·B2B 등 비즈니스 문의를 받습니다. 영업일 기준 2~3일 내 답변드립니다.
          </p>
        </motion.div>

        {/* 카테고리 선택 */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`relative p-4 rounded-2xl border text-left transition-all ${
                  active
                    ? "bg-white/10 border-white/30 shadow-lg"
                    : "bg-[#121212] border-white/5 hover:border-white/15 hover:bg-white/[0.04]"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center mb-2 shadow-md`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-black text-white mb-0.5">{cat.title}</h3>
                <p className="text-[11px] text-gray-400 leading-snug">{cat.desc}</p>
              </button>
            );
          })}
        </div>

        {/* 문의 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4 bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5">
          <Field label="회사명" required>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={100}
              required
              placeholder="회사 또는 단체명"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="담당자" required>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={50}
                required
                placeholder="이름"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </Field>

            <Field label="연락처 (선택)">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                placeholder="010-0000-0000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
              />
            </Field>
          </div>

          <Field label="이메일" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="contact@company.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors"
            />
          </Field>

          <Field label="문의 내용" required>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={6}
              required
              placeholder="제안 또는 문의 내용을 자세히 적어주세요. (예산, 일정, 규모 등 구체적일수록 빠른 답변 가능)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#6366f1] transition-colors resize-none"
            />
            <p className="text-[11px] text-gray-500 text-right mt-1">{message.length}/2000</p>
          </Field>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white font-black text-base shadow-lg rounded-xl"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                전송 중...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                문의 전송
              </>
            )}
          </Button>

          <p className="text-[11px] text-gray-500 text-center leading-relaxed">
            제출 시 입력하신 정보는 문의 응대 목적으로만 사용되며,<br />
            업무 처리 완료 후 별도 보관 동의가 없으면 1년 내 파기됩니다.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1.5">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}
