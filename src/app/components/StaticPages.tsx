import { ArrowLeft, Sparkles, Film, Crown, Users, Zap } from "lucide-react";
import { motion } from "motion/react";

interface StaticPageProps {
  onBack: () => void;
}

function PageShell({ title, subtitle, onBack, children }: { title: string; subtitle?: string; onBack: () => void; children: React.ReactNode }) {
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
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{title}</h1>
          {subtitle && <p className="text-gray-400 text-sm md:text-base">{subtitle}</p>}
        </motion.div>
        {children}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 회사 소개
// ──────────────────────────────────────────────────────────────────────
export function AboutPage({ onBack }: StaticPageProps) {
  return (
    <PageShell title="CREAITE" subtitle="세계 최초 AI 시네마 OTT" onBack={onBack}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-[#6366f1]/10 to-[#8b5cf6]/10 border border-[#6366f1]/20 rounded-2xl p-6 md:p-8 mb-6"
      >
        <h2 className="text-xl md:text-2xl font-black text-white mb-3">AI 영상의 새로운 시장을 만듭니다</h2>
        <p className="text-sm md:text-base text-gray-300 leading-relaxed">
          CREAITE는 AI가 만든 시네마틱 영상을 위한 첫 전문 OTT 플랫폼입니다.
          누구나 상상하는 영화를 만들 수 있는 시대, 그 작품들이 시청되고
          평가받고 거래되는 공간이 되겠습니다.
        </p>
      </motion.div>

      <h3 className="text-lg font-bold text-white mb-3">🎯 우리의 비전</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        <Card icon={Sparkles} title="AI 시네마 전문" desc="3분~30분 시네마틱 작품 중심" />
        <Card icon={Film} title="크리에이터 우선" desc="구독료·광고·판매 수익 공정 분배" />
        <Card icon={Crown} title="프리미엄 콘텐츠" desc="10분+ OTT, 영화 같은 시청 경험" />
        <Card icon={Users} title="글로벌 커뮤니티" desc="AI 크리에이터들의 거점" />
      </div>

      <h3 className="text-lg font-bold text-white mb-3">📊 서비스 구성</h3>
      <ul className="space-y-2 text-sm text-gray-300 mb-8 bg-[#121212] p-5 rounded-2xl border border-white/5">
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span><b className="text-white">홈 (Discovery)</b> — 0~3분 숏폼 피드, 광고 수익 분배</span></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span><b className="text-white">시네마</b> — 3분+ 영상, 라이선스 판매 + 광고 수익</span></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span><b className="text-white">프리미엄 OTT</b> — 10분+ 시네마틱 작품 (구독 전용)</span></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span><b className="text-white">채널</b> — 크리에이터 구독·발견</span></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span><b className="text-white">커뮤니티</b> — AI 제작 노하우 공유</span></li>
      </ul>

      <h3 className="text-lg font-bold text-white mb-3">📞 연락처</h3>
      <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 text-sm space-y-1.5">
        <p className="text-gray-400">서비스 문의: <a href="mailto:support@creaite.net" className="text-[#8b5cf6] hover:underline">support@creaite.net</a></p>
        <p className="text-gray-400">비즈니스 문의: <a href="mailto:business@creaite.net" className="text-[#8b5cf6] hover:underline">business@creaite.net</a></p>
        <p className="text-gray-500 text-xs mt-3">© {new Date().getFullYear()} CREAITE. All rights reserved.</p>
      </div>
    </PageShell>
  );
}

function Card({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="bg-[#121212] p-4 rounded-xl border border-white/5">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center mb-2">
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-sm font-black text-white mb-0.5">{title}</p>
      <p className="text-xs text-gray-400 leading-snug">{desc}</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 이용약관 (placeholder — 법무 검토 필요)
// ──────────────────────────────────────────────────────────────────────
export function TermsPage({ onBack }: StaticPageProps) {
  return (
    <PageShell title="이용약관" subtitle={`최종 개정일: ${new Date().toISOString().slice(0, 10)} (초안)`} onBack={onBack}>
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 mb-6">
        <p className="text-xs text-amber-300">
          ⚠️ 본 문서는 초안입니다. 정식 서비스 출시 전 법무 검토를 거쳐 최종본으로 대체됩니다.
        </p>
      </div>

      <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 text-sm text-gray-300 leading-relaxed space-y-5">
        <Section title="제1조 (목적)">
          본 약관은 CREAITE(이하 "회사")가 제공하는 AI 시네마 OTT 서비스(이하 "서비스") 이용에 관한 회사와 이용자의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
        </Section>
        <Section title="제2조 (이용 자격)">
          만 14세 이상의 사용자는 누구나 회원으로 가입할 수 있습니다. 미성년자는 보호자의 동의를 받아야 합니다.
        </Section>
        <Section title="제3조 (서비스 내용)">
          회사는 AI로 제작된 영상의 시청·업로드·판매·구독 서비스를 제공합니다. 구체적 서비스는 회사의 정책에 따라 변경될 수 있으며 사전 공지합니다.
        </Section>
        <Section title="제4조 (콘텐츠 저작권)">
          이용자가 업로드한 콘텐츠의 저작권은 이용자에게 귀속됩니다. 단, 이용자는 회사가 서비스 제공을 위해 해당 콘텐츠를 복제·전송·전시할 수 있는 비독점적 라이선스를 회사에 부여합니다.
        </Section>
        <Section title="제5조 (금지 행위)">
          타인의 저작권을 침해하는 콘텐츠, 음란·폭력·차별 콘텐츠, 미성년자에게 유해한 콘텐츠 업로드는 금지되며 위반 시 영상 삭제·계정 정지·법적 책임이 따를 수 있습니다.
        </Section>
        <Section title="제6조 (수익 분배)">
          크리에이터에게는 구독료·광고 수익·판매 수익이 정책에 따라 분배됩니다. 정확한 분배 비율은 서비스 내 별도 안내됩니다.
        </Section>
        <Section title="제7조 (서비스 변경·중단)">
          회사는 운영·기술상의 필요에 따라 서비스 내용을 변경하거나 중단할 수 있으며, 중대한 변경 시 사전 공지합니다.
        </Section>
        <Section title="제8조 (회원 탈퇴 · 계정 삭제)">
          이용자는 언제든지 마이페이지 → 설정 → 위험 영역에서 계정 삭제를 요청할 수 있습니다.
          삭제 요청 후 <span className="font-bold text-white">30일의 유예 기간</span>이 부여되며, 이 기간 동안은 언제든 취소할 수 있습니다.
          30일 경과 시 계정 및 모든 개인 데이터(영상·댓글·좋아요·시청 기록·플레이리스트 등)가 영구 삭제됩니다.
          단, 전자상거래법 등 관계 법령에 따라 보존이 필요한 결제 기록은 해당 법령에서 정한 기간 동안 보관됩니다.
        </Section>
        <Section title="제9조 (이용자 데이터 권리)">
          이용자는 마이페이지 → 설정 → "내 데이터 다운로드"에서 자신의 모든 데이터를 JSON 형식으로 언제든 다운로드할 수 있습니다 (개인정보보호법상 데이터 이동권).
        </Section>
        <Section title="제10조 (분쟁 해결)">
          본 약관과 관련된 분쟁은 대한민국 법률을 적용하며, 서울중앙지방법원을 1심 관할 법원으로 합니다.
        </Section>
      </div>
    </PageShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 개인정보처리방침 (placeholder)
// ──────────────────────────────────────────────────────────────────────
export function PrivacyPage({ onBack }: StaticPageProps) {
  return (
    <PageShell title="개인정보처리방침" subtitle={`최종 개정일: ${new Date().toISOString().slice(0, 10)} (초안)`} onBack={onBack}>
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 mb-6">
        <p className="text-xs text-amber-300">
          ⚠️ 본 문서는 초안입니다. 정식 서비스 출시 전 법무 검토를 거쳐 최종본으로 대체됩니다.
        </p>
      </div>

      <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 text-sm text-gray-300 leading-relaxed space-y-5">
        <Section title="1. 수집하는 개인정보 항목">
          회원가입 시: 이메일, 이름, OAuth 프로필 이미지 (구글/카카오 로그인 시).<br />
          서비스 이용 중: IP 주소, 기기 정보, 시청 이력, 결제 정보(PG사 위탁).
        </Section>
        <Section title="2. 수집·이용 목적">
          서비스 제공, 본인 확인, 결제·정산, 부정 이용 방지, 통계 분석, 마케팅(별도 동의 시).
        </Section>
        <Section title="3. 보유·이용 기간">
          회원 탈퇴 시 즉시 파기. 단, 관계 법령에 따라 보존이 필요한 경우 해당 법령에 따른 기간 동안 보관 (예: 전자상거래법 결제 기록 5년).
        </Section>
        <Section title="4. 제3자 제공">
          이용자의 동의 없이 제3자에게 제공하지 않습니다. 단, 법령에 따른 요청이 있는 경우 예외.
        </Section>
        <Section title="5. 위탁 업체">
          Supabase Inc. (DB·인증·스토리지), Bunny.net (영상 CDN), Vercel Inc. (호스팅), 토스페이먼츠 또는 카카오페이 (결제) 등.
        </Section>
        <Section title="6. 이용자 권리 (열람·수정·삭제·다운로드)">
          이용자는 개인정보보호법에 따라 다음 권리를 행사할 수 있습니다:<br />
          <strong className="text-white">· 열람·수정:</strong> 마이페이지 → 프로필 편집에서 직접 수정<br />
          <strong className="text-white">· 데이터 다운로드:</strong> 마이페이지 → 설정 → "내 데이터 다운로드"에서 본인 데이터 전체 JSON 다운로드<br />
          <strong className="text-white">· 계정 삭제:</strong> 마이페이지 → 설정 → 위험 영역에서 요청. 30일 유예 후 영구 삭제. 그 전까지 언제든 취소 가능<br />
          기타 문의는 <a href="mailto:privacy@creaite.net" className="text-[#8b5cf6] hover:underline">privacy@creaite.net</a>으로 연락주세요.
        </Section>
        <Section title="7. 쿠키 사용">
          서비스는 로그인 유지 및 사용성 개선을 위해 쿠키를 사용합니다. 브라우저 설정에서 거부할 수 있으나 일부 기능이 제한될 수 있습니다.
        </Section>
        <Section title="8. 개인정보 보호 책임자">
          이메일: <a href="mailto:privacy@creaite.net" className="text-[#8b5cf6] hover:underline">privacy@creaite.net</a>
        </Section>
      </div>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-white font-bold mb-2">{title}</h3>
      <div className="text-gray-400 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
