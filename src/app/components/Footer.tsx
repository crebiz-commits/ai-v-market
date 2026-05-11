import { motion } from "motion/react";

interface FooterProps {
  onNavigate: (tab: "business" | "about" | "terms" | "privacy") => void;
}

/**
 * 데스크톱 페이지 푸터 (모바일에서는 햄버거 메뉴가 대체).
 *
 * 외부 광고주·투자자가 메인 페이지 어디에서나 도달할 수 있도록 모든 페이지 하단에 노출.
 */
export function Footer({ onNavigate }: FooterProps) {
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
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">비즈니스</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  광고 문의
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  투자 / IR
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  사업 제휴
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("business")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  B2B 라이선스
                </button>
              </li>
            </ul>
          </div>

          {/* 회사 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">회사</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate("about")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  CREAITE 소개
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("about")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  비전
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("about")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  채용 (준비 중)
                </button>
              </li>
            </ul>
          </div>

          {/* 약관·정책 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">약관·정책</h3>
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => onNavigate("terms")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  이용약관
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("privacy")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  개인정보처리방침
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate("terms")}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  크리에이터 가이드
                </button>
              </li>
            </ul>
          </div>

          {/* 지원 */}
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3">지원</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:support@creaite.net"
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  고객센터
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

        <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 font-medium">
              © {new Date().getFullYear()} CREAITE. All rights reserved.
            </p>
            <p className="text-[11px] text-gray-600 mt-1">
              세계 최초 AI 시네마 OTT — 크리에이터를 위한 영상 플랫폼
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-600">
            <span>사업자등록번호: 미발급</span>
            <span>·</span>
            <span>대표: 미정</span>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
