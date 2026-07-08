// ════════════════════════════════════════════════════════════════════════════
// Phase 36 — 동적 Sitemap XML (Vercel Edge Function)
// 구글/네이버에 모든 공개 영상 URL 제공 → 인덱싱 가속
// 캐시: 1시간 (영상이 자주 추가되면 짧게)
// ════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "edge" };

const SUPABASE_PROJECT_ID = "tvbpiuwmvrccfnplhwer";
const SUPABASE_ANON_KEY = "sb_publishable_K3wmxz8uqsvUdeYXUhJv2g_g09eNNR8";
const SITE_URL = "https://www.creaite.net";

interface VideoLite {
  id: string;
  created_at: string;
}

async function fetchAllVideos(): Promise<VideoLite[]> {
  // 공개 + 숨김 아님 영상만 (최대 5만 건 — Vercel Edge 메모리 한도 고려)
  const url = `https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/videos?select=id,created_at&or=(visibility.eq.public,visibility.is.null)&is_hidden=is.false&order=created_at.desc&limit=50000`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return [];
  return (await res.json()) as VideoLite[];
}

export default async function handler(_req: Request): Promise<Response> {
  const videos = await fetchAllVideos();

  // CREAITE 매거진 아티클 slug (src/app/data/magazineArticles.ts 와 동기화)
  const MAGAZINE_SLUGS = [
    "creaite-is-your-distributor",
    "ai-video-prompt-formula",
    "making-of-paper-wings",
    "how-creators-earn",
    "genre-directing-guide",
    "what-is-ai-cinema-ott",
    "ai-video-copyright-license",
    "first-ai-short-5-steps",
    "where-to-upload-ai-video",
    "ai-video-thumbnail-guide",
    "power-of-series",
    "ai-video-music-sound",
    "consistent-character",
    "color-grading-cinematic",
    "title-that-clicks",
    "ai-video-trends-2026",
    "creator-workflow",
    "collab-filmmaking",
    "salvage-failed-clips",
    "find-your-style",
  ];

  // CREAITE 컬렉션 slug (src/app/data/collections.ts 와 동기화)
  const COLLECTION_SLUGS = ["creaite-select", "first-watch", "night-tension", "heart-stays", "beyond-the-edge"];
  // CREAITE 스포트라이트 slug (src/app/data/spotlights.ts 와 동기화)
  const SPOTLIGHT_SLUGS = ["creaite-first-director"];

  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
    // 정보 페이지 (?info= 라우팅) — SEO 인덱싱 + 검색 유입
    { loc: `${SITE_URL}/?info=creator-revenue`, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/?info=faq`, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/?info=notices`, changefreq: "weekly", priority: "0.6" },
    { loc: `${SITE_URL}/?tab=bug-report`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/?info=terms`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/?info=privacy`, changefreq: "monthly", priority: "0.5" },
    // 매거진 (원본 아티클 — 검색 유입·색인 핵심)
    { loc: `${SITE_URL}/?info=magazine`, changefreq: "weekly", priority: "0.8" },
    ...MAGAZINE_SLUGS.map((s) => ({
      loc: `${SITE_URL}/?info=magazine&amp;article=${s}`, changefreq: "monthly", priority: "0.7",
    })),
    // 컬렉션 (에디터 큐레이션 셀렉션)
    { loc: `${SITE_URL}/?info=collections`, changefreq: "weekly", priority: "0.8" },
    ...COLLECTION_SLUGS.map((s) => ({
      loc: `${SITE_URL}/?info=collections&amp;c=${s}`, changefreq: "weekly", priority: "0.7",
    })),
    // 스포트라이트 (창작자 소개)
    { loc: `${SITE_URL}/?info=spotlight`, changefreq: "weekly", priority: "0.7" },
    ...SPOTLIGHT_SLUGS.map((s) => ({
      loc: `${SITE_URL}/?info=spotlight&amp;s=${s}`, changefreq: "monthly", priority: "0.6",
    })),
  ];

  const videoUrls = videos.map(v => ({
    loc: `${SITE_URL}/?video=${encodeURIComponent(v.id)}`,
    lastmod: v.created_at?.split("T")[0],
    changefreq: "weekly",
    priority: "0.8",
  }));

  const all = [...staticUrls, ...videoUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>${(u as any).lastmod ? `\n    <lastmod>${(u as any).lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, max-age=600",
    },
  });
}
