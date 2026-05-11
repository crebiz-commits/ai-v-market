import { useState } from "react";
// @ts-ignore — react-dom 타입 미설치, 런타임은 정상
import { createPortal } from "react-dom";
import { Menu, X, Briefcase, Building2, FileText, Shield, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useBackButton } from "../hooks/useBackButton";

interface HamburgerMenuProps {
  onNavigate: (tab: "business" | "about" | "terms" | "privacy") => void;
}

/**
 * 모바일 헤더용 햄버거 메뉴 (외부인용 페이지 진입).
 *
 * 데스크톱은 푸터가 같은 역할을 한다.
 */
export function HamburgerMenu({ onNavigate }: HamburgerMenuProps) {
  const [open, setOpen] = useState(false);
  useBackButton(open, () => setOpen(false));

  const handleNav = (tab: "business" | "about" | "terms" | "privacy") => {
    setOpen(false);
    onNavigate(tab);
  };

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="메뉴"
      >
        <Menu className="w-[22px] h-[22px]" />
      </motion.button>

      {/* 패널은 React Portal로 document.body 직접 자식으로 — 부모 transform 영향 회피 */}
      {createPortal(
        <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/70 z-[60] backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full sm:w-[360px] z-[70] bg-[#0a0a0a] border-l border-white/10 shadow-2xl overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/5 bg-[#0a0a0a]">
                <h2 className="text-base font-black text-white">메뉴</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-gray-300"
                  aria-label="닫기"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-3">
                <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">비즈니스</div>
                <MenuItem icon={Briefcase} label="비즈니스 문의" sub="광고 · 투자 · 제휴" onClick={() => handleNav("business")} />
                <MenuItem icon={Building2} label="CREAITE 소개" onClick={() => handleNav("about")} />

                <div className="my-2 border-t border-white/5" />

                <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">약관·정책</div>
                <MenuItem icon={FileText} label="이용약관" onClick={() => handleNav("terms")} />
                <MenuItem icon={Shield} label="개인정보처리방침" onClick={() => handleNav("privacy")} />

                <div className="my-2 border-t border-white/5" />

                <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">지원</div>
                <a
                  href="mailto:support@creaite.net"
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1c1c1e] border border-white/10 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-white">고객센터</p>
                    <p className="text-xs text-gray-500 mt-0.5">support@creaite.net</p>
                  </div>
                </a>
              </div>

              <div className="p-4 border-t border-white/5">
                <p className="text-[10px] text-gray-600">© {new Date().getFullYear()} CREAITE</p>
                <p className="text-[10px] text-gray-700 mt-0.5">세계 최초 AI 시네마 OTT</p>
              </div>
            </motion.div>
          </>
        )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function MenuItem({ icon: Icon, label, sub, onClick }: { icon: any; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors text-left"
    >
      <div className="w-11 h-11 rounded-xl bg-[#1c1c1e] border border-white/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-gray-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-white">{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </button>
  );
}
