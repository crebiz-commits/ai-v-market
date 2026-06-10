import { useState, useEffect } from "react";
import { ArrowLeft, Sparkles, Film, Crown, Users, Zap, ChevronDown, HelpCircle, Megaphone, Loader2, Bug, Coffee, Send, CheckCircle2, ImagePlus, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { Footer } from "./Footer";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

interface StaticPageProps {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}

function useIsKorean() {
  const { i18n } = useTranslation();
  return (i18n.language || "en").startsWith("ko");
}

function PageShell({ title, subtitle, onBack, onNavigate, children }: { title: string; subtitle?: string; onBack: () => void; onNavigate?: (tab: string) => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("creatorChannel.back")}
        </button>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{title}</h1>
          {subtitle && <p className="text-gray-400 text-sm md:text-base">{subtitle}</p>}
        </motion.div>
        {children}
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// About
// ──────────────────────────────────────────────────────────────────────
export function AboutPage({ onBack, onNavigate }: StaticPageProps) {
  const isKo = useIsKorean();
  const text = isKo ? ABOUT_KO : ABOUT_EN;
  return (
    <PageShell title="CREAITE" subtitle={text.subtitle} onBack={onBack} onNavigate={onNavigate}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-[#6366f1]/10 to-[#8b5cf6]/10 border border-[#6366f1]/20 rounded-2xl p-6 md:p-8 mb-6"
      >
        <h2 className="text-xl md:text-2xl font-black text-white mb-3">{text.headline}</h2>
        <p className="text-sm md:text-base text-gray-300 leading-relaxed">{text.headlineBody}</p>
      </motion.div>

      <h3 className="text-lg font-bold text-white mb-3">{text.visionTitle}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        <Card icon={Sparkles} title={text.visionAi} desc={text.visionAiDesc} />
        <Card icon={Film} title={text.visionCreator} desc={text.visionCreatorDesc} />
        <Card icon={Crown} title={text.visionPremium} desc={text.visionPremiumDesc} />
        <Card icon={Users} title={text.visionCommunity} desc={text.visionCommunityDesc} />
      </div>

      <h3 className="text-lg font-bold text-white mb-3">{text.servicesTitle}</h3>
      <ul className="space-y-2 text-sm text-gray-300 mb-8 bg-[#121212] p-5 rounded-2xl border border-white/5">
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: text.serviceHome }} /></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: text.serviceCinema }} /></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: text.serviceOtt }} /></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: text.serviceChannel }} /></li>
        <li className="flex items-start gap-2"><Zap className="w-4 h-4 text-[#8b5cf6] mt-0.5 shrink-0" /><span dangerouslySetInnerHTML={{ __html: text.serviceCommunity }} /></li>
      </ul>

      <h3 className="text-lg font-bold text-white mb-3">{text.contactTitle}</h3>
      <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 text-sm space-y-1.5">
        <p className="text-gray-400">{text.contactSupport}: <a href="mailto:support@creaite.net" className="text-[#8b5cf6] hover:underline">support@creaite.net</a></p>
        <p className="text-gray-400">{text.contactBusiness}: <a href="mailto:business@creaite.net" className="text-[#8b5cf6] hover:underline">business@creaite.net</a></p>
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
      <h4 className="font-bold text-white mb-1 text-sm">{title}</h4>
      <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Terms of Service
// ──────────────────────────────────────────────────────────────────────
export function TermsPage({ onBack, onNavigate }: StaticPageProps) {
  const isKo = useIsKorean();
  const text = isKo ? TERMS_KO : TERMS_EN;
  return (
    <PageShell title={text.title} subtitle={`${text.lastModifiedLabel}: ${new Date().toISOString().slice(0, 10)} (${text.draftLabel})`} onBack={onBack} onNavigate={onNavigate}>
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 mb-6">
        <p className="text-xs text-amber-300">⚠️ {text.draftNotice}</p>
      </div>

      <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 text-sm text-gray-300 leading-relaxed space-y-5">
        {text.sections.map((s, i) => (
          <Section key={i} title={s.title}>
            <span dangerouslySetInnerHTML={{ __html: s.body }} />
          </Section>
        ))}
      </div>
    </PageShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Privacy Policy
// ──────────────────────────────────────────────────────────────────────
export function PrivacyPage({ onBack, onNavigate }: StaticPageProps) {
  const isKo = useIsKorean();
  const text = isKo ? PRIVACY_KO : PRIVACY_EN;
  return (
    <PageShell title={text.title} subtitle={`${text.lastModifiedLabel}: ${new Date().toISOString().slice(0, 10)} (${text.draftLabel})`} onBack={onBack} onNavigate={onNavigate}>
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 mb-6">
        <p className="text-xs text-amber-300">⚠️ {text.draftNotice}</p>
      </div>

      <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 text-sm text-gray-300 leading-relaxed space-y-5">
        {text.sections.map((s, i) => (
          <Section key={i} title={s.title}>
            <span dangerouslySetInnerHTML={{ __html: s.body }} />
          </Section>
        ))}
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

// ────────────────────────────────────────────────────────────────────────
// Korean content
// ────────────────────────────────────────────────────────────────────────
const ABOUT_KO = {
  subtitle: "세계 최초 AI 시네마 OTT",
  headline: "AI 영상의 새로운 시장을 만듭니다",
  headlineBody: 'CREAITE는 AI가 만든 시네마틱 영상을 위한 첫 전문 OTT 플랫폼입니다. 누구나 상상하는 영화를 만들 수 있는 시대, 그 작품들이 시청되고 평가받고 거래되는 공간이 되겠습니다.',
  visionTitle: "🎯 우리의 비전",
  visionAi: "AI 시네마 전문",
  visionAiDesc: "3분~30분 시네마틱 작품 중심",
  visionCreator: "크리에이터 우선",
  visionCreatorDesc: "구독료·광고·판매 수익 공정 분배",
  visionPremium: "프리미엄 콘텐츠",
  visionPremiumDesc: "10분+ OTT, 영화 같은 시청 경험",
  visionCommunity: "글로벌 커뮤니티",
  visionCommunityDesc: "AI 크리에이터들의 거점",
  servicesTitle: "📊 서비스 구성",
  serviceHome: '<b class="text-white">홈 (Discovery)</b> — 0~3분 숏폼 피드, 광고 수익 분배',
  serviceCinema: '<b class="text-white">시네마</b> — 3분+ 영상, 라이선스 판매 + 광고 수익',
  serviceOtt: '<b class="text-white">프리미엄 OTT</b> — 10분+ 시네마틱 작품 (구독 전용)',
  serviceChannel: '<b class="text-white">채널</b> — 크리에이터 구독·발견',
  serviceCommunity: '<b class="text-white">커뮤니티</b> — AI 제작 노하우 공유',
  contactTitle: "📞 연락처",
  contactSupport: "서비스 문의",
  contactBusiness: "비즈니스 문의",
};

const TERMS_KO = {
  title: "이용약관",
  lastModifiedLabel: "최종 개정일",
  draftLabel: "초안",
  draftNotice: "본 문서는 초안입니다. 정식 서비스 출시 전 법무 검토를 거쳐 최종본으로 대체됩니다.",
  sections: [
    { title: "제1조 (목적)", body: '본 약관은 크레비즈(이하 "회사", 사업자등록번호 107-10-27099)가 운영하는 AI 시네마 OTT 서비스 "CREAITE"(이하 "서비스") 이용에 관한 회사와 이용자의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.' },
    { title: "제2조 (이용 자격)", body: "만 14세 이상의 사용자는 누구나 회원으로 가입할 수 있습니다. 미성년자는 보호자의 동의를 받아야 합니다." },
    { title: "제3조 (서비스 내용)", body: "회사는 AI로 제작된 영상의 시청·업로드·판매·구독 서비스를 제공합니다. 구체적 서비스는 회사의 정책에 따라 변경될 수 있으며 사전 공지합니다." },
    { title: "제4조 (콘텐츠 저작권)", body: "이용자가 업로드한 콘텐츠의 저작권은 이용자에게 귀속됩니다. 단, 이용자는 회사가 서비스 제공을 위해 해당 콘텐츠를 복제·전송·전시할 수 있는 비독점적 라이선스를 회사에 부여합니다." },
    { title: "제5조 (금지 행위)", body: "타인의 저작권을 침해하는 콘텐츠, 음란·폭력·차별 콘텐츠, 미성년자에게 유해한 콘텐츠 업로드는 금지되며 위반 시 영상 삭제·계정 정지·법적 책임이 따를 수 있습니다." },
    { title: "제6조 (수익 분배)", body: '크리에이터에게는 구독료·광고 수익·판매 수익이 정책에 따라 분배됩니다. 구체적인 분배 비율·영상 길이별 수익 영역·정산 정책 등 상세 안내는 <a href="?info=creator-revenue" class="text-[#8b5cf6] hover:underline">크리에이터 수익 정책</a> 페이지에서 확인하실 수 있습니다.' },
    { title: "제7조 (청약철회 및 환불)", body: '① <strong class="text-white">구독 결제</strong>: 이용자는 구독 결제일로부터 7일 이내, 그리고 결제 이후 유료 콘텐츠를 시청하지 않은 경우에 한하여 전액 청약철회를 요청할 수 있습니다.<br />② <strong class="text-white">라이선스 구매</strong>: 라이선스 영상을 시청하거나 다운로드하기 시작한 경우, 그 즉시 청약철회권이 소멸합니다 (「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호 — 디지털 콘텐츠 제공 개시).<br />③ <strong class="text-white">환불 절차</strong>: 청약철회 요청은 마이페이지 → 결제 내역 → 환불 요청, 또는 <a href="mailto:support@creaite.net" class="text-[#8b5cf6] hover:underline">support@creaite.net</a>으로 접수할 수 있습니다. 회사는 정당한 청약철회 요청을 받은 날로부터 영업일 3일 이내에 결제 수단별로 환불을 진행합니다.<br />④ <strong class="text-white">광고 예산 충전</strong>: 광고 예산 충전 후 광고 노출이 시작되지 않은 경우 충전일로부터 7일 이내 전액 환불이 가능합니다. 광고 노출이 시작된 경우 남은 잔액 한도 내에서 환불할 수 있습니다.<br />⑤ <strong class="text-white">청약철회 제한</strong>: 다음의 경우 청약철회가 제한됩니다.<br />· 이미 사용 또는 시청이 개시된 디지털 콘텐츠<br />· 청약철회 가능 기간(7일)을 초과한 경우<br />· 이용자의 책임 있는 사유로 콘텐츠가 멸실·훼손된 경우' },
    { title: "제8조 (서비스 변경·중단)", body: "회사는 운영·기술상의 필요에 따라 서비스 내용을 변경하거나 중단할 수 있으며, 중대한 변경 시 사전 공지합니다." },
    { title: "제9조 (회원 탈퇴 · 계정 삭제)", body: '이용자는 언제든지 마이페이지 → 설정 → 위험 영역에서 계정 삭제를 요청할 수 있습니다. 삭제 요청 후 <span class="font-bold text-white">30일의 유예 기간</span>이 부여되며, 이 기간 동안은 언제든 취소할 수 있습니다. 30일 경과 시 계정 및 모든 개인 데이터(영상·댓글·좋아요·시청 기록·플레이리스트 등)가 영구 삭제됩니다. 단, 전자상거래법 등 관계 법령에 따라 보존이 필요한 결제 기록은 해당 법령에서 정한 기간 동안 보관됩니다.' },
    { title: "제10조 (이용자 데이터 권리)", body: '이용자는 마이페이지 → 설정 → "내 데이터 다운로드"에서 자신의 모든 데이터를 JSON 형식으로 언제든 다운로드할 수 있습니다 (개인정보보호법상 데이터 이동권).' },
    { title: "제11조 (분쟁 해결)", body: "본 약관과 관련된 분쟁은 대한민국 법률을 적용하며, 서울중앙지방법원을 1심 관할 법원으로 합니다." },
  ],
};

const PRIVACY_KO = {
  title: "개인정보처리방침",
  lastModifiedLabel: "최종 개정일",
  draftLabel: "초안",
  draftNotice: "본 문서는 초안입니다. 정식 서비스 출시 전 법무 검토를 거쳐 최종본으로 대체됩니다.",
  sections: [
    { title: "1. 수집하는 개인정보 항목", body: "회원가입 시: 이메일, 이름, OAuth 프로필 이미지 (구글/카카오 로그인 시).<br />서비스 이용 중: IP 주소, 기기 정보, 시청 이력, 결제 정보(PG사 위탁)." },
    { title: "2. 수집·이용 목적", body: "서비스 제공, 본인 확인, 결제·정산, 부정 이용 방지, 통계 분석, 마케팅(별도 동의 시)." },
    { title: "3. 보유·이용 기간", body: "회원 탈퇴 시 즉시 파기. 단, 관계 법령에 따라 보존이 필요한 경우 해당 법령에 따른 기간 동안 보관 (예: 전자상거래법 결제 기록 5년)." },
    { title: "4. 제3자 제공", body: "이용자의 동의 없이 제3자에게 제공하지 않습니다. 단, 법령에 따른 요청이 있는 경우 예외." },
    { title: "5. 위탁 업체", body: "Supabase Inc. (DB·인증·스토리지), Bunny.net (영상 CDN), Vercel Inc. (호스팅), 토스페이먼츠 또는 카카오페이 (결제) 등." },
    { title: "6. 이용자 권리 (열람·수정·삭제·다운로드)", body: '이용자는 개인정보보호법에 따라 다음 권리를 행사할 수 있습니다:<br /><strong class="text-white">· 열람·수정:</strong> 마이페이지 → 프로필 편집에서 직접 수정<br /><strong class="text-white">· 데이터 다운로드:</strong> 마이페이지 → 설정 → "내 데이터 다운로드"에서 본인 데이터 전체 JSON 다운로드<br /><strong class="text-white">· 계정 삭제:</strong> 마이페이지 → 설정 → 위험 영역에서 요청. 30일 유예 후 영구 삭제. 그 전까지 언제든 취소 가능<br />기타 문의는 <a href="mailto:legal@creaite.net" class="text-[#8b5cf6] hover:underline">legal@creaite.net</a>으로 연락주세요.' },
    { title: "7. 쿠키 사용", body: "서비스는 로그인 유지 및 사용성 개선을 위해 쿠키를 사용합니다. 브라우저 설정에서 거부할 수 있으나 일부 기능이 제한될 수 있습니다." },
    { title: "8. 개인정보 보호 책임자", body: '성명: 이현우 (크레비즈 대표)<br />이메일: <a href="mailto:legal@creaite.net" class="text-[#8b5cf6] hover:underline">legal@creaite.net</a>' },
  ],
};

// ────────────────────────────────────────────────────────────────────────
// English content
// ────────────────────────────────────────────────────────────────────────
const ABOUT_EN = {
  subtitle: "World's first AI Cinema OTT",
  headline: "Creating a new market for AI-generated video",
  headlineBody: "CREAITE is the first OTT platform dedicated to AI-generated cinematic videos. We aim to be the home where anyone's imagined films are watched, reviewed, and traded.",
  visionTitle: "🎯 Our Vision",
  visionAi: "AI Cinema Focus",
  visionAiDesc: "3–30 minute cinematic works at the core",
  visionCreator: "Creator First",
  visionCreatorDesc: "Fair sharing of subscription, ad, and sales revenue",
  visionPremium: "Premium Content",
  visionPremiumDesc: "10-min+ OTT, a movie-like viewing experience",
  visionCommunity: "Global Community",
  visionCommunityDesc: "Hub for AI creators worldwide",
  servicesTitle: "📊 Service Structure",
  serviceHome: '<b class="text-white">Home (Discovery)</b> — 0–3 minute shorts feed, with ad revenue sharing',
  serviceCinema: '<b class="text-white">Cinema</b> — 3 minute+ videos, license sales + ad revenue',
  serviceOtt: '<b class="text-white">Premium OTT</b> — 10 minute+ cinematic works (subscribers only)',
  serviceChannel: '<b class="text-white">Channel</b> — Subscribe to and discover creators',
  serviceCommunity: '<b class="text-white">Community</b> — Share AI production know-how',
  contactTitle: "📞 Contact",
  contactSupport: "Service inquiries",
  contactBusiness: "Business inquiries",
};

const TERMS_EN = {
  title: "Terms of Service",
  lastModifiedLabel: "Last modified",
  draftLabel: "Draft",
  draftNotice: "This document is a draft. It will be replaced with a finalized version after legal review before the official service launch. The Korean version is the binding agreement until then.",
  sections: [
    { title: "Article 1 (Purpose)", body: 'These Terms set forth the rights, obligations, and responsibilities of Crebiz (크레비즈, hereinafter the "Company", Business Registration No. 107-10-27099) and users regarding the AI Cinema OTT service "CREAITE" (the "Service") operated by the Company, as well as other necessary matters.' },
    { title: "Article 2 (Eligibility)", body: "Anyone aged 14 or older may register for membership. Minors must obtain consent from their guardian." },
    { title: "Article 3 (Service Description)", body: "The Company provides viewing, upload, sale, and subscription services for AI-generated videos. Specific services may change according to the Company's policies, with prior notice given." },
    { title: "Article 4 (Content Copyright)", body: "Copyright of content uploaded by users belongs to the users. However, users grant the Company a non-exclusive license to reproduce, transmit, and display such content as necessary for service provision." },
    { title: "Article 5 (Prohibited Acts)", body: "Uploading content that infringes others' copyrights, obscene, violent, or discriminatory content, or content harmful to minors is prohibited. Violations may result in video removal, account suspension, and legal liability." },
    { title: "Article 6 (Revenue Sharing)", body: 'Creators receive distributions of subscription, ad, and sales revenue according to the Company\'s policies. Specific distribution ratios, video-length-based revenue areas, and settlement policies are available on the <a href="?info=creator-revenue" class="text-[#8b5cf6] hover:underline">Creator Revenue Policy</a> page.' },
    { title: "Article 7 (Right of Withdrawal and Refunds)", body: '① <strong class="text-white">Subscription payments</strong>: Users may request a full refund within 7 days of the subscription payment date, provided that no paid content has been viewed after payment.<br />② <strong class="text-white">License purchases</strong>: Once a license video has begun playback or has been downloaded, the right of withdrawal is immediately extinguished (Article 17(2)(5) of the Act on Consumer Protection in Electronic Commerce — commencement of digital content provision).<br />③ <strong class="text-white">Refund procedure</strong>: Withdrawal requests can be submitted via My Page → Payment History → Request Refund, or by emailing <a href="mailto:support@creaite.net" class="text-[#8b5cf6] hover:underline">support@creaite.net</a>. The Company will process refunds via the original payment method within 3 business days of receiving a valid request.<br />④ <strong class="text-white">Ad budget top-ups</strong>: Full refunds are available within 7 days of the top-up date provided that no ad impressions have been delivered. Once impressions begin, refunds are available within the remaining balance.<br />⑤ <strong class="text-white">Exclusions</strong>: The right of withdrawal does not apply in the following cases:<br />· Digital content for which use or viewing has already commenced<br />· Requests submitted after the 7-day withdrawal period<br />· Content that has been lost or damaged due to reasons attributable to the user' },
    { title: "Article 8 (Service Changes / Suspension)", body: "The Company may change or suspend service contents for operational or technical reasons. Significant changes will be announced in advance." },
    { title: "Article 9 (Membership Withdrawal · Account Deletion)", body: 'Users may request account deletion at any time via My Page → Settings → Danger Zone. After requesting deletion, a <span class="font-bold text-white">30-day grace period</span> is granted, during which users may cancel the request at any time. After 30 days, the account and all personal data (videos, comments, likes, watch history, playlists, etc.) are permanently deleted. However, payment records required for retention under applicable laws (e.g., e-commerce law) are retained for the period specified by such laws.' },
    { title: "Article 10 (User Data Rights)", body: 'Users may download all of their data in JSON format at any time via My Page → Settings → "Download my data" (right to data portability under personal information protection law).' },
    { title: "Article 11 (Dispute Resolution)", body: "Disputes related to these Terms shall be governed by the laws of the Republic of Korea, with the Seoul Central District Court as the court of first instance." },
  ],
};

const PRIVACY_EN = {
  title: "Privacy Policy",
  lastModifiedLabel: "Last modified",
  draftLabel: "Draft",
  draftNotice: "This document is a draft. It will be replaced with a finalized version after legal review before the official service launch. The Korean version is the binding policy until then.",
  sections: [
    { title: "1. Personal Information Collected", body: "At sign-up: email, name, OAuth profile image (when signing in with Google / Kakao).<br />During service use: IP address, device information, viewing history, payment information (entrusted to payment gateway)." },
    { title: "2. Purposes of Collection and Use", body: "Service provision, identity verification, payment / settlement, prevention of fraudulent use, statistical analysis, marketing (with separate consent)." },
    { title: "3. Retention and Use Period", body: "Personal data is destroyed immediately upon membership withdrawal. However, when retention is required by applicable laws, data is retained for the period specified by such laws (e.g., 5 years for payment records under e-commerce law)." },
    { title: "4. Disclosure to Third Parties", body: "We do not provide personal information to third parties without user consent, except when required by law." },
    { title: "5. Processors", body: "Supabase Inc. (database, authentication, storage), Bunny.net (video CDN), Vercel Inc. (hosting), Toss Payments or Kakao Pay (payment), etc." },
    { title: "6. User Rights (Access, Edit, Delete, Download)", body: 'Users may exercise the following rights under personal information protection law:<br /><strong class="text-white">· Access / Edit:</strong> Edit directly via My Page → Edit Profile<br /><strong class="text-white">· Download:</strong> Download all your data as JSON via My Page → Settings → "Download my data"<br /><strong class="text-white">· Account deletion:</strong> Request via My Page → Settings → Danger Zone. Permanent deletion after a 30-day grace period; cancelable at any time before<br />For other inquiries, please contact <a href="mailto:legal@creaite.net" class="text-[#8b5cf6] hover:underline">legal@creaite.net</a>.' },
    { title: "7. Cookies", body: "The Service uses cookies to maintain login sessions and improve usability. You may decline cookies in your browser settings, but some functions may be limited." },
    { title: "8. Personal Information Officer", body: 'Name: Lee Hyunwoo (이현우, CEO of Crebiz)<br />Email: <a href="mailto:legal@creaite.net" class="text-[#8b5cf6] hover:underline">legal@creaite.net</a>' },
  ],
};

// ──────────────────────────────────────────────────────────────────────
// FAQ (자주 묻는 질문) — 2026-06-11 신설
// ──────────────────────────────────────────────────────────────────────
const FAQ_KO: { q: string; a: string }[] = [
  { q: "크리에잇(CREAITE)은 어떤 서비스인가요?", a: "세계 최초 AI 시네마 OTT입니다. AI 크리에이터가 만든 영화·드라마·애니메이션을 감상하고, 창작자는 광고·판매·구독 수익을 얻습니다." },
  { q: "이용 요금은 얼마인가요?", a: "기본 감상은 무료입니다(광고 포함). 프리미엄 구독(월 ₩4,900)을 이용하면 모든 광고가 제거되고 장편 작품을 끝까지 감상할 수 있습니다." },
  { q: "구독은 자동으로 갱신되나요?", a: "아니요, 현재 구독은 30일 단위 1회 결제입니다. 자동 결제가 없으므로 만료 전에 마이페이지에서 직접 연장하시면 됩니다 (연장 시 남은 기간에 30일이 더해집니다)." },
  { q: "환불은 어떻게 받나요?", a: '결제 후 7일 이내에 마이페이지 → 설정 → 결제 내역에서 환불 요청을 하실 수 있습니다. 자세한 기준은 <a href="?info=terms" class="text-[#8b5cf6] hover:underline">이용약관 제7조</a>를 참고해 주세요.' },
  { q: "영상 업로드는 누구나 할 수 있나요?", a: "네, 회원이라면 누구나 업로드 탭에서 작품을 올릴 수 있습니다. 단, AI로 생성·제작한 본인 창작 영상만 가능하며 타인의 영상을 재업로드하면 즉시 제재됩니다." },
  { q: "크리에이터 수익은 어떻게 발생하나요?", a: '① 영상에 붙는 광고 수익(노출 기반) ② 영상 라이선스 판매 수익 ③ 구독료 분배(OTT 시청시간 비례), 세 가지입니다. 자세한 비율과 정책은 <a href="?info=creator-revenue" class="text-[#8b5cf6] hover:underline">크리에이터 수익 정책</a> 페이지에서 확인하세요.' },
  { q: "수익 정산은 언제 받나요?", a: "월 단위로 정산되며 최소 정산액은 ₩10,000입니다. 미달 금액은 사라지지 않고 다음 달로 이월되어 합산됩니다. 마이페이지에서 정산 계좌를 등록해 주세요." },
  { q: "영상 구매(라이선스)는 무엇인가요?", a: "마음에 드는 영상의 라이선스를 구매하면 원본을 다운로드해 약관 범위 내에서 활용할 수 있습니다 (비독점 라이선스)." },
  { q: "광고는 왜 나오나요?", a: "광고는 무료 감상을 지원하고 크리에이터에게 수익을 돌려주기 위한 것입니다. 프리미엄 구독 시 모든 광고가 제거됩니다." },
  { q: "비밀번호를 잊어버렸어요.", a: "로그인 화면에서 이메일 입력 후 '비밀번호를 잊으셨나요?'를 누르면 재설정 메일이 발송됩니다." },
  { q: "가입 인증 메일이 안 와요.", a: '스팸함을 먼저 확인해 주세요. 가입 안내 화면의 "인증 메일 재발송" 버튼으로 다시 받을 수 있습니다. 계속 안 오면 <a href="mailto:support@creaite.net" class="text-[#8b5cf6] hover:underline">support@creaite.net</a> 으로 문의해 주세요.' },
  { q: "부적절한 콘텐츠를 발견했어요.", a: "영상·댓글·커뮤니티 글의 신고 버튼(깃발 아이콘)으로 신고해 주세요. 운영팀이 검토 후 조치하며, 신고 누적 시 자동 숨김 처리됩니다." },
  { q: "광고 집행·제휴·투자 문의는 어디로 하나요?", a: '푸터의 비즈니스 문의 폼을 이용하시거나 <a href="mailto:business@creaite.net" class="text-[#8b5cf6] hover:underline">business@creaite.net</a> 으로 연락 주세요.' },
];

const FAQ_EN: { q: string; a: string }[] = [
  { q: "What is CREAITE?", a: "The world's first AI cinema OTT. Watch films, dramas, and animation made by AI creators — while creators earn ad, sales, and subscription revenue." },
  { q: "How much does it cost?", a: "Watching is free (with ads). Premium (₩4,900/month) removes all ads and unlocks full-length features." },
  { q: "Does the subscription auto-renew?", a: "No. Subscriptions are one-time 30-day payments. There is no auto-billing — extend anytime from My Page (extensions add 30 days to your remaining period)." },
  { q: "How do refunds work?", a: 'You can request a refund within 7 days of payment via My Page → Settings → Payment History. See <a href="?info=terms" class="text-[#8b5cf6] hover:underline">Terms Article 7</a> for details.' },
  { q: "Who can upload videos?", a: "Any member can upload from the Upload tab. Only your own AI-generated/AI-assisted creations are allowed — re-uploading others' work leads to immediate sanctions." },
  { q: "How do creators earn?", a: 'Three ways: ① ad revenue (impression-based) ② license sales ③ subscription pool sharing (proportional to OTT watch time). See the <a href="?info=creator-revenue" class="text-[#8b5cf6] hover:underline">Creator Revenue Policy</a>.' },
  { q: "When do I get paid?", a: "Settlements run monthly with a ₩10,000 minimum payout. Amounts below the minimum roll over to the next month. Register your payout account in My Page." },
  { q: "What is a video license purchase?", a: "Purchasing a license lets you download the original file and use it within the terms (non-exclusive license)." },
  { q: "Why are there ads?", a: "Ads keep watching free and fund creator revenue sharing. Premium removes all ads." },
  { q: "I forgot my password.", a: "On the sign-in screen, enter your email and tap 'Forgot password?' to receive a reset email." },
  { q: "I didn't receive the confirmation email.", a: 'Check your spam folder first, then use the "Resend email" button on the sign-up screen. Still nothing? Contact <a href="mailto:support@creaite.net" class="text-[#8b5cf6] hover:underline">support@creaite.net</a>.' },
  { q: "I found inappropriate content.", a: "Use the report button (flag icon) on any video, comment, or post. Our team reviews every report; repeated reports trigger automatic hiding." },
  { q: "Advertising / partnership / investment inquiries?", a: 'Use the business inquiry form in the footer, or email <a href="mailto:business@creaite.net" class="text-[#8b5cf6] hover:underline">business@creaite.net</a>.' },
];

export function FaqPage({ onBack, onNavigate }: StaticPageProps) {
  const isKo = useIsKorean();
  const faqs = isKo ? FAQ_KO : FAQ_EN;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <PageShell
      title={isKo ? "자주 묻는 질문" : "FAQ"}
      subtitle={isKo ? "크리에잇 이용 중 궁금한 점을 모았습니다" : "Answers to common questions about CREAITE"}
      onBack={onBack}
      onNavigate={onNavigate}
    >
      <div className="space-y-2.5">
        {faqs.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className={`bg-[#121212] rounded-2xl border transition-colors ${isOpen ? "border-[#6366f1]/40" : "border-white/5"}`}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left"
              >
                <HelpCircle className={`w-4 h-4 shrink-0 ${isOpen ? "text-[#8b5cf6]" : "text-gray-500"}`} />
                <span className="flex-1 text-sm font-semibold text-white">{f.q}</span>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p
                      className="px-5 pb-4 pl-12 text-sm text-gray-300 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: f.a }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-gradient-to-br from-[#6366f1]/10 to-[#8b5cf6]/10 border border-[#6366f1]/20 rounded-2xl p-5 text-center">
        <p className="text-sm text-gray-300 mb-1">
          {isKo ? "원하는 답을 찾지 못하셨나요?" : "Didn't find what you were looking for?"}
        </p>
        <a href="mailto:support@creaite.net" className="text-sm font-bold text-[#8b5cf6] hover:underline">
          support@creaite.net
        </a>
      </div>
    </PageShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 공지사항 — 2026-06-11 신설
// 어드민이 커뮤니티 글쓰기에서 "공지로 등록" 체크한 글(is_notice)을 모아서 표시
// ──────────────────────────────────────────────────────────────────────
interface NoticeRow {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export function NoticesPage({ onBack, onNavigate }: StaticPageProps) {
  const isKo = useIsKorean();
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("id,title,content,created_at")
        .eq("is_notice", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) console.warn("[Notices] 조회 실패:", error.message);
      setNotices((data || []) as NoticeRow[]);
      if (data && data.length > 0) setOpen(data[0].id);  // 최신 공지 펼친 상태로
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <PageShell
      title={isKo ? "공지사항" : "Notices"}
      subtitle={isKo ? "크리에잇의 새로운 소식과 안내를 확인하세요" : "News and announcements from CREAITE"}
      onBack={onBack}
      onNavigate={onNavigate}
    >
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : notices.length === 0 ? (
        <div className="bg-[#121212] border border-dashed border-white/10 rounded-2xl p-12 text-center">
          <Megaphone className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-300">
            {isKo ? "아직 등록된 공지사항이 없습니다" : "No notices yet"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isKo ? "새로운 소식이 생기면 이곳에서 알려드릴게요." : "We'll post updates here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notices.map((n) => {
            const isOpen = open === n.id;
            return (
              <div key={n.id} className={`bg-[#121212] rounded-2xl border transition-colors ${isOpen ? "border-[#f59e0b]/40" : "border-white/5"}`}>
                <button
                  onClick={() => setOpen(isOpen ? null : n.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left"
                >
                  <Megaphone className={`w-4 h-4 shrink-0 ${isOpen ? "text-[#fbbf24]" : "text-gray-500"}`} />
                  <span className="flex-1 text-sm font-semibold text-white">{n.title}</span>
                  <span className="text-xs text-gray-500 shrink-0">{fmtDate(n.created_at)}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 pl-12 text-sm text-gray-300 leading-relaxed whitespace-pre-line">{n.content}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 버그를 잡아라 — 버그 제보 폼 (2026-06-11)
// 로그인 사용자만 제보(쿠폰 지급 대상 식별). bug_reports 테이블에 저장.
// ──────────────────────────────────────────────────────────────────────
interface BugReportPageProps extends StaticPageProps {
  onSignInClick?: () => void;
}

export function BugReportPage({ onBack, onNavigate, onSignInClick }: BugReportPageProps) {
  const isKo = useIsKorean();
  const { user, profile, isAuthenticated } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [contact, setContact] = useState("");
  const [images, setImages] = useState<string[]>([]);   // 업로드 완료된 스크린샷 URL
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const MAX_IMAGES = 3;

  // 로그인 시 연락처 기본값 = 가입 이메일
  useEffect(() => {
    if (user?.email && !contact) setContact(user.email);
  }, [user?.email]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 스크린샷 업로드 (bug-screenshots 버킷, 본인 폴더). 다중 선택 지원, 최대 3장.
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user?.id) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) { toast.error(isKo ? `스크린샷은 최대 ${MAX_IMAGES}장까지예요.` : `Up to ${MAX_IMAGES} screenshots.`); return; }
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of picked) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 5 * 1024 * 1024) {
          toast.error(isKo ? "이미지는 5MB 이하여야 해요." : "Images must be under 5MB.");
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
        const { error } = await supabase.storage.from("bug-screenshots").upload(path, file, { contentType: file.type, upsert: false });
        if (error) { console.warn("[BugReport] 업로드 실패:", error.message); continue; }
        const { data } = supabase.storage.from("bug-screenshots").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      if (urls.length) setImages((prev) => [...prev, ...urls]);
      else toast.error(isKo ? "업로드에 실패했어요." : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!isAuthenticated || !user?.id) { onSignInClick?.(); return; }
    if (title.trim().length < 2 || description.trim().length < 5) {
      toast.error(isKo ? "제목(2자+)과 내용(5자+)을 입력해주세요." : "Enter a title (2+) and details (5+).");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("bug_reports").insert({
        user_id: user.id,
        reporter_name: profile?.display_name || user.name || null,
        reporter_contact: contact.trim() || user.email || null,
        title: title.trim(),
        description: description.trim(),
        steps: steps.trim() || null,
        page_url: pageUrl.trim() || null,
        image_urls: images.length ? images : null,
      });
      if (error) throw error;
      setDone(true);
    } catch (e: any) {
      console.warn("[BugReport] 제보 실패:", e?.message);
      toast.error(isKo ? "제보에 실패했어요. 잠시 후 다시 시도해주세요." : "Failed to submit. Try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#6366f1] transition-colors";

  return (
    <PageShell
      title={isKo ? "버그를 잡아라 🐛" : "Bug Hunt 🐛"}
      subtitle={isKo ? "버그를 제보하고 커피 쿠폰을 받아가세요" : "Report a bug, get a coffee coupon"}
      onBack={onBack}
      onNavigate={onNavigate}
    >
      {/* 이벤트 안내 */}
      <div className="bg-gradient-to-br from-[#6366f1]/10 to-[#8b5cf6]/10 border border-[#6366f1]/20 rounded-2xl p-5 md:p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Coffee className="w-5 h-5 text-[#a78bfa]" />
          <h2 className="text-lg font-black text-white">{isKo ? "베타 버그 헌트 이벤트" : "Beta Bug Hunt"}</h2>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">
          {isKo
            ? "크리에잇을 더 단단하게 만들어 주세요! 사용 중 발견한 오류·이상 동작·불편한 점을 제보해 주시면, 운영팀 검토 후 채택된 제보를 주신 모든 분께 커피 쿠폰을 보내드립니다. 같은 버그는 먼저 제보해 주신 분 기준이며, 사소해 보여도 환영합니다."
            : "Help us make CREAITE more solid! Report any bug, glitch, or rough edge you find. After review, everyone whose report is accepted gets a coffee coupon. For duplicates, the first reporter counts — and small ones are welcome too."}
        </p>
      </div>

      {done ? (
        <div className="bg-[#121212] border border-[#10b981]/30 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-[#34d399] mx-auto mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">{isKo ? "제보 완료! 감사합니다 🙌" : "Submitted! Thank you 🙌"}</h3>
          <p className="text-sm text-gray-400">
            {isKo
              ? "운영팀이 검토 후 채택되면 입력하신 연락처로 커피 쿠폰을 보내드릴게요."
              : "Once accepted after review, we'll send a coffee coupon to the contact you provided."}
          </p>
          <button
            onClick={() => { setDone(false); setTitle(""); setDescription(""); setSteps(""); setPageUrl(""); setImages([]); }}
            className="mt-5 px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 transition-colors"
          >
            {isKo ? "다른 버그도 제보하기" : "Report another bug"}
          </button>
        </div>
      ) : !isAuthenticated ? (
        <div className="bg-[#121212] border border-white/10 rounded-2xl p-8 text-center">
          <Bug className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-300 mb-4">
            {isKo ? "버그 제보는 로그인 후 이용할 수 있어요 (쿠폰을 보내드리기 위해 필요해요)." : "Please sign in to report a bug (so we can send your coupon)."}
          </p>
          <button
            onClick={() => onSignInClick?.()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
          >
            {isKo ? "로그인하기" : "Sign in"}
          </button>
        </div>
      ) : (
        <div className="bg-[#121212] border border-white/5 rounded-2xl p-5 md:p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1.5">{isKo ? "어떤 버그인가요? (제목)" : "Bug title"} <span className="text-red-400">*</span></label>
            <input className={inputCls} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)}
              placeholder={isKo ? "예: 영상 재생 중 댓글창이 닫히지 않아요" : "e.g. Comment sheet won't close during playback"} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1.5">{isKo ? "자세한 내용" : "Details"} <span className="text-red-400">*</span></label>
            <textarea className={`${inputCls} resize-none`} rows={4} value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)}
              placeholder={isKo ? "어떤 상황에서 무엇이 잘못됐는지 적어주세요." : "Describe what went wrong and when."} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1.5">{isKo ? "재현 방법 (선택)" : "Steps to reproduce (optional)"}</label>
            <textarea className={`${inputCls} resize-none`} rows={3} value={steps} maxLength={2000} onChange={(e) => setSteps(e.target.value)}
              placeholder={isKo ? "1) ... 2) ... 3) ..." : "1) ... 2) ... 3) ..."} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-1.5">{isKo ? "발생한 화면/주소 (선택)" : "Where it happened (optional)"}</label>
              <input className={inputCls} value={pageUrl} maxLength={300} onChange={(e) => setPageUrl(e.target.value)}
                placeholder={isKo ? "예: 시네마 / 영상 상세" : "e.g. Cinema / video detail"} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-1.5">{isKo ? "쿠폰 받을 연락처" : "Contact for coupon"} <span className="text-red-400">*</span></label>
              <input className={inputCls} value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)}
                placeholder={isKo ? "이메일 또는 카카오 ID" : "Email or Kakao ID"} />
            </div>
          </div>
          {/* 스크린샷 첨부 (최대 3장) */}
          <div>
            <label className="text-xs font-bold text-gray-400 block mb-1.5">
              {isKo ? `스크린샷 첨부 (선택, 최대 ${MAX_IMAGES}장)` : `Screenshots (optional, up to ${MAX_IMAGES})`}
            </label>
            <div className="flex flex-wrap gap-2">
              {images.map((url, i) => (
                <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10">
                  <img src={url} alt={`screenshot ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white hover:bg-red-500/80"
                    aria-label="remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <label className={`w-20 h-20 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[#6366f1]/50 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <ImagePlus className="w-5 h-5 text-gray-400" />}
                  <span className="text-[10px] text-gray-500">{isKo ? "추가" : "Add"}</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void handleUpload(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={submit}
              disabled={submitting || uploading || title.trim().length < 2 || description.trim().length < 5}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white disabled:opacity-40 transition-opacity"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isKo ? "버그 제보하기" : "Submit bug"}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
