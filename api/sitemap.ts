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

  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
    // 정보 페이지 (?info= 라우팅) — SEO 인덱싱 + 검색 유입
    { loc: `${SITE_URL}/?info=creator-revenue`, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/?info=terms`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/?info=privacy`, changefreq: "monthly", priority: "0.5" },
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
