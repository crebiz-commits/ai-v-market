// ════════════════════════════════════════════════════════════════════════════
// Bunny 썸네일 공개 프록시 (Vercel Edge) — Googlebot/소셜 크롤러용
//   배경: 영상 썸네일은 Bunny CDN(vz-...b-cdn.net) 에 있고 핫링크 보호로 referer 없는 요청은
//         403(Googlebot 포함) → Google 동영상 색인에서 "썸네일에 연결할 수 없음". 영상 파일 보호는
//         유지하되 썸네일만 same-origin 공개 URL 로 노출한다.
//   /api/thumb?v=<videoId> → https://<BUNNY_HOST>/<videoId>/thumbnail.jpg 를 referer 붙여 프록시.
//   → VideoObject(JSON-LD)·비디오 사이트맵의 thumbnail 이 이 URL 을 쓰면 구글이 정상 취득.
//   영상(.m3u8/.mp4)은 프록시하지 않으므로 Bunny 핫링크 보호 그대로.
// ════════════════════════════════════════════════════════════════════════════

export const config = { runtime: "edge" };

const BUNNY_HOST = "vz-6e85411f-96a.b-cdn.net"; // 라이브러리 creaite_market pull-zone (src/app/utils/bunnyHost.ts 정본과 동일)

export default async function handler(req: Request): Promise<Response> {
  const v = (new URL(req.url).searchParams.get("v") || "").trim();
  // videoId(uuid) 안전 검증 — 경로 주입/오용 방지
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(v)) {
    return new Response("bad id", { status: 400 });
  }
  const upstream = `https://${BUNNY_HOST}/${v}/thumbnail.jpg`;
  try {
    const r = await fetch(upstream, { headers: { Referer: "https://www.creaite.net/" } });
    if (!r.ok) return new Response("not found", { status: 404 });
    return new Response(r.body, {
      status: 200,
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/jpeg",
        // 구글/CDN 캐시로 Edge 함수 반복 호출 최소화
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new Response("proxy error", { status: 502 });
  }
}
