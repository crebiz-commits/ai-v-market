// CREAITE 스포트라이트 — 창작자를 조명하는 편집 코너
//   목록: /?info=spotlight   ·   개별: /?info=spotlight&s=<slug>
//   상세는 creatorId 로 그 창작자의 실제 작품(대표작)을 DB에서 불러와 함께 노출.
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Play, Loader2, Quote, ArrowRight, Sparkles } from "lucide-react";
import { Footer } from "./Footer";
import { BackButton } from "./BackButton";
import { CreatorAvatar } from "./CreatorAvatar";
import { useTranslation } from "react-i18next";
import { supabase } from "../utils/supabaseClient";
import { SPOTLIGHTS, getSpotlight } from "../data/spotlights";
import { isCreaiteSelect } from "../data/collections";
import { CreaiteSelectBadge } from "./CreaiteSelectBadge";

interface SpotlightProps {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}

interface VideoLite {
  id: string;
  title: string;
  thumbnail: string | null;
  genre: string | null;
  duration: string | null;
  likes: number | null;
}

function setMeta(title: string, description: string) {
  document.title = title;
  const set = (sel: string, attr: string, val: string, create: () => HTMLElement) => {
    let el = document.head.querySelector(sel) as HTMLElement | null;
    if (!el) { el = create(); document.head.appendChild(el); }
    el.setAttribute(attr, val);
  };
  set('meta[name="description"]', "content", description, () => { const m = document.createElement("meta"); m.setAttribute("name", "description"); return m; });
  set('meta[property="og:title"]', "content", title, () => { const m = document.createElement("meta"); m.setAttribute("property", "og:title"); return m; });
  set('meta[property="og:description"]', "content", description, () => { const m = document.createElement("meta"); m.setAttribute("property", "og:description"); return m; });
}

export function SpotlightPage({ onBack, onNavigate }: SpotlightProps) {
  const { t } = useTranslation();
  const slug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("s") : null;
  const sp = slug ? getSpotlight(slug) : undefined;
  const [videos, setVideos] = useState<VideoLite[]>([]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!sp);

  useEffect(() => {
    const prev = document.title;
    if (sp) {
      setMeta(`${sp.title} — CREAITE 스포트라이트`, `${sp.tagline}. ${sp.creatorName} 창작자를 만나다.`);
    } else {
      setMeta("CREAITE 스포트라이트 — 창작자를 만나다", "AI 시네마를 만드는 사람들. CREAITE가 주목하는 창작자의 이야기와 작품을 소개합니다.");
      window.scrollTo(0, 0);
    }
    return () => { document.title = prev; };
  }, [sp?.slug]);

  // 상세: 창작자의 대표작(좋아요순) + 아바타 로드
  useEffect(() => {
    if (!sp) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: vids }, { data: creators }] = await Promise.all([
        supabase.from("videos")
          .select("id, title, thumbnail, genre, duration, likes")
          .eq("creator_id", sp.creatorId)
          .or("visibility.eq.public,visibility.is.null").eq("is_hidden", false)
          .order("likes", { ascending: false }).limit(8),
        supabase.rpc("get_creators_info", { p_creator_ids: [sp.creatorId] }),
      ]);
      if (cancelled) return;
      setVideos((vids || []) as VideoLite[]);
      setAvatar((creators && creators[0]?.avatar_url) || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sp?.slug]);

  const goList = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("s");
    window.location.href = `${window.location.pathname}?${params.toString()}`;
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <style>{`
        .sp-intro h3 { color:#fff; font-weight:800; font-size:1.12rem; margin:1.5rem 0 .5rem; }
        .sp-intro p { color:#cfcfd6; line-height:1.85; margin:.6rem 0; font-size:.98rem; }
        .sp-intro strong { color:#fff; font-weight:700; }
        .sp-intro em { color:#c4b5fd; font-style:normal; }
      `}</style>

      <div className={`${sp ? "max-w-4xl" : "max-w-5xl"} mx-auto px-4 md:px-6 py-6 md:py-10 pb-20`}>
        {sp ? (
          // ───────── 스포트라이트 상세 ─────────
          <>
            <BackButton onClick={goList} label={t("spotlight.backToList", "스포트라이트")} className="mb-6" />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {/* 창작자 헤더 */}
              <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${sp.gradient} p-6 md:p-8 mb-6`}>
                <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/15 blur-3xl" />
                <div className="relative flex items-center gap-4">
                  <div className="ring-4 ring-white/30 rounded-full">
                    <CreatorAvatar avatarUrl={avatar} name={sp.creatorName} size="lg" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1 text-[11px] font-black text-white/90 mb-1"><Sparkles className="w-3 h-3" /> {t("spotlight.badge", "CREAITE 스포트라이트")}</div>
                    <div className="text-2xl md:text-3xl font-black text-white leading-tight drop-shadow">{sp.creatorName}</div>
                    <div className="text-white/80 text-sm mt-0.5">{sp.tagline}</div>
                  </div>
                </div>
              </div>

              <h1 className="text-xl md:text-3xl font-black text-white leading-tight mb-4">{sp.title}</h1>

              {/* 풀 쿼트 */}
              <blockquote className="relative pl-5 my-6 border-l-2 border-[#8b5cf6]">
                <Quote className="w-5 h-5 text-[#8b5cf6]/60 mb-1" />
                <p className="text-lg md:text-xl font-bold text-white/90 leading-snug italic">{sp.quote}</p>
              </blockquote>

              <div className="sp-intro mb-8" dangerouslySetInnerHTML={{ __html: sp.intro }} />

              {/* 대표작 */}
              <h2 className="text-white font-bold mb-4">{t("spotlight.works", "대표작")}</h2>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" /></div>
              ) : videos.length === 0 ? (
                <p className="text-white/40 text-sm py-6">{t("spotlight.noWorks", "작품 준비 중입니다.")}</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {videos.map((v) => (
                    <a key={v.id} href={`?video=${v.id}`} className="group rounded-xl overflow-hidden bg-[#141414] border border-white/[0.08] hover:border-[#6366f1]/50 transition-all">
                      <div className="relative aspect-video bg-black overflow-hidden">
                        {v.thumbnail
                          ? <img src={v.thumbnail} loading="lazy" alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          : <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-black" />}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-8 h-8 text-white fill-white" />
                        </div>
                        {isCreaiteSelect(v.id) && <span className="absolute top-1.5 left-1.5"><CreaiteSelectBadge variant="corner" /></span>}
                        {v.duration && <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white">{v.duration}</span>}
                      </div>
                      <div className="p-2.5">
                        <h3 className="text-white text-xs font-bold line-clamp-1 group-hover:text-[#c4b5fd] transition-colors">{v.title}</h3>
                        <div className="text-white/40 text-[10px] mt-0.5">{v.genre || ""}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* 모집 CTA */}
              <div className="mt-10 rounded-2xl bg-gradient-to-r from-[#6366f1]/15 to-[#ec4899]/10 border border-[#6366f1]/25 p-5 md:p-6 text-center">
                <div className="text-lg font-black text-white mb-1">{t("spotlight.ctaTitle", "다음 스포트라이트의 주인공은 당신입니다")}</div>
                <p className="text-white/60 text-sm mb-4">{t("spotlight.ctaBody", "작품을 올리고, 관객을 만나고, 가치를 인정받으세요.")}</p>
                <a href="?tab=upload" className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-bold hover:shadow-lg hover:shadow-[#6366f1]/40 transition-all">
                  {t("spotlight.ctaButton", "내 작품 올리기")} <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          </>
        ) : (
          // ───────── 스포트라이트 목록 ─────────
          <>
            <BackButton onClick={onBack} label={t("creatorChannel.back", "뒤로")} className="mb-6" />
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-[#6366f1]/15 border border-[#6366f1]/30 text-[#c4b5fd] font-bold text-xs"><Sparkles className="w-3 h-3" /> {t("spotlight.badge", "CREAITE 스포트라이트")}</div>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
                {t("spotlight.title1", "창작자를")} <span className="bg-gradient-to-r from-[#6366f1] to-[#ec4899] bg-clip-text text-transparent">{t("spotlight.title2", "만나다")}</span>
              </h1>
              <p className="text-gray-400 text-sm md:text-base">{t("spotlight.subtitle", "AI 시네마를 만드는 사람들. CREAITE가 주목하는 창작자의 이야기와 작품.")}</p>
            </motion.div>

            <div className="grid grid-cols-1 gap-4">
              {SPOTLIGHTS.map((s, i) => (
                <motion.a
                  key={s.slug}
                  href={`?info=spotlight&s=${s.slug}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group relative rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#6366f1]/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.18)] transition-all flex min-h-[160px]"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient}`} />
                  <div className="absolute -right-8 -top-8 w-44 h-44 rounded-full bg-white/15 blur-3xl" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <span className="absolute top-5 right-6 text-6xl md:text-7xl opacity-80 group-hover:scale-110 transition-transform">{s.emoji}</span>
                  <div className="relative mt-auto p-5 md:p-6">
                    <div className="text-[11px] font-black text-white/85 mb-1">{s.creatorName} · {s.tagline}</div>
                    <div className="text-xl md:text-2xl font-black text-white leading-tight drop-shadow line-clamp-2">{s.title}</div>
                  </div>
                </motion.a>
              ))}

              {/* 모집 카드 */}
              <a href="?tab=upload" className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.04] hover:border-[#6366f1]/40 transition-all p-6 text-center">
                <div className="text-base font-black text-white mb-1">✦ {t("spotlight.recruitTitle", "곧, 더 많은 창작자를 만나요")}</div>
                <p className="text-white/50 text-sm">{t("spotlight.recruitBody", "당신의 작품이 다음 스포트라이트가 될 수 있습니다 — 지금 올려보세요.")}</p>
              </a>
            </div>
          </>
        )}
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}
