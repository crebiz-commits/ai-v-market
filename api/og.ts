// ════════════════════════════════════════════════════════════════════════════
// Phase 36 — 동적 OG 메타 태그 (Vercel Edge Function)
//
// 동작:
//   - 카톡/페북/트위터 등 봇이 ?video=ID 페이지 요청 시 메타 태그 주입
//   - 일반 사용자는 원본 index.html 그대로 반환 (React SPA)
//   - vercel.json rewrites 조건: query "video" 있는 / 경로만 라우팅
//
// 비용: 봇/공유 트래픽에만 호출 (영상 수와 무관)
// ════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "edge" };

const SUPABASE_PROJECT_ID = "tvbpiuwmvrccfnplhwer";
const SUPABASE_ANON_KEY = "sb_publishable_K3wmxz8uqsvUdeYXUhJv2g_g09eNNR8";

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonString(str: string): string {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/</g, "\\u003c");
}

interface Video {
  id: string;
  title: string;
  thumbnail: string | null;
  creator: string | null;
  duration: string | null;
  duration_seconds: number | null;
  description: string | null;
  age_rating: string | null;
  created_at: string;
}

async function fetchVideo(videoId: string): Promise<Video | null> {
  const url = `https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/videos?id=eq.${encodeURIComponent(videoId)}&select=id,title,thumbnail,creator,duration,duration_seconds,description,age_rating,created_at`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return null;
  const arr = (await res.json()) as Video[];
  return arr[0] || null;
}

function buildOgHtml(html: string, video: Video, pageUrl: string): string {
  const title = `${video.title} | CREAITE`;
  const creator = video.creator || "AI Creator";
  const description = (video.description || `${creator}의 AI 시네마틱 영상 — CREAITE에서 만나보세요.`).slice(0, 200);
  const thumbnail = video.thumbnail || "https://www.creaite.net/api/og-image";
  const uploadDate = (video.created_at || "").split("T")[0];

  const meta = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <meta property="og:type" content="video.other" />
    <meta property="og:site_name" content="CREAITE" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(thumbnail)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="article:author" content="${escapeHtml(creator)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(thumbnail)}" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoObject","name":"${escapeJsonString(title)}","description":"${escapeJsonString(description)}","thumbnailUrl":"${escapeJsonString(thumbnail)}","uploadDate":"${escapeJsonString(uploadDate)}","contentUrl":"${escapeJsonString(pageUrl)}","author":{"@type":"Person","name":"${escapeJsonString(creator)}"}}</script>
  `;

  // Phase 36 보강: SEO용 콘텐츠 (noscript — JS 활성 브라우저는 무시, 봇은 평가)
  const noscriptBody = `<noscript><article><h1>${escapeHtml(title)}</h1><p>크리에이터: ${escapeHtml(creator)}</p><p>${escapeHtml(description)}</p><img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(video.title || "")}" /><p><a href="https://www.creaite.net/">CREAITE — 세계 최초 AI 시네마 OTT</a></p></article></noscript>`;

  // 기존 <title>, og:* 메타 제거 후 새 메타 주입
  html = html.replace(/<title>[^<]*<\/title>/i, "");
  html = html.replace(/<meta[^>]+property="og:[^"]+"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="twitter:[^"]+"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="description"[^>]*>/gi, "");
  html = html.replace(/<link[^>]+rel="canonical"[^>]*>/gi, "");
  html = html.replace("</head>", meta + "</head>");
  // body 시작 부분(#root 앞)에 SEO 콘텐츠 주입
  html = html.replace('<div id="root"></div>', noscriptBody + '<div id="root"></div>');
  return html;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const videoId = url.searchParams.get("video");

  // 원본 index.html 가져오기
  const origin = url.origin;
  const indexRes = await fetch(`${origin}/index.html`);
  if (!indexRes.ok) {
    return new Response("Not found", { status: 404 });
  }
  const indexHtml = await indexRes.text();

  // video id 없으면 원본 그대로
  if (!videoId) {
    return new Response(indexHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // 영상 정보 fetch + 메타 주입 (User-Agent 무관 — 검증 도구도 작동)
  // React SPA는 hydration이 head 메타에 영향 없음 → 일반 사용자에도 안전
  const video = await fetchVideo(videoId);
  if (!video) {
    return new Response(indexHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const ogHtml = buildOgHtml(indexHtml, video, url.href);
  return new Response(ogHtml, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, s-maxage=300, max-age=60", // CDN 5분, 브라우저 1분
    },
  });
}
