import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface FooterProps {
  // 각 페이지에서 Footer 호출 시 페이지의 onNavigate prop 그대로 전달 가능하도록 string 타입
  onNavigate: (tab: string) => void;
  // 모바일에서도 노출할지 (기본 false = 데스크탑 전용). 시네마/OTT/업로드/커뮤니티/채널/마이에서 true.
  mobile?: boolean;
}

/**
 * 페이지 하단 푸터 — 데스크탑 전용 (2026-06-11: 모바일/앱에선 숨김).
 *
 * 앱(유튜브·틱톡·넷플릭스 등)은 하단 푸터가 없고 모든 안내가 메뉴 안에 있음.
 * 우리도 모바일에선 햄버거 메뉴에 동일 내용(비즈니스·회사소개·약관·고객센터·사업자정보)이
 * 모두 있으므로 푸터는 숨기고(md:block), 데스크탑(브라우저)에서만 노출.
 */
export function Footer({ onNavigate, mobile = false }: FooterProps) {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language?.startsWith("ko");
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className={`${mobile ? "block" : "hidden md:block"} border-t border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl mt-auto`}
    >
      <div className="max-w-[1800px] mx-auto px-5 md:px-10 py-8">
        {/* 4단 링크 메뉴 — 모바일에선 숨김(햄버거 메뉴에 동일 내용). 데스크탑만 노출 */}
        <div className="hidden md:grid grid-cols-2 md:grid-cols-4 gap-8 mb-6">
          {/* 비즈니스 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">{t("footer.business")}</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("business.categoryAd")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Investor / IR
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("business.categoryPartnership")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("business.categoryLicense")}
                </button>
              </li>
            </ul>
          </div>

          {/* 회사 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">{t("footer.company")}</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate("about")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("footer.about")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("about")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Vision
                </button>
              </li>
            </ul>
          </div>

          {/* 약관·정책 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">{t("footer.terms")}</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate("terms")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("footer.terms")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("privacy")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("footer.privacy")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("youth")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {isKo ? "청소년보호정책" : "Youth Protection"}
                </button>
              </li>
              <li>
                <a
                  href="?info=creator-revenue"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("footer.creatorRevenue")}
                </a>
              </li>
            </ul>
          </div>

          {/* 지원 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">{t("footer.support")}</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate("support")}
                  className="text-sm font-semibold text-[#a78bfa] hover:text-white transition-colors"
                >
                  💬 {t("footer.support1on1", "고객센터 · 1:1 문의")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("notices")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("footer.notices", "공지사항")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("faq")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("footer.faq", "자주 묻는 질문")}
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("bug-report")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  🐛 {t("footer.bugReport", "버그 제보 (커피 쿠폰)")}
                </button>
              </li>
              <li>
                <a
                  href="mailto:support@creaite.net"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  📧 support@creaite.net
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6 space-y-4">
          {/* 사업자 정보(좌) + 계열사·개발운영(우) */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          {/* 사업자 정보 — 전자상거래법 §13 표시 의무. 모바일에선 숨김(햄버거 메뉴에 있음) */}
          <div className="hidden md:block text-xs text-gray-400 leading-relaxed space-y-1">
            <p>
              <span className="text-gray-500">{t("footer.businessInfo.businessName")}</span> 크레비즈
              <span className="text-gray-600 mx-1.5">·</span>
              <span className="text-gray-500">{t("footer.businessInfo.ceo")}</span> 이현우
              <span className="text-gray-600 mx-1.5">·</span>
              <span className="text-gray-500">{t("footer.businessInfo.bizReg")}</span> 107-10-27099
            </p>
            <p>
              <span className="text-gray-500">{t("footer.businessInfo.mailOrder")}</span> 제 2020-경기파주-0327호
              <span className="text-gray-600 mx-1.5">·</span>
              <span className="text-gray-500">{t("footer.businessInfo.hosting")}</span> Vercel Inc.
            </p>
            <p>
              <span className="text-gray-500">{t("footer.businessInfo.address")}</span> 경기도 파주시 평화로342번길 71-5, A동 (검산동)
            </p>
            <p>
              <span className="text-gray-500">{t("footer.businessInfo.phone", "전화")}</span>{" "}
              <a href="tel:01027977009" className="text-gray-300 hover:text-white transition-colors">010-2797-7009</a>
              <span className="text-gray-600 mx-1.5">·</span>
              <span className="text-gray-500">{t("footer.businessInfo.contact")}</span>{" "}
              <a href="mailto:support@creaite.net" className="text-gray-300 hover:text-white transition-colors">support@creaite.net</a>
            </p>
          </div>

          {/* 크레비즈 그룹 안내 — 부가 정보(법정 사업자 표시사항은 좌측 블록이 정본) */}
          <div className="text-xs leading-relaxed space-y-1.5 lg:text-right lg:max-w-[46%]">
            <p className="text-gray-400">
              <span className="text-gray-300 font-semibold">크레비즈 그룹</span> <span className="text-gray-600">(CREBIZ Group)</span>
              <span className="text-gray-600 mx-1.5">·</span>
              <span className="text-gray-500">{isKo ? "그룹 본사" : "Group HQ"}</span> ㈜크레비즈
            </p>
            <p className="text-gray-500">
              <span className="text-gray-400 font-semibold">{isKo ? "계열사" : "Affiliates"}</span>
              <span className="text-gray-600 mx-1.5">|</span>
              크레비즈 로지스틱스 <span className="text-gray-600">(CREBIZ Logistics)</span>
              <span className="text-gray-700 mx-1">·</span>
              크리에잇 <span className="text-gray-600">(CREAITE)</span>
              <span className="text-gray-700 mx-1">·</span>
              크레비즈 인베스트먼트 <span className="text-gray-600">(CREBIZ Investment)</span>
              <span className="text-gray-700 mx-1">·</span>
              크레비즈 트레이드 <span className="text-gray-600">(CREBIZ Trade)</span>
              <span className="text-gray-700 mx-1">·</span>
              크레비즈 소프트웨어 컴퍼니 <span className="text-gray-600">(CREBIZ Software Company)</span>
            </p>
          </div>
          </div>

          {/* 카피라이트 */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pt-3 border-t border-white/5">
            <p className="text-xs text-gray-300 font-medium">
              © {new Date().getFullYear()} CREAITE. All rights reserved.
            </p>
            <p className="text-xs font-bold bg-gradient-to-r from-[#6366f1] via-[#ec4899] to-[#06b6d4] bg-clip-text text-transparent">
              {t("footer.tagline")}
            </p>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
