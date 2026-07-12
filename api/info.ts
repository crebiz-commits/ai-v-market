// ════════════════════════════════════════════════════════════════════════════
// 정보 페이지 SSR 프리렌더 (Vercel Edge Function)
//
// 동작:
//   - 봇/공유/검색 크롤러가 ?info= 페이지 요청 시, 실제 콘텐츠(제목·본문 HTML)를
//     주입한 완성 HTML 을 반환 → SPA 라 빈 #root 로만 보이던 것 해소.
//   - 일반 사용자도 안전: head 메타 + <noscript> 본문만 추가하고 #root 는 그대로 →
//     React 앱이 정상 hydrate(og.ts 와 동일 검증된 방식).
//
// 대상: 매거진 아티클/목록, 스포트라이트, (기타 info 는 메타만).
//   AdSense "가치 있는 콘텐츠" 확보 + 매거진 검색 색인/유입.
// ════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "edge" };

import { getArticle, MAGAZINE_ARTICLES } from "../src/app/data/magazineArticles";
import { getSpotlight, SPOTLIGHTS } from "../src/app/data/spotlights";

const SITE = "https://www.creaite.net";

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 본문 HTML 에서 태그를 제거해 메타 description 용 평문 추출(앞 200자)
function toPlain(html: string, max = 200): string {
  const text = String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

interface InfoPage {
  title: string;         // <title> / og:title (사이트명 접미 제외한 순수 제목)
  description: string;   // 메타 설명(평문)
  canonical: string;
  bodyHtml: string;      // <noscript> 안에 넣을 본문 HTML
  datePublished?: string; // Article JSON-LD 용(YYYY-MM-DD)
  isArticle?: boolean;   // Article 구조화데이터 emit 여부
}

// 기타 info 페이지(about/faq 등) — 본문 SSR 은 없지만 최소 메타/소개 제공
const STATIC_INFO: Record<string, { title: string; description: string }> = {
  about: { title: "CREAITE 소개", description: "CREAITE는 세계 최초 AI 시네마 OTT이자 1인 감독을 위한 배급사입니다. AI로 만든 영화가 관객을 만나고 가치를 인정받는 무대." },
  faq: { title: "자주 묻는 질문", description: "CREAITE 이용, 크리에이터 수익, 라이선스, 구독에 대한 자주 묻는 질문과 답변." },
  "creator-revenue": { title: "크리에이터 수익 안내", description: "CREAITE에서 AI 영상 창작자가 광고·라이선스 판매·구독으로 수익을 얻는 세 갈래 구조 안내." },
  notices: { title: "공지사항", description: "CREAITE 서비스 공지사항." },
  terms: { title: "이용약관", description: "CREAITE 이용약관." },
  privacy: { title: "개인정보처리방침", description: "CREAITE 개인정보처리방침." },
  collections: { title: "CREAITE 컬렉션", description: "에디터가 큐레이션한 AI 시네마 셀렉션 — 입문작부터 장르별 추천까지." },
  spotlight: { title: "CREAITE 스포트라이트", description: "주목할 AI 영상 창작자를 프로필과 작품으로 조명하는 편집 코너." },
  magazine: { title: "CREAITE 매거진", description: "AI 영상 제작·크리에이터 수익·플랫폼 인사이트에 대한 오리지널 읽을거리." },
};

// 매거진/스포트라이트 목록의 링크 리스트(HTML) — 크롤러가 개별 글로 타고 들어가도록
function magazineListHtml(): string {
  const items = MAGAZINE_ARTICLES.map((a) =>
    `<li><a href="${SITE}/?info=magazine&article=${escapeHtml(a.slug)}">${escapeHtml(a.title.ko)}</a> — ${escapeHtml(a.excerpt.ko)}</li>`
  ).join("");
  return `<p>AI 영상 제작·크리에이터 수익·플랫폼 인사이트에 대한 CREAITE의 오리지널 아티클입니다.</p><ul>${items}</ul>`;
}
function spotlightListHtml(): string {
  const items = SPOTLIGHTS.map((s) =>
    `<li><a href="${SITE}/?info=spotlight&s=${escapeHtml(s.slug)}">${escapeHtml(s.title)}</a> — ${escapeHtml(s.tagline)}</li>`
  ).join("");
  return `<p>주목할 AI 영상 창작자를 조명하는 편집 코너입니다.</p><ul>${items}</ul>`;
}

function resolvePage(info: string, params: URLSearchParams): InfoPage | null {
  if (info === "magazine") {
    const slug = params.get("article");
    if (slug) {
      const a = getArticle(slug);
      if (!a) return null;
      return {
        title: a.title.ko,
        description: toPlain(a.excerpt.ko),
        canonical: `${SITE}/?info=magazine&article=${slug}`,
        bodyHtml: a.body.ko,
        datePublished: a.date,
        isArticle: true,
      };
    }
    return { title: STATIC_INFO.magazine.title, description: STATIC_INFO.magazine.description, canonical: `${SITE}/?info=magazine`, bodyHtml: magazineListHtml() };
  }
  if (info === "spotlight") {
    const slug = params.get("s");
    if (slug) {
      const s = getSpotlight(slug);
      if (!s) return null;
      return {
        title: s.title,
        description: toPlain(s.tagline + " " + s.intro),
        canonical: `${SITE}/?info=spotlight&s=${slug}`,
        bodyHtml: `<p><em>${escapeHtml(s.quote)}</em></p>${s.intro}`,
        datePublished: s.date,
        isArticle: true,
      };
    }
    return { title: STATIC_INFO.spotlight.title, description: STATIC_INFO.spotlight.description, canonical: `${SITE}/?info=spotlight`, bodyHtml: spotlightListHtml() };
  }
  // 기타 정보 페이지 — 메타만(본문은 짧은 소개)
  const s = STATIC_INFO[info];
  if (s) return { title: s.title, description: s.description, canonical: `${SITE}/?info=${info}`, bodyHtml: `<p>${escapeHtml(s.description)}</p>` };
  return null;
}

function buildInfoHtml(html: string, page: InfoPage): string {
  const fullTitle = `${page.title} | CREAITE`;
  const image = `${SITE}/api/og-image`;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": page.isArticle ? "Article" : "WebPage",
    headline: page.title,
    description: page.description,
    url: page.canonical,
    mainEntityOfPage: page.canonical,
    publisher: { "@type": "Organization", name: "CREAITE", url: SITE },
  };
  if (page.isArticle) {
    ld.author = { "@type": "Organization", name: "CREAITE" };
    if (page.datePublished) ld.datePublished = page.datePublished;
  }
  const ldJson = JSON.stringify(ld).replace(/</g, "\\u003c");

  const meta = `
    <title>${escapeHtml(fullTitle)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <link rel="canonical" href="${escapeHtml(page.canonical)}" />
    <meta property="og:type" content="${page.isArticle ? "article" : "website"}" />
    <meta property="og:site_name" content="CREAITE" />
    <meta property="og:title" content="${escapeHtml(fullTitle)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:url" content="${escapeHtml(page.canonical)}" />
    <meta property="og:locale" content="ko_KR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(fullTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <script type="application/ld+json">${ldJson}</script>
  `;

  // SEO 본문(noscript — JS 브라우저는 무시, 봇은 평가). 제목 h1 + 본문 HTML.
  const noscriptBody = `<noscript><main><article><h1>${escapeHtml(page.title)}</h1>${page.bodyHtml}<hr /><p><a href="${SITE}/">CREAITE — 세계 최초 AI 시네마 OTT</a></p></article></main></noscript>`;

  html = html.replace(/<title>[^<]*<\/title>/i, "");
  html = html.replace(/<meta[^>]+property="og:[^"]+"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="twitter:[^"]+"[^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name="description"[^>]*>/gi, "");
  html = html.replace(/<link[^>]+rel="canonical"[^>]*>/gi, "");
  html = html.replace("</head>", meta + "</head>");
  html = html.replace('<div id="root"></div>', noscriptBody + '<div id="root"></div>');
  return html;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const info = url.searchParams.get("info");

  const origin = url.origin;
  const indexRes = await fetch(`${origin}/index.html`);
  if (!indexRes.ok) return new Response("Not found", { status: 404 });
  const indexHtml = await indexRes.text();

  if (!info) {
    return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const page = resolvePage(info, url.searchParams);
  if (!page) {
    // 알 수 없는 info — 원본 SPA 그대로
    return new Response(indexHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const out = buildInfoHtml(indexHtml, page);
  return new Response(out, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, s-maxage=600, max-age=120", // CDN 10분, 브라우저 2분
    },
  });
}
