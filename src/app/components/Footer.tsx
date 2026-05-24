import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface FooterProps {
  onNavigate: (tab: "business" | "about" | "terms" | "privacy") => void;
}

/**
 * 데스크톱 페이지 푸터 (모바일에서는 햄버거 메뉴가 대체).
 *
 * 외부 광고주·투자자가 메인 페이지 어디에서나 도달할 수 있도록 모든 페이지 하단에 노출.
 */
export function Footer({ onNavigate }: FooterProps) {
  const { t } = useTranslation();
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="hidden md:block border-t border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl mt-auto"
    >
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-6">
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
              <li>
                <button
                  onClick={() => onNavigate("about")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Careers (coming soon)
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
                  onClick={() => onNavigate("terms")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Creator Guide
                </button>
              </li>
            </ul>
          </div>

          {/* 지원 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">{t("footer.support")}</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:support@creaite.net"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {t("footer.contact")}
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@creaite.net"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  support@creaite.net
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6 space-y-4">
          {/* 사업자 정보 — 전자상거래법 §13 표시 의무 */}
          <div className="text-[11px] text-gray-500 leading-relaxed space-y-1">
            <p>
              <span className="text-gray-600">{t("footer.businessInfo.businessName")}</span> 크레비즈
              <span className="text-gray-700 mx-1.5">·</span>
              <span className="text-gray-600">{t("footer.businessInfo.ceo")}</span> 이현우
              <span className="text-gray-700 mx-1.5">·</span>
              <span className="text-gray-600">{t("footer.businessInfo.bizReg")}</span> 107-10-27099
            </p>
            <p>
              <span className="text-gray-600">{t("footer.businessInfo.mailOrder")}</span> 제 2020-경기파주-0327호
              <span className="text-gray-700 mx-1.5">·</span>
              <span className="text-gray-600">{t("footer.businessInfo.hosting")}</span> Vercel Inc.
            </p>
            <p>
              <span className="text-gray-600">{t("footer.businessInfo.address")}</span> 경기도 파주시 평화로342번길 71-5, A동 (검산동)
            </p>
            <p>
              <span className="text-gray-600">{t("footer.businessInfo.contact")}</span>{" "}
              <a href="mailto:support@creaite.net" className="hover:text-white transition-colors">support@creaite.net</a>
            </p>
          </div>

          {/* 카피라이트 */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pt-3 border-t border-white/5">
            <p className="text-xs text-gray-500 font-medium">
              © {new Date().getFullYear()} CREAITE. All rights reserved.
            </p>
            <p className="text-[11px] text-gray-600">
              {t("footer.tagline")}
            </p>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
