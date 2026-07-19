// ════════════════════════════════════════════════════════════════════════════
// Phase 36 — 동적 Sitemap XML (Vercel Edge Function)
// 구글/네이버에 모든 공개 영상 URL 제공 → 인덱싱 가속
// 캐시: 1시간 (영상이 자주 추가되면 짧게)
// ════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "edge" };

const SUPABASE_PROJECT_ID = "tvbpiuwmvrccfnplhwer";
const SUPABASE_ANON_KEY = "sb_publishable_K3wmxz8uqsvUdeYXUhJv2g_g09eNNR8";
const SITE_URL = "https://www.creaite.net";
// Bunny Stream 라이브러리 ID — videos.id 가 곧 Bunny video GUID 라, 임베드 플레이어 URL 구성에 사용.
//   (ProductDetail.tsx 의 embed URL 과 동일 형식: iframe.mediadelivery.net/embed/{lib}/{guid})
const BUNNY_LIBRARY_ID = "615810";

// XML 텍스트 이스케이프 (video:title/description 안전)
const esc = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));

interface VideoLite {
  id: string;
  created_at: string;
  title: string | null;
  thumbnail: string | null;
}

async function fetchAllVideos(): Promise<VideoLite[]> {
  // 공개 + 숨김 아님 영상만 (최대 5만 건 — Vercel Edge 메모리 한도 고려)
  const url = `https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/videos?select=id,created_at,title,thumbnail&or=(visibility.eq.public,visibility.is.null)&is_hidden=is.false&order=created_at.desc&limit=50000`;
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
  const COLLECTION_SLUGS = ["creaite-select", "first-watch", "quick-punch", "night-tension", "heart-stays", "beyond-the-edge"];
  // CREAITE 스포트라이트 slug (src/app/data/spotlights.ts 와 동기화)
  const SPOTLIGHT_SLUGS = ["creaite-first-director"];

  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
    // 정보 페이지 (?info= 라우팅) — SEO 인덱싱 + 검색 유입
    { loc: `${SITE_URL}/?info=creator-revenue`, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/?info=about`, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/?info=faq`, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/?info=notices`, changefreq: "weekly", priority: "0.6" },
    // ?tab=bug-report 제거(2026-07-18): index.html 서빙이라 JS canonical 에만 의존(구글 미honor)
    //   → 홈의 "대체 페이지"로 색인 제외되던 폼 페이지. SEO 가치 없어 sitemap 에서 뺌.
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

  const videoUrls = videos.map(v => {
    const loc = `${SITE_URL}/?video=${encodeURIComponent(v.id)}`;
    const title = (v.title || "CREAITE AI 영상").slice(0, 100);
    // 썸네일: Bunny(핫링크 보호)면 same-origin 프록시(/api/thumb)로 → Googlebot 취득 가능. 외부면 그대로.
    const rawThumb = v.thumbnail || "";
    const thumbLoc = rawThumb.includes("b-cdn.net")
      ? `${SITE_URL}/api/thumb?v=${encodeURIComponent(v.id)}`
      : rawThumb;
    // 비디오 사이트맵 마크업 — thumbnail_loc 필수(썸네일 있을 때만) + player_loc 은 실제 Bunny
    //   임베드 플레이어여야 함(방문 페이지 loc 과 같으면 Google 이 거부 — GSC "content_loc/player_loc =loc" 오류).
    //   videos.id 가 Bunny GUID(UUID)일 때만 player_loc emit → 임베드 URL 구성. 아니면 video 블록 생략.
    const isGuid = /^[0-9a-f-]{36}$/i.test(v.id);
    const playerLoc = isGuid
      ? `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${v.id}?autoplay=false&loop=false&muted=false&preload=true&responsive=true`
      : "";
    const videoXml = (thumbLoc && playerLoc)
      ? `\n    <video:video>\n      <video:thumbnail_loc>${esc(thumbLoc)}</video:thumbnail_loc>\n      <video:title>${esc(title)}</video:title>\n      <video:description>${esc(title)} — CREAITE AI 시네마</video:description>\n      <video:player_loc>${esc(playerLoc)}</video:player_loc>\n    </video:video>`
      : "";
    return { loc, lastmod: v.created_at?.split("T")[0], changefreq: "weekly", priority: "0.8", videoXml };
  });

  const all = [...staticUrls, ...videoUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>${(u as any).lastmod ? `\n    <lastmod>${(u as any).lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${(u as any).videoXml || ""}
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, max-age=600",
    },
  });
}
