// CREAITE 매거진 — AI 영상·크리에이터·플랫폼 오리지널 아티클
//   목록: /?info=magazine   ·   개별 글: /?info=magazine&article=<slug>
//   원본 텍스트 콘텐츠(SEO/색인 대상). PageShell 스타일·다크테마·Footer 재사용.
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Clock } from "lucide-react";
import { Footer } from "./Footer";
import { BackButton } from "./BackButton";
import { useTranslation } from "react-i18next";
import { MAGAZINE_ARTICLES, getArticle, type MagazineCategory } from "../data/magazineArticles";

interface MagazineProps {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}

const CATEGORIES: (MagazineCategory | "전체")[] = ["전체", "가이드", "제작기", "인사이트", "정책"];

// 검색엔진/미리보기용 메타 태그 세팅(정보 페이지는 CSR이라 직접 갱신)
function setMeta(title: string, description: string) {
  document.title = title;
  const set = (sel: string, attr: string, val: string, create: () => HTMLElement) => {
    let el = document.head.querySelector(sel) as HTMLElement | null;
    if (!el) { el = create(); document.head.appendChild(el); }
    el.setAttribute(attr, val);
  };
  set('meta[name="description"]', "content", description, () => {
    const m = document.createElement("meta"); m.setAttribute("name", "description"); return m;
  });
  set('meta[property="og:title"]', "content", title, () => {
    const m = document.createElement("meta"); m.setAttribute("property", "og:title"); return m;
  });
  set('meta[property="og:description"]', "content", description, () => {
    const m = document.createElement("meta"); m.setAttribute("property", "og:description"); return m;
  });
}

export function MagazinePage({ onBack, onNavigate }: MagazineProps) {
  const { t } = useTranslation();
  const slug = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("article")
    : null;
  const article = slug ? getArticle(slug) : undefined;
  const [cat, setCat] = useState<(MagazineCategory | "전체")>("전체");

  const visible = useMemo(
    () => (cat === "전체" ? MAGAZINE_ARTICLES : MAGAZINE_ARTICLES.filter((a) => a.category === cat)),
    [cat],
  );

  // SEO: 문서 title/description 갱신 (목록 ↔ 상세)
  useEffect(() => {
    const prevTitle = document.title;
    if (article) {
      setMeta(`${article.title} | CREAITE 매거진`, article.excerpt);
    } else {
      setMeta("CREAITE 매거진 — AI 영상 제작·크리에이터 인사이트", "AI 영상 프롬프트 작성법, 장르별 연출 가이드, 크리에이터 수익 모델, 제작기까지. CREAITE가 전하는 AI 시네마 이야기.");
      window.scrollTo(0, 0);
    }
    return () => { document.title = prevTitle; };
  }, [article?.slug]);

  const goList = () => {
    // 상세 → 목록: article 파라미터만 제거
    const params = new URLSearchParams(window.location.search);
    params.delete("article");
    window.location.href = `${window.location.pathname}?${params.toString()}`;
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <style>{`
        .mag-prose h3 { color:#fff; font-weight:800; font-size:1.15rem; margin:1.6rem 0 .6rem; letter-spacing:-.01em; }
        .mag-prose p { color:#cfcfd6; line-height:1.85; margin:.7rem 0; font-size:.98rem; }
        .mag-prose ul { margin:.7rem 0 1rem; padding-left:1.1rem; }
        .mag-prose li { color:#cfcfd6; line-height:1.8; margin:.35rem 0; list-style:disc; }
        .mag-prose strong { color:#fff; font-weight:700; }
        .mag-prose em { color:#c4b5fd; font-style:normal; }
        .mag-prose a { color:#a78bfa; text-decoration:underline; text-underline-offset:2px; }
        .mag-prose a:hover { color:#c4b5fd; }
      `}</style>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-20">
        {article ? (
          // ───────── 개별 아티클 ─────────
          <>
            <BackButton onClick={goList} label={t("magazine.backToList", "매거진 목록")} className="mb-6" />
            <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className={`w-full aspect-[16/6] rounded-2xl bg-gradient-to-br ${article.gradient} flex items-center justify-center mb-6`}>
                <span className="text-6xl md:text-7xl drop-shadow-lg">{article.emoji}</span>
              </div>
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-[#6366f1]/15 border border-[#6366f1]/30 text-[#c4b5fd] font-bold">{article.category}</span>
                <span className="text-white/40">{article.date}</span>
                <span className="text-white/40 flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readMinutes}분</span>
              </div>
              <h1 className="text-2xl md:text-4xl font-black text-white leading-tight mb-3">{article.title}</h1>
              <p className="text-gray-400 text-base md:text-lg leading-relaxed mb-8">{article.excerpt}</p>
              <div className="mag-prose" dangerouslySetInnerHTML={{ __html: article.body }} />

              {/* 다른 글 추천 */}
              <div className="mt-12 pt-8 border-t border-white/10">
                <h3 className="text-white font-bold mb-4">다른 이야기도 읽어보세요</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MAGAZINE_ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 4).map((a) => (
                    <a key={a.slug} href={`?info=magazine&article=${a.slug}`} className="flex items-center gap-3 p-3 rounded-xl bg-[#141414] border border-white/5 hover:border-[#6366f1]/40 transition-colors">
                      <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${a.gradient} flex items-center justify-center shrink-0`}><span className="text-xl">{a.emoji}</span></div>
                      <div className="min-w-0">
                        <div className="text-white text-sm font-bold line-clamp-2 leading-snug">{a.title}</div>
                        <div className="text-white/40 text-[11px] mt-0.5">{a.category} · {a.readMinutes}분</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </motion.article>
          </>
        ) : (
          // ───────── 목록 ─────────
          <>
            <BackButton onClick={onBack} label={t("creatorChannel.back", "뒤로")} className="mb-6" />
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
                CREAITE <span className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] bg-clip-text text-transparent">매거진</span>
              </h1>
              <p className="text-gray-400 text-sm md:text-base">AI 영상 제작 가이드, 장르 연출, 크리에이터 수익, 제작기 — AI 시네마를 더 깊이 즐기는 읽을거리.</p>
            </motion.div>

            {/* 카테고리 필터 */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors border ${
                    cat === c ? "bg-white text-black border-white" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visible.map((a, i) => (
                <motion.a
                  key={a.slug}
                  href={`?info=magazine&article=${a.slug}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="group rounded-2xl overflow-hidden bg-[#141414] border border-white/[0.08] hover:border-[#6366f1]/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] transition-all"
                >
                  <div className={`aspect-[16/9] bg-gradient-to-br ${a.gradient} flex items-center justify-center`}>
                    <span className="text-5xl drop-shadow-lg group-hover:scale-110 transition-transform">{a.emoji}</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full bg-[#6366f1]/15 border border-[#6366f1]/30 text-[#c4b5fd] font-bold">{a.category}</span>
                      <span className="text-white/40 flex items-center gap-1"><Clock className="w-3 h-3" /> {a.readMinutes}분</span>
                    </div>
                    <h2 className="text-white font-extrabold text-base leading-snug line-clamp-2 mb-1.5 group-hover:text-[#c4b5fd] transition-colors">{a.title}</h2>
                    <p className="text-white/50 text-xs leading-relaxed line-clamp-3">{a.excerpt}</p>
                    <div className="text-white/30 text-[11px] mt-2">{a.date}</div>
                  </div>
                </motion.a>
              ))}
            </div>
          </>
        )}
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}
