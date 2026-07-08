// CREAITE 컬렉션 — 에디터가 고른 큐레이션 셀렉션
//   목록: /?info=collections   ·   개별: /?info=collections&c=<slug>
//   상세는 collection.videoIds 로 DB에서 실제 영상을 불러와 카드로 표시.
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Play, Clock, Loader2 } from "lucide-react";
import { Footer } from "./Footer";
import { BackButton } from "./BackButton";
import { useTranslation } from "react-i18next";
import { supabase } from "../utils/supabaseClient";
import { COLLECTIONS, getCollection, isCreaiteSelect } from "../data/collections";
import { CreaiteSelectBadge } from "./CreaiteSelectBadge";

interface CollectionsProps {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
}

interface VideoLite {
  id: string;
  title: string;
  thumbnail: string | null;
  creator: string | null;
  genre: string | null;
  duration: string | null;
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

export function CollectionsPage({ onBack, onNavigate }: CollectionsProps) {
  const { t } = useTranslation();
  const slug = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("c") : null;
  const col = slug ? getCollection(slug) : undefined;
  const [videos, setVideos] = useState<VideoLite[]>([]);
  const [loading, setLoading] = useState(!!col);

  // SEO 메타
  useEffect(() => {
    const prev = document.title;
    if (col) {
      setMeta(`${col.title} — CREAITE 컬렉션`, `${col.tagline}. 에디터가 고른 AI 시네마 셀렉션.`);
    } else {
      setMeta("CREAITE 컬렉션 — 에디터가 고른 AI 시네마 셀렉션", "장르와 무드로 엮은 큐레이션 셀렉션. 처음이라면 이 다섯 편, 긴장의 밤, 마음이 머무는 곳, 경계 너머 — CREAITE 에디터의 추천.");
      window.scrollTo(0, 0);
    }
    return () => { document.title = prev; };
  }, [col?.slug]);

  // 상세: videoIds 로 실제 영상 로드(숨김·삭제 제외), 큐레이션 순서 보존
  useEffect(() => {
    if (!col) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, thumbnail, creator, genre, duration")
        .in("id", col.videoIds)
        .or("visibility.eq.public,visibility.is.null")
        .eq("is_hidden", false);
      if (cancelled) return;
      const map = new Map((data || []).map((v: any) => [v.id, v as VideoLite]));
      // 큐레이션 순서대로 정렬 + 사라진 영상 제외
      setVideos(col.videoIds.map((id) => map.get(id)).filter(Boolean) as VideoLite[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [col?.slug]);

  const goList = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("c");
    window.location.href = `${window.location.pathname}?${params.toString()}`;
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      <style>{`
        .col-intro p { color:#cfcfd6; line-height:1.85; margin:.6rem 0; font-size:.98rem; }
        .col-intro strong { color:#fff; font-weight:700; }
        .col-intro em { color:#c4b5fd; font-style:normal; }
      `}</style>

      <div className={`${col ? "max-w-5xl" : "max-w-6xl"} mx-auto px-4 md:px-6 py-6 md:py-10 pb-20`}>
        {col ? (
          // ───────── 컬렉션 상세 ─────────
          <>
            <BackButton onClick={goList} label={t("collections.backToList", "컬렉션 목록")} className="mb-6" />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className={`relative w-full aspect-[16/5] rounded-2xl overflow-hidden bg-gradient-to-br ${col.gradient} flex items-center justify-center mb-6`}>
                <div className="absolute -right-8 -top-8 w-52 h-52 rounded-full bg-white/15 blur-3xl" />
                <span className="relative text-6xl md:text-8xl drop-shadow-lg">{col.emoji}</span>
              </div>
              <div className="inline-flex items-center gap-2 mb-2">
                <span className="px-2.5 py-1 rounded-full bg-[#6366f1]/15 border border-[#6366f1]/30 text-[#c4b5fd] font-bold text-xs">✦ {t("collections.editorPick", "에디터의 선택")}</span>
                <span className="text-white/40 text-xs">{col.tagline}</span>
              </div>
              <h1 className="text-2xl md:text-4xl font-black text-white leading-tight mb-3">{col.title}</h1>
              <div className="col-intro mb-8" dangerouslySetInnerHTML={{ __html: col.intro }} />

              {/* 큐레이션 영상 */}
              <h2 className="text-white font-bold mb-4 flex items-center gap-2">
                {t("collections.inThisCollection", "이 컬렉션의 작품")}
                {!loading && <span className="text-white/40 text-sm font-semibold">{videos.length}</span>}
              </h2>
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#8b5cf6]" /></div>
              ) : videos.length === 0 ? (
                <p className="text-white/40 text-sm py-8">{t("collections.empty", "표시할 작품이 없습니다.")}</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {videos.map((v, i) => (
                    <a
                      key={v.id}
                      href={`?video=${v.id}`}
                      className="group rounded-2xl overflow-hidden bg-[#141414] border border-white/[0.08] hover:border-[#6366f1]/50 hover:shadow-[0_0_24px_rgba(99,102,241,0.15)] transition-all"
                    >
                      <div className="relative aspect-video bg-black overflow-hidden">
                        {v.thumbnail ? (
                          <img src={v.thumbnail} loading="lazy" alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-black" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur border border-white/40 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                        <span className="absolute top-2 left-2 w-6 h-6 rounded bg-black/70 backdrop-blur-sm flex items-center justify-center text-[11px] font-black text-white">{i + 1}</span>
                        {isCreaiteSelect(v.id) && <span className="absolute top-2 right-2"><CreaiteSelectBadge variant="corner" /></span>}
                        {v.duration && <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white">{v.duration}</span>}
                      </div>
                      <div className="p-3">
                        <h3 className="text-white text-sm font-bold line-clamp-1 group-hover:text-[#c4b5fd] transition-colors">{v.title}</h3>
                        <div className="text-white/40 text-[11px] mt-0.5">{v.genre || ""}{v.creator ? ` · ${v.creator}` : ""}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* 다른 컬렉션 */}
              <div className="mt-12 pt-8 border-t border-white/10">
                <h3 className="text-white font-bold mb-4">{t("collections.more", "다른 셀렉션")}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {COLLECTIONS.filter((c) => c.slug !== col.slug).map((c) => (
                    <a key={c.slug} href={`?info=collections&c=${c.slug}`} className="flex items-center gap-3 p-3 rounded-xl bg-[#141414] border border-white/5 hover:border-[#6366f1]/40 transition-colors">
                      <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${c.gradient} flex items-center justify-center shrink-0`}><span className="text-xl">{c.emoji}</span></div>
                      <div className="min-w-0">
                        <div className="text-white text-sm font-bold line-clamp-1">{c.title}</div>
                        <div className="text-white/40 text-[11px] mt-0.5">{c.tagline}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        ) : (
          // ───────── 컬렉션 목록 ─────────
          <>
            <BackButton onClick={onBack} label={t("creatorChannel.back", "뒤로")} className="mb-6" />
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
              <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-[#6366f1]/15 border border-[#6366f1]/30 text-[#c4b5fd] font-bold text-xs">✦ {t("collections.editorPick", "에디터의 선택")}</div>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
                CREAITE <span className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] bg-clip-text text-transparent">{t("collections.title", "컬렉션")}</span>
              </h1>
              <p className="text-gray-400 text-sm md:text-base">{t("collections.subtitle", "장르와 무드로 엮은 큐레이션 셀렉션 — 무엇을 볼지 고민될 때, 에디터가 골라 드립니다.")}</p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {COLLECTIONS.map((c, i) => (
                <motion.a
                  key={c.slug}
                  href={`?info=collections&c=${c.slug}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group relative rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#6366f1]/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.18)] transition-all min-h-[150px] flex"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient}`} />
                  <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  <span className="absolute top-4 right-5 text-5xl md:text-6xl opacity-85 group-hover:scale-110 group-hover:rotate-3 transition-transform">{c.emoji}</span>
                  <div className="relative mt-auto p-5">
                    <div className="text-[11px] font-black text-white/80 mb-1">{c.tagline} · {c.videoIds.length}편</div>
                    <div className="text-xl md:text-2xl font-black text-white leading-tight drop-shadow">{c.title}</div>
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
