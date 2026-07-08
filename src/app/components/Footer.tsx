import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { CoupangBanner } from "./CoupangBanner";
import { MAGAZINE_ARTICLES } from "../data/magazineArticles";

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
const MAGAZINE_CAT_KEY: Record<string, string> = {
  "전체": "magazine.cat.all", "가이드": "magazine.cat.guide", "제작기": "magazine.cat.making",
  "인사이트": "magazine.cat.insight", "정책": "magazine.cat.policy",
};

export function Footer({ onNavigate, mobile = false }: FooterProps) {
  const { t, i18n } = useTranslation();
  const lang: "ko" | "en" = (i18n.language || "ko").split("-")[0] === "en" ? "en" : "ko";
  const catLabel = (c: string) => t(MAGAZINE_CAT_KEY[c] ?? "", { defaultValue: c });
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className={`${mobile ? "block" : "hidden md:block"} border-t border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl mt-auto`}
    >
      <div className="max-w-[1800px] mx-auto px-5 md:px-10 py-6 md:py-8">
        {/* CREAITE 매거진 — 에디토리얼(대표 1 + 리스트 3). 쿠팡 배너 바로 위, 모바일도 노출 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-[11px] font-black tracking-wider">📖 MAGAZINE</span>
              <span className="hidden sm:inline text-white/40 font-semibold text-xs">AI 영상 제작 가이드 · 인사이트</span>
            </h3>
            <a href="?info=magazine" className="text-xs font-bold text-[#a78bfa] hover:text-white transition-colors">
              {t("footer.magazineMore", "전체보기")} →
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* 대표 기사 (커버 + 발췌 + CTA) */}
            {(() => {
              const f = MAGAZINE_ARTICLES[0];
              return (
                <a
                  href={`?info=magazine&article=${f.slug}`}
                  className="md:col-span-3 group relative rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#6366f1]/50 hover:shadow-[0_0_28px_rgba(99,102,241,0.2)] transition-all flex min-h-[168px]"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${f.gradient}`} />
                  <div className="absolute -right-6 -top-6 w-40 h-40 rounded-full bg-white/15 blur-2xl" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <span className="absolute top-3 right-4 text-6xl md:text-7xl opacity-80 group-hover:scale-110 group-hover:rotate-3 transition-transform">{f.emoji}</span>
                  <div className="relative mt-auto p-4">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-black text-white/95 mb-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-white/20 backdrop-blur-sm">{catLabel(f.category)}</span>
                      <span className="text-white/70">{t("magazine.readMin", { count: f.readMinutes })}</span>
                    </div>
                    <div className="text-base md:text-xl font-black text-white leading-tight mb-1 line-clamp-2 drop-shadow">{f.title[lang]}</div>
                    <div className="text-xs text-white/75 line-clamp-2 mb-2">{f.excerpt[lang]}</div>
                    <span className="text-xs font-bold text-white inline-flex items-center gap-1 group-hover:gap-2 transition-all">{t("magazine.read", "읽기")} <span>→</span></span>
                  </div>
                </a>
              );
            })()}

            {/* 리스트 3편 */}
            <div className="md:col-span-2 flex flex-col gap-2">
              {MAGAZINE_ARTICLES.slice(1, 4).map((a) => (
                <a
                  key={a.slug}
                  href={`?info=magazine&article=${a.slug}`}
                  className="group flex items-center gap-3 p-2.5 rounded-xl bg-[#141414] border border-white/[0.08] hover:border-[#6366f1]/50 hover:bg-white/[0.03] transition-all flex-1"
                >
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${a.gradient} flex items-center justify-center shrink-0 shadow-inner`}>
                    <span className="text-2xl group-hover:scale-110 transition-transform">{a.emoji}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#c4b5fd] font-bold mb-0.5">{catLabel(a.category)} · {t("magazine.readMin", { count: a.readMinutes })}</div>
                    <div className="text-[13px] font-bold text-white leading-snug line-clamp-2 group-hover:text-[#c4b5fd] transition-colors">{a.title[lang]}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* 쿠팡파트너스 보조 배너 — env(VITE_COUPANG_ID/TRACKING) 설정 시에만 노출. 고지 문구 포함 */}
        <CoupangBanner className="mb-6" height={140} />

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
                  {t("footer.youth")}
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
                <a
                  href="?info=magazine"
                  className="text-sm font-semibold text-[#a78bfa] hover:text-white transition-colors"
                >
                  📖 {t("footer.magazine", "CREAITE 매거진")}
                </a>
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
              <span className="text-gray-500">{t("footer.groupHq")}</span> ㈜크레비즈
            </p>
            <p className="text-gray-500">
              <span className="text-gray-400 font-semibold">{t("footer.affiliates")}</span>
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
            <p className="text-gray-500">
              <span className="text-gray-500">🛠 {t("footer.devOps")}</span>
              <span className="text-gray-600 mx-1.5">—</span>
              크레비즈 소프트웨어 컴퍼니 <span className="text-gray-600">(CREBIZ Software Company)</span>
            </p>
          </div>
          </div>

          {/* 카피라이트 */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pt-3 border-t border-white/5">
            {/* 좌측: 카피라이트 (데스크탑만) */}
            <p className="hidden md:block text-xs text-gray-300 font-medium">
              © {new Date().getFullYear()} CREAITE. All rights reserved.
            </p>
            {/* 우측: 태그라인 (독립) */}
            <p className="text-xs font-bold bg-gradient-to-r from-[#6366f1] via-[#ec4899] to-[#06b6d4] bg-clip-text text-transparent md:text-right">
              {t("footer.tagline")}
            </p>
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
