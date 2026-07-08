import { useState } from "react";
// @ts-ignore — react-dom 타입 미설치, 런타임은 정상
import { createPortal } from "react-dom";
import { Menu, X, Briefcase, Building2, FileText, Shield, Mail, Coins, LifeBuoy, Crown, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useBackButton } from "../hooks/useBackButton";
import { useTranslation } from "react-i18next";

interface HamburgerMenuProps {
  onNavigate: (tab: string) => void;
}

/**
 * 헤더용 햄버거 메뉴 (외부인용 페이지 진입 — 광고주센터·약관·문의 등).
 *
 * 모바일·데스크톱 공통. 데스크톱은 홈 피드가 무한스크롤이라 하단 푸터에
 * 도달하기 어려워, 상단 헤더에서도 동일 진입점을 제공한다.
 */
export function HamburgerMenu({ onNavigate }: HamburgerMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useBackButton(open, () => setOpen(false));

  const handleNav = (tab: string) => {
    // setOpen(false) → useBackButton cleanup → history.back() → popstate 발생.
    // App 의 popstate 핸들러가 URL→activeTab 동기화를 하므로, navigation 은 그 popstate 가
    // 처리된 "직후"에 실행해야 경합이 없다. rAF(불확정 타이밍)는 popstate 보다 먼저 실행될 수
    // 있어 navigation 이 되돌려지므로, popstate 이벤트에 체이닝해 확정적으로 1회만 navigate.
    let done = false;
    const navigate = () => {
      if (done) return;
      done = true;
      window.removeEventListener("popstate", onPop);
      onNavigate(tab);
    };
    const onPop = () => navigate();
    window.addEventListener("popstate", onPop);
    setOpen(false);
    // 안전장치: 어떤 이유로 popstate 가 오지 않으면(이미 닫힘 등) 일정 시간 후 강제 navigate.
    window.setTimeout(navigate, 200);
  };

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t("hamburger.title")}
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
                <h2 className="text-base font-black text-white">{t("hamburger.title")}</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-gray-300"
                  aria-label={t("common.close")}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-3">
                {/* 멤버십(구독) — 상단 강조 진입 */}
                <button
                  onClick={() => handleNav("subscription")}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/30 hover:from-amber-500/30 transition-colors mb-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[15px] font-bold text-white">{t("nav.membership", "멤버십")}</p>
                    <p className="text-xs text-amber-200/70 mt-0.5">{t("hamburger.membershipSub")}</p>
                  </div>
                </button>

                <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">{t("hamburger.business")}</div>
                <MenuItem icon={Briefcase} label={t("business.title")} sub={t("business.subtitle")} onClick={() => handleNav("business")} />
                <MenuItem icon={Building2} label={t("footer.about")} onClick={() => handleNav("about")} />

                <div className="my-2 border-t border-white/5" />

                <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">{t("footer.terms")}</div>
                <MenuItem icon={FileText} label={t("footer.terms")} onClick={() => handleNav("terms")} />
                <MenuItem icon={Shield} label={t("footer.privacy")} onClick={() => handleNav("privacy")} />
                <MenuItem icon={Shield} label={t("footer.youth")} onClick={() => handleNav("youth")} />
                <a
                  href="?info=creator-revenue"
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1c1c1e] border border-white/10 flex items-center justify-center shrink-0">
                    <Coins className="w-5 h-5 text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-white">{t("footer.creatorRevenue")}</p>
                  </div>
                </a>

                <MenuItem icon={Megaphone} label={t("hamburger.advertiser", "광고주 센터")} onClick={() => handleNav("advertiser")} />

                <div className="my-2 border-t border-white/5" />

                <div className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">{t("footer.support")}</div>
                <MenuItem icon={LifeBuoy} label={t("footer.support1on1", "고객센터 · 1:1 문의")} onClick={() => handleNav("support")} />
                <a
                  href="mailto:support@creaite.net"
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#1c1c1e] border border-white/10 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-white">{t("footer.contact")}</p>
                    <p className="text-xs text-gray-500 mt-0.5">support@creaite.net</p>
                  </div>
                </a>
              </div>

              <div className="p-4 border-t border-white/5 space-y-3">
                {/* 사업자 정보 — 전자상거래법 §13 표시 의무 */}
                <div className="text-[10px] text-gray-500 leading-relaxed space-y-1">
                  <p>
                    <span className="text-gray-600">{t("footer.businessInfo.businessName")}</span> 크레비즈
                    <span className="text-gray-700 mx-1">·</span>
                    <span className="text-gray-600">{t("footer.businessInfo.ceo")}</span> 이현우
                  </p>
                  <p>
                    <span className="text-gray-600">{t("footer.businessInfo.bizReg")}</span> 107-10-27099
                  </p>
                  <p>
                    <span className="text-gray-600">{t("footer.businessInfo.mailOrder")}</span> 제 2020-경기파주-0327호
                  </p>
                  <p>
                    <span className="text-gray-600">{t("footer.businessInfo.address")}</span> 경기도 파주시 평화로342번길 71-5, A동 (검산동)
                  </p>
                  <p>
                    <span className="text-gray-600">{t("footer.businessInfo.phone", "전화")}</span> 010-2797-7009
                    <span className="text-gray-700 mx-1">·</span>
                    <span className="text-gray-600">{t("footer.businessInfo.contact")}</span> support@creaite.net
                  </p>
                  <p>
                    <span className="text-gray-600">{t("footer.businessInfo.hosting")}</span> Vercel Inc.
                  </p>
                </div>

                <div className="pt-2 border-t border-white/5">
                  <p className="text-[10px] text-gray-600">© {new Date().getFullYear()} CREAITE</p>
                  <p className="text-[10px] text-gray-700 mt-0.5">{t("footer.tagline")}</p>
                </div>
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
