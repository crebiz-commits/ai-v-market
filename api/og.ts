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
// Bunny Stream 라이브러리 ID — videos.id 가 곧 Bunny GUID 라 임베드 플레이어 URL 구성에 사용
//   (sitemap.ts / ProductDetail.tsx 와 동일 형식).
const BUNNY_LIBRARY_ID = "615810";
const SITE = "https://www.creaite.net";

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  // 공개+미숨김만 (sitemap.ts 와 동일 필터) — 필터 없이는 숨김(재검수·모더레이션)·비공개
  //   영상의 제목·설명·썸네일이 /?video=<id> 직접 접근으로 유출됨(videos.is_hidden 은
  //   RLS 미강제라 명시 필터 필수). 미해당 영상은 메타 주입 없이 원본 index.html 반환.
  const guard = `&or=(visibility.eq.public,visibility.is.null)&is_hidden=not.is.true`;
  const url = `https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/videos?id=eq.${encodeURIComponent(videoId)}${guard}&select=id,title,thumbnail,creator,duration,duration_seconds,description,age_rating,created_at`;
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
  // 썸네일: Bunny(b-cdn 핫링크 보호)면 same-origin 프록시(/api/thumb)로 → Googlebot·소셜봇 취득 가능.
  //   (원본 b-cdn URL 을 그대로 쓰면 GSC "썸네일에 연결할 수 없음" + 공유 프리뷰 깨짐.)
  const rawThumb = video.thumbnail || "";
  const thumbnail = rawThumb.includes("b-cdn.net")
    ? `${SITE}/api/thumb?v=${encodeURIComponent(video.id)}`
    : (rawThumb || `${SITE}/api/og-image`);
  // 동영상 임베드 — videos.id=Bunny GUID → 실제 플레이어(iframe). 페이지 URL(자기 자신)을
  //   embedUrl 로 쓰면 GSC "동영상이 보기 페이지에 없음"으로 색인 실패(sitemap player_loc 과 동일 이슈).
  const isBunnyVideo = /^[0-9a-f-]{36}$/i.test(video.id);
  const embedUrl = isBunnyVideo
    ? `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${video.id}`
    : pageUrl;
  // og:video 메타 + noscript iframe — VideoObject 만으론 "동영상이 보기 페이지에 없음"이 남는다.
  //   SPA 라 봇이 JS 미실행 시 페이지에 플레이어가 없어 Google 이 실제 동영상을 못 찾음 →
  //   봇이 JS 없이도 플레이어를 발견하도록 og:video 와 <noscript> 안 iframe 을 심는다(사용자엔 무영향).
  const ogVideoMeta = isBunnyVideo ? `
    <meta property="og:video" content="${escapeHtml(embedUrl)}" />
    <meta property="og:video:secure_url" content="${escapeHtml(embedUrl)}" />
    <meta property="og:video:type" content="text/html" />
    <meta property="og:video:width" content="1280" />
    <meta property="og:video:height" content="720" />` : "";
  const noscriptPlayer = isBunnyVideo
    ? `<iframe src="${escapeHtml(embedUrl)}" width="1280" height="720" style="border:0;max-width:100%" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowfullscreen title="${escapeHtml(video.title || "")}"></iframe>`
    : "";

  // GSC(2026-06-11): uploadDate 는 시간대 포함 완전한 ISO 8601 이어야 함.
  // 날짜만("2026-05-30") → '시간대 누락' 경고, 빈 문자열 → '값 잘못됨' 경고.
  // created_at 이 없거나 파싱 불가면 필드 자체를 생략 (uploadDate 는 권장 속성).
  let uploadDate: string | null = null;
  if (video.created_at) {
    const d = new Date(video.created_at);
    if (!isNaN(d.getTime())) uploadDate = d.toISOString();
  }
  const secs = video.duration_seconds || 0;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: title,
    description,
    thumbnailUrl: thumbnail,
    embedUrl,
    author: { "@type": "Person", name: creator },
  };
  if (uploadDate) ld.uploadDate = uploadDate;
  if (secs > 0) ld.duration = `PT${Math.floor(secs / 60)}M${secs % 60}S`;
  const ldJson = JSON.stringify(ld).replace(/</g, "\\u003c");

  const meta = `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <meta property="og:type" content="video.other" />
    <meta property="og:site_name" content="CREAITE" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(thumbnail)}" />${ogVideoMeta}
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="article:author" content="${escapeHtml(creator)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(thumbnail)}" />
    <script type="application/ld+json">${ldJson}</script>
  `;

  // Phase 36 보강: SEO용 콘텐츠 (noscript — JS 활성 브라우저는 무시, 봇은 평가)
  const noscriptBody = `<noscript><article><h1>${escapeHtml(title)}</h1><p>크리에이터: ${escapeHtml(creator)}</p><p>${escapeHtml(description)}</p>${noscriptPlayer}<img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(video.title || "")}" /><p><a href="https://www.creaite.net/">CREAITE — 세계 최초 AI 시네마 OTT</a></p></article></noscript>`;

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
