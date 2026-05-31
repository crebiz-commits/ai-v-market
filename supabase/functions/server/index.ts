import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Supabase Edge Function 함수 이름이 path prefix로 포함되므로 basePath 설정
const app = new Hono().basePath('/server');

// ── 웹 푸시 발송 헬퍼 (구독 기기에 푸시, 만료 구독 자동 정리) ─────────────────
async function sendWebPushToUser(supabase: any, userId: string, title: string, body: string, url = "/") {
  try {
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidPublic || !vapidPrivate) return;
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subs || !subs.length) return;
    webpush.setVapidDetails("mailto:support@creaite.net", vapidPublic, vapidPrivate);
    const payload = JSON.stringify({ title, body, url });
    await Promise.all(
      subs.map((s: any) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          .catch(async (e: any) => {
            // 만료/해지된 구독(404/410) 정리
            if (e?.statusCode === 404 || e?.statusCode === 410) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            }
          })
      )
    );
  } catch (e) {
    console.warn("[push] 발송 실패:", e);
  }
}

// ── 여러 구독에 일괄 웹 푸시 (공지 발송용, 만료 구독 자동 정리) ───────────────
async function sendWebPushToSubs(
  supabase: any,
  subs: Array<{ endpoint: string; p256dh: string; auth: string }>,
  title: string,
  body: string,
  url = "/",
): Promise<number> {
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!vapidPublic || !vapidPrivate || !subs?.length) return 0;
  webpush.setVapidDetails("mailto:support@creaite.net", vapidPublic, vapidPrivate);
  const payload = JSON.stringify({ title, body, url });
  let ok = 0;
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        .then(() => { ok++; })
        .catch(async (e: any) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        })
    )
  );
  return ok;
}

// Supabase 클라이언트 생성 함수
const getSupabaseClient = (useServiceRole = false) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const key = useServiceRole 
    ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! 
    : Deno.env.get('SUPABASE_ANON_KEY')!;
  return createClient(supabaseUrl, key);
};

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
// Google IMA SDK (imasdk.googleapis.com)가 credentials: 'include'로 호출하므로
// origin 함수로 요청 origin을 echo + credentials: true 설정 필요
app.use(
  "/*",
  cors({
    origin: (origin: string) => origin || "*",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// ============================================
// 인증 관련 엔드포인트
// ============================================

// 회원가입
app.post("/auth/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "이메일과 비밀번호는 필수입니다." }, 400);
    }

    const supabase = getSupabaseClient(true); // Service role key 사용

    // 사용자 생성
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || email.split('@')[0] },
      // 테스트를 위해 이메일 확인 자동 완료 (실제 서비스에서는 제거 필요)
      email_confirm: true
    });

    if (error) {
      console.error('회원가입 에러:', error);
      return c.json({ error: error.message }, 400);
    }

    return c.json({ 
      success: true, 
      message: "회원가입이 완료되었습니다.",
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata.name,
        email_confirmed: true // 자동 확인 모드
      }
    });
  } catch (error) {
    console.error('회원가입 처리 중 에러:', error);
    return c.json({ error: "회원가입 처리 중 오류가 발생했습니다." }, 500);
  }
});

// 로그인
app.post("/auth/signin", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "이메일과 비밀번호는 필수입니다." }, 400);
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('로그인 에러:', error);
      return c.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, 401);
    }

    return c.json({ 
      success: true,
      session: data.session,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || data.user.email?.split('@')[0]
      }
    });
  } catch (error) {
    console.error('로그인 처리 중 에러:', error);
    return c.json({ error: "로그인 처리 중 오류가 발생했습니다." }, 500);
  }
});

// 사용자 정보 조회 (인증 필요)
app.get("/auth/user", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    return c.json({ 
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0],
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('사용자 정보 조회 중 에러:', error);
    return c.json({ error: "사용자 정보 조회 중 오류가 발생했습니다." }, 500);
  }
});

// ============================================
// Bunny.net 비디오 업로드 관련 엔드포인트
// ============================================

// Bunny.net에 비디오 생성 및 업로드 URL 생성
app.post("/videos/create-upload", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    // 사용자 인증 확인
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      console.error('인증 실패 상세:', authError?.message || '사용자 정보를 찾을 수 없음');
      return c.json({ error: `인증에 실패했습니다: ${authError?.message || 'Unknown error'}` }, 401);
    }

    const { title } = await c.req.json();

    const libraryId = Deno.env.get('BUNNY_LIBRARY_ID');
    const apiKey = Deno.env.get('BUNNY_API_KEY');

    console.log('Bunny credentials check:', {
      hasLibraryId: !!libraryId,
      hasApiKey: !!apiKey,
      libraryId: libraryId ? `${libraryId.substring(0, 4)}...` : 'missing',
    });

    if (!libraryId || !apiKey) {
      console.error('Bunny.net credentials missing - libraryId:', !!libraryId, 'apiKey:', !!apiKey);
      return c.json({ error: "Bunny.net 설정이 완료되지 않았습니다. BUNNY_LIBRARY_ID와 BUNNY_API_KEY를 확인해주세요." }, 500);
    }

    // Bunny.net Stream API로 비디오 생성
    console.log('Creating video with title:', title);
    const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: 'POST',
      headers: {
        'AccessKey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title || 'Untitled Video',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bunny.net video creation error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return c.json({ error: `Bunny.net 비디오 생성 실패: ${response.status} - ${errorText}` }, response.status);
    }

    const videoData = await response.json();
    
    console.log('Bunny.net video created successfully:', videoData.guid);

    return c.json({
      videoId: videoData.guid,
      libraryId: libraryId,
      title: videoData.title,
      apiKey: apiKey, // Client side upload needs this
    });
  } catch (error) {
    console.error('비디오 생성 중 에러:', error);
    return c.json({ error: `비디오 생성 중 오류가 발생했습니다: ${error.message}` }, 500);
  }
});

// 비디오 메타데이터 저장
app.post("/videos/save-metadata", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    // 사용자 인증 확인
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    const metadata = await c.req.json();
    const videoId = metadata.videoId;

    if (!videoId) {
      return c.json({ error: "videoId가 필요합니다." }, 400);
    }

    const supabaseAdmin = getSupabaseClient(true); // Service role for DB operations

    // 1. KV 스토어에 메타데이터 저장 (하위 호환성 유지)
    const key = `video:${videoId}`;
    const videoData = {
      ...metadata,
      userId: user.id,
      userEmail: user.email,
      createdAt: new Date().toISOString(),
      status: metadata.status || 'ready', 
    };
    await kv.set(key, videoData);

    // 2. Supabase DB 'videos' 테이블에 저장 (확장 컬럼 포함)
    // 새 컬럼은 supabase/videos_extended_columns.sql 마이그레이션 적용 후 활성화됨
    const productionYearNum = metadata.productionYear ? parseInt(metadata.productionYear) : null;
    const highlightStartNum = metadata.highlightStart != null ? parseFloat(metadata.highlightStart) : 0;
    const highlightEndNum = metadata.highlightEnd != null ? parseFloat(metadata.highlightEnd) : 15;

    const { error: dbError } = await supabaseAdmin
      .from('videos')
      .upsert({
        id: videoId,
        title: metadata.title || 'Untitled',
        description: metadata.description || '',
        creator: user.user_metadata?.name || user.email?.split('@')[0],
        creator_id: user.id,
        thumbnail: metadata.thumbnailUrl || '',
        video_url: metadata.hlsUrl || '',
        duration: metadata.duration || '0:00',
        views: "0",
        likes: 0,
        tags: (metadata.tags || "").split(',').map((t: string) => t.trim()).filter((t: string) => t !== ""),
        // All-in-One 단일가: price_standard 만 사용. price_commercial/exclusive 는
        // stale 컬럼(어디서도 안 읽힘) — NOT NULL 안전을 위해 standard 와 동일값 유지. schema cleanup 시 DROP 예정.
        price_standard: parseInt(metadata.standardPrice || "0"),
        price_commercial: parseInt(metadata.standardPrice || "0"),
        price_exclusive: parseInt(metadata.standardPrice || "0"),
        ai_tool: metadata.aiTool || '',
        category: metadata.category || '',
        genre: metadata.genre || '',
        age_rating: metadata.age_rating || 'all',  // Phase 31.1 — 시청 등급 (Upload 필수 입력)
        prompt: metadata.prompt || '',
        status: metadata.status || 'ready',
        resolution: metadata.resolution || '',
        // ━━━ 확장 컬럼 ━━━
        // AI 제작 증빙
        ai_model_version: metadata.aiModelVersion || '',
        seed: metadata.seed || '',
        // 시네마 메타데이터
        director: metadata.director || '',
        writer: metadata.writer || '',
        composer: metadata.composer || '',
        cast_credits: metadata.cast || '',
        production_year: productionYearNum,
        language: metadata.language || '',
        subtitle_language: metadata.subtitleLanguage || '',
        // 공개 설정
        visibility: ['public', 'unlisted', 'private'].includes(metadata.visibility) ? metadata.visibility : 'public',
        // 하이라이트 구간
        highlight_start: highlightStartNum,
        highlight_end: highlightEndNum,
        // Phase 28: Sponsorship
        sponsor_brand: metadata.sponsorBrand || null,
        sponsor_logo_url: metadata.sponsorLogoUrl || null,
        sponsor_disclosure: metadata.sponsorDisclosure || null,
        sponsor_link_url: metadata.sponsorLinkUrl || null,
      });

    if (dbError) {
      console.error('DB 저장 에러:', dbError);
      // KV는 성공했으므로 일단 진행할 수도 있지만, 정석은 에러 반환
      return c.json({ error: `DB 저장 실패: ${dbError.message}` }, 500);
    }

    // 사용자별 비디오 목록에도 추가 (KV)
    const userVideosKey = `user:${user.id}:videos`;
    const userVideos = await kv.get(userVideosKey) || [];
    if (!userVideos.includes(videoId)) {
      userVideos.push(videoId);
      await kv.set(userVideosKey, userVideos);
    }

    console.log('Video metadata saved to KV and DB:', videoId);

    return c.json({ 
      success: true,
      videoId,
      message: "비디오 메타데이터가 성공적으로 저장되었습니다."
    });
  } catch (error) {
    console.error('메타데이터 저장 중 에러:', error);
    return c.json({ error: "메타데이터 저장 중 오류가 발생했습니다." }, 500);
  }
});

// 비디오 상태 업데이트
app.put("/videos/:videoId/status", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    // 사용자 인증 확인
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    const videoId = c.req.param('videoId');
    const { status } = await c.req.json();

    const key = `video:${videoId}`;
    const videoData = await kv.get(key);

    if (!videoData) {
      return c.json({ error: "비디오를 찾을 수 없습니다." }, 404);
    }

    // 소유자 확인
    if (videoData.userId !== user.id) {
      return c.json({ error: "권한이 없습니다." }, 403);
    }

    videoData.status = status;
    videoData.updatedAt = new Date().toISOString();
    await kv.set(key, videoData);

    console.log('Video status updated:', videoId, status);

    return c.json({ success: true, videoId, status });
  } catch (error) {
    console.error('상태 업데이트 중 에러:', error);
    return c.json({ error: "상태 업데이트 중 오류가 발생했습니다." }, 500);
  }
});

// 사용자의 비디오 목록 조회
app.get("/videos/my-videos", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    // 사용자 인증 확인
    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    const userVideosKey = `user:${user.id}:videos`;
    const videoIds = await kv.get(userVideosKey) || [];

    const videos = [];
    for (const videoId of videoIds) {
      const videoData = await kv.get(`video:${videoId}`);
      if (videoData) {
        videos.push(videoData);
      }
    }

    return c.json({ videos });
  } catch (error) {
    console.error('비디오 목록 조회 중 에러:', error);
    return c.json({ error: "비디오 목록 조회 중 오류가 발생했습니다." }, 500);
  }
});

// ============================================
// 비디오 광고 (House Ads MVP — Phase 2)
// ============================================

// VAST 2.0 XML 응답
// Bunny Player의 vastTagUrl 파라미터에 이 엔드포인트 URL을 넘기면
// pre-roll 광고로 자동 재생됨
//
// 경로 설계 (2026-05-26): Bunny vastTagUrl 가 query string 을 보존하지 못해
//   /vast-tag/:sourceVideoId (path parameter) 가 정식 경로.
//   /vast-tag?source_video_id=... (query) 는 legacy 호환용 — RPC가 빈 source_video_id 를
//   받으면 보수적으로 광고 차단.
//
// 동작:
//   1. ad_type='video_preroll' && is_active=true 광고 중 가중치 랜덤 선택
//   2. VAST 2.0 표준 XML 응답
//   3. impression/click 트래킹 URL 포함
// VAST/IMA SDK CORS 헤더 빌더
// credentials='include' 요청은 wildcard '*'가 아닌 정확한 origin이 필요함
function vastCorsHeaders(c: any) {
  const origin = c.req.header('origin') || c.req.header('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Vary': 'Origin',
  };
}

async function handleVastTag(c: any, sourceVideoId: string) {
  try {
    const supabaseAdmin = getSupabaseClient(true);

    // 가중치 기반 랜덤 광고 선택
    // source_video_id 전달 시 RPC가 영상 길이(< min_duration_for_preroll_seconds) 검사 후
    // 1분 미만이면 빈 결과 반환 → 아래 fallback이 빈 VAST 응답 처리 (콘텐츠 정책 v2)
    const { data: ads, error: pickError } = await supabaseAdmin.rpc(
      'pick_random_video_preroll',
      { p_source_video_id: sourceVideoId || null }
    );

    if (pickError || !ads || ads.length === 0) {
      // 광고 없음 → 빈 VAST 응답 (Bunny가 광고 스킵)
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<VAST version="2.0"></VAST>`,
        {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            ...vastCorsHeaders(c),
          }
        }
      );
    }

    const ad = ads[0];

    // 트래킹 URL 베이스 — SUPABASE_URL 환경변수로 정확한 HTTPS 공개 경로 빌드
    // c.req.url은 Hono 내부 경로(/server/...)를 반환해서 /functions/v1/ 누락 + http 스킴
    // → Mixed Content 차단으로 IMA SDK가 VAST 거부하던 문제 수정
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const trackBase = `${supabaseUrl}/functions/v1/server/vast-track`;
    const trackParams = new URLSearchParams({
      ad_id: ad.id,
      source_video_id: sourceVideoId,
    });

    // VAST 2.0 XML 생성
    const vastXml = `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="2.0">
  <Ad id="${ad.id}">
    <InLine>
      <AdSystem>CREAITE House Ads</AdSystem>
      <AdTitle><![CDATA[${ad.title || 'Advertisement'}]]></AdTitle>
      <Description><![CDATA[${ad.advertiser || ''}]]></Description>
      <Impression><![CDATA[${trackBase}?${trackParams}&event=impression]]></Impression>
      <Creatives>
        <Creative id="${ad.id}-creative">
          <Linear skipoffset="00:00:${String(ad.skip_offset || 5).padStart(2, '0')}">
            <Duration>00:00:${String(ad.max_duration || 30).padStart(2, '0')}</Duration>
            <TrackingEvents>
              <Tracking event="start"><![CDATA[${trackBase}?${trackParams}&event=start]]></Tracking>
              <Tracking event="firstQuartile"><![CDATA[${trackBase}?${trackParams}&event=firstQuartile]]></Tracking>
              <Tracking event="midpoint"><![CDATA[${trackBase}?${trackParams}&event=midpoint]]></Tracking>
              <Tracking event="thirdQuartile"><![CDATA[${trackBase}?${trackParams}&event=thirdQuartile]]></Tracking>
              <Tracking event="complete"><![CDATA[${trackBase}?${trackParams}&event=complete]]></Tracking>
              <Tracking event="skip"><![CDATA[${trackBase}?${trackParams}&event=skip]]></Tracking>
            </TrackingEvents>
            <VideoClicks>
              <ClickThrough><![CDATA[${ad.link_url || '#'}]]></ClickThrough>
              <ClickTracking><![CDATA[${trackBase}?${trackParams}&event=click]]></ClickTracking>
            </VideoClicks>
            <MediaFiles>
              ${ad.video_url && ad.video_url.includes('/playlist.m3u8') ? `
              <MediaFile delivery="progressive" type="video/mp4" width="1280" height="720">
                <![CDATA[${ad.video_url.replace('/playlist.m3u8', '/play_720p.mp4')}]]>
              </MediaFile>` : ''}
              <MediaFile delivery="streaming" type="application/x-mpegURL" width="1920" height="1080">
                <![CDATA[${ad.video_url}]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;

    return new Response(vastXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-cache',
        ...vastCorsHeaders(c),
      }
    });
  } catch (error: any) {
    console.error('VAST 생성 에러:', error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<VAST version="2.0"></VAST>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          ...vastCorsHeaders(c),
        }
      }
    );
  }
}

// 정식 경로 — path parameter (Bunny vastTagUrl 의 query string 누락 우회)
app.get("/vast-tag/:sourceVideoId", (c: any) => {
  return handleVastTag(c, c.req.param('sourceVideoId') || '');
});

// Legacy 경로 — query string. source_video_id 가 비어 도착하면 RPC가 광고 차단.
app.get("/vast-tag", (c: any) => {
  return handleVastTag(c, c.req.query('source_video_id') || '');
});

// CORS preflight (OPTIONS) for VAST endpoints
app.options("/vast-tag", (c: any) => {
  return new Response(null, { status: 204, headers: vastCorsHeaders(c) });
});

app.options("/vast-tag/:sourceVideoId", (c: any) => {
  return new Response(null, { status: 204, headers: vastCorsHeaders(c) });
});

app.options("/vast-track", (c) => {
  return new Response(null, { status: 204, headers: vastCorsHeaders(c) });
});

// VAST 트래킹 픽셀 — 1x1 투명 GIF 응답
// Bunny Player가 각 이벤트 시점에 GET 요청으로 호출
app.get("/vast-track", async (c) => {
  try {
    const adId = c.req.query('ad_id');
    const event = c.req.query('event');
    const sourceVideoId = c.req.query('source_video_id') || null;

    if (adId && event) {
      const supabaseAdmin = getSupabaseClient(true);
      const userAgent = c.req.header('user-agent') || null;
      const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null;

      await supabaseAdmin.rpc('track_video_ad_event', {
        p_ad_id: adId,
        p_event_type: event,
        p_source_video_id: sourceVideoId,
        p_viewer_user_id: null, // VAST 트래킹은 인증 없이 호출됨
        p_user_agent: userAgent,
        p_ip_address: ipAddress,
      }).then(({ error }: any) => {
        if (error) console.error('VAST 트래킹 RPC 에러:', error);
      });
    }
  } catch (error) {
    console.error('VAST 트래킹 에러:', error);
  }

  // 항상 1x1 투명 GIF 응답 (트래킹 픽셀 표준)
  const gif = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
    0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
  ]);

  return new Response(gif, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...vastCorsHeaders(c),
    }
  });
});

// ============================================
// Phase 9 — 토스페이먼츠 결제 승인 (toss-confirm)
//
// 요청 (POST /server/toss-confirm):
//   { orderId, paymentKey, amount }
//
// 동작:
//   1. payments 테이블에서 orderId 조회 → 금액 위변조 검증
//   2. 토스 API confirm 호출 (시크릿 키 사용)
//   3. 성공: confirm_payment RPC → status='completed' + 권한 부여
//   4. 실패: fail_payment RPC → status='failed'
//
// 환경변수 필요:
//   TOSS_SECRET_KEY = test_sk_xxx (Supabase Dashboard에서 설정)
// ============================================
app.post('/toss-confirm', async (c) => {
  try {
    const { orderId, paymentKey, amount } = await c.req.json();

    if (!orderId || !paymentKey || !amount) {
      return c.json({ error: 'orderId, paymentKey, amount 모두 필요합니다' }, 400);
    }

    const tossSecretKey = Deno.env.get('TOSS_SECRET_KEY');
    if (!tossSecretKey) {
      console.error('[toss-confirm] TOSS_SECRET_KEY 미설정');
      return c.json({ error: '결제 서버 설정 오류 (관리자 문의)' }, 500);
    }

    // 서비스 롤 클라이언트 (RLS 우회 + SECURITY DEFINER RPC 호출)
    const supabase = getSupabaseClient(true);

    // 1) payments 테이블에서 orderId 조회 — 금액 위변조 방지
    const { data: paymentRow, error: lookupErr } = await supabase
      .from('payments')
      .select('amount, status, user_id, payment_type')
      .eq('order_id', orderId)
      .single();

    if (lookupErr || !paymentRow) {
      console.error('[toss-confirm] orderId 조회 실패:', orderId, lookupErr);
      return c.json({ error: '존재하지 않는 결제 요청입니다' }, 404);
    }

    if (paymentRow.amount !== Number(amount)) {
      console.error('[toss-confirm] 금액 불일치:', { orderId, expected: paymentRow.amount, actual: amount });
      return c.json({ error: '결제 금액이 변조되었습니다' }, 400);
    }

    if (paymentRow.status === 'completed') {
      // 멱등성 — 이미 처리됨
      return c.json({ success: true, message: '이미 처리된 결제입니다', alreadyProcessed: true });
    }

    if (paymentRow.status !== 'pending') {
      return c.json({ error: `잘못된 결제 상태: ${paymentRow.status}` }, 400);
    }

    // 2) 토스 API confirm 호출
    // Authorization: Basic base64(secretKey + ':')
    const authHeader = `Basic ${btoa(tossSecretKey + ':')}`;
    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId, paymentKey, amount: Number(amount) }),
    });

    const tossBody = await tossRes.json();

    if (!tossRes.ok) {
      // 토스 confirm 실패
      console.error('[toss-confirm] 토스 confirm 실패:', tossBody);
      await supabase.rpc('fail_payment', {
        p_order_id: orderId,
        p_failure_code: tossBody?.code || 'TOSS_CONFIRM_FAILED',
        p_failure_reason: tossBody?.message || '토스페이먼츠 승인 실패',
      });
      return c.json({
        error: tossBody?.message || '결제 승인 실패',
        code: tossBody?.code,
      }, 400);
    }

    // 3) confirm 성공 — DB 갱신 (RPC가 권한 부여까지 처리)
    const { error: confirmErr } = await supabase.rpc('confirm_payment', {
      p_order_id: orderId,
      p_payment_key: paymentKey,
      p_method: tossBody?.method || '카드',
      p_approved_at: tossBody?.approvedAt || new Date().toISOString(),
      p_raw_response: tossBody,
    });

    if (confirmErr) {
      console.error('[toss-confirm] confirm_payment RPC 실패:', confirmErr);
      // 토스 결제는 승인됐지만 우리 DB 갱신 실패 — 수동 조치 필요
      return c.json({
        error: '결제는 승인됐지만 DB 처리 실패. 고객센터 문의 필요',
        orderId,
        paymentKey,
      }, 500);
    }

    // 결제 종류별 성공 메시지
    let successMessage = '결제가 정상적으로 완료되었습니다.';
    if (paymentRow.payment_type === 'subscription') {
      successMessage = '프리미엄 구독이 활성화되었습니다. 30일간 시네마·OTT를 무제한 즐기세요.';
    } else if (paymentRow.payment_type === 'license') {
      successMessage = '영상 라이선스 구매가 완료되었습니다. 다운로드 페이지에서 확인하세요.';
    } else if (paymentRow.payment_type === 'ad_budget') {
      successMessage = '광고 예산이 충전되었습니다.';
    }

    return c.json({
      success: true,
      message: successMessage,
      orderId,
      amount: Number(amount),
      method: tossBody?.method,
    });
  } catch (err: any) {
    console.error('[toss-confirm] 예외:', err);
    return c.json({ error: '결제 승인 처리 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// Phase 34 — Resend 이메일 발송
// ============================================
//
// 호출: POST /server/send-email
// Body: { user_id, type, to, subject, html }
//
// 동작:
//   1. should_send_notification RPC → 사용자 OFF면 skip
//   2. Resend API 호출 (mail.creaite.net 발신, Reply-To support@creaite.net)
//   3. log_notification RPC로 발송 결과 기록 (성공/실패)

app.post('/send-email', async (c) => {
  try {
    const supabase = getSupabaseClient(true);

    // H1(2026-05-31): 호출자 인증 — 공개 anon key 만으로 임의 to/html 발송하던 오픈릴레이 차단
    const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return c.json({ error: '인증이 필요합니다' }, 401);
    const { data: caller, error: callerErr } = await supabase.auth.getUser(token);
    if (callerErr || !caller?.user) return c.json({ error: '인증 실패' }, 401);
    const callerId = caller.user.id;

    // providedTo 는 무시 — 수신자는 항상 user_id 로 서버 조회(임의 외부주소 발송 차단)
    const { user_id, type, subject, html, link: clientLink } = await c.req.json();

    if (!user_id || !type || !subject || !html) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // H1: type 별 발신 권한 — self(본인) / admin(어드민) / actor(인증 사용자 행위)
    const SELF_TYPES = ['welcome', 'subscription_receipt'];
    const ADMIN_TYPES = ['report_result', 'revenue_settled', 'refund_completed', 'ad_budget_low'];
    if (SELF_TYPES.includes(type)) {
      if (user_id !== callerId) return c.json({ error: '본인에게만 발송 가능한 알림입니다' }, 403);
    } else if (ADMIN_TYPES.includes(type)) {
      const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', callerId).single();
      if (!prof?.is_admin) return c.json({ error: '어드민만 발송 가능한 알림입니다' }, 403);
    }
    // actor types(comment_reply/new_follower/new_video_from_followed): 인증된 사용자면 허용

    // 수신자 email 은 항상 user_id 로 조회 (클라이언트가 to 를 임의 지정 못 함)
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(user_id);
    if (userErr || !userData?.user?.email) {
      console.error('[send-email] user_id로 email 조회 실패:', user_id, userErr);
      return c.json({ error: 'Recipient email not found' }, 400);
    }
    const to = userData.user.email;

    // ── 인앱 알림(벨 패널) 기록 ──────────────────────────────────────────────
    // notifications 테이블 INSERT — 이메일/푸시와 동일 이벤트를 벨에도 표시.
    // service_role 이라 RLS 우회(타 사용자에게 가는 actor 알림도 기록 가능).
    // 가장 부드러운 채널이므로 이메일 설정 OFF여도 벨엔 남김(활동 내역).
    // 표시용 짧은 본문 + 클릭 이동 link 를 타입별로 매핑.
    const INAPP: Record<string, { type: string; body: string; link: string }> = {
      welcome:                 { type: 'system',   body: 'CREAITE에 오신 것을 환영합니다',  link: '/' },
      subscription_receipt:    { type: 'purchase', body: '결제가 완료되었습니다',            link: '/?tab=mypage&section=settings' },
      refund_completed:        { type: 'purchase', body: '환불이 완료되었습니다',            link: '/?tab=mypage&section=settings' },
      comment_reply:           { type: 'comment',  body: '새 답글이 달렸습니다',              link: '/' },
      new_follower:            { type: 'system',   body: '새 팔로워가 생겼습니다',            link: '/?tab=channel' },
      revenue_settled:         { type: 'sale',     body: '정산이 완료되었습니다',            link: '/?tab=mypage&section=sales' },
      report_result:           { type: 'system',   body: '신고 검토 결과가 도착했습니다',    link: '/' },
      ad_budget_low:           { type: 'system',   body: '광고 예산이 임박했습니다',          link: '/' },
      new_video_from_followed: { type: 'system',   body: '팔로우한 채널의 새 영상',          link: '/' },
    };
    const inapp = INAPP[type] || { type: 'system', body: '탭하여 확인하세요', link: '/' };
    const inappTitle = String(subject || '').replace(/^\[CREAITE\]\s*/, '').slice(0, 200);
    const inappLink = (typeof clientLink === 'string' && clientLink) ? clientLink.slice(0, 500) : inapp.link;
    try {
      await supabase.from('notifications').insert({
        user_id,
        type: inapp.type,
        title: inappTitle,
        body: inapp.body,
        link: inappLink,
        read: false,
      });
    } catch (e) {
      console.warn('[send-email] 인앱 알림 기록 실패:', e);
    }

    // 1. 사용자 알림 설정 확인
    const { data: shouldSend, error: checkError } = await supabase.rpc(
      'should_send_notification',
      { p_user_id: user_id, p_type: type, p_channel: 'email' }
    );

    if (checkError) {
      console.error('[send-email] 알림 설정 확인 실패:', checkError);
      return c.json({ error: 'Failed to check preferences' }, 500);
    }

    if (!shouldSend) {
      return c.json({ success: true, skipped: true, reason: 'User disabled this notification' });
    }

    // 2. Resend API 호출
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@mail.creaite.net';
    const replyTo = Deno.env.get('RESEND_REPLY_TO') || 'support@creaite.net';

    if (!resendApiKey) {
      console.error('[send-email] RESEND_API_KEY 미설정');
      return c.json({ error: 'Resend API key not configured' }, 500);
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `CREAITE <${fromEmail}>`,
        to: [to],
        reply_to: replyTo,
        subject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      await supabase.rpc('log_notification', {
        p_user_id: user_id,
        p_type: type,
        p_channel: 'email',
        p_recipient: to,
        p_subject: subject,
        p_status: 'failed',
        p_error_message: JSON.stringify(resendData),
      });
      return c.json({ error: 'Resend API error', details: resendData }, 500);
    }

    // 3. 발송 성공 로그
    await supabase.rpc('log_notification', {
      p_user_id: user_id,
      p_type: type,
      p_channel: 'email',
      p_recipient: to,
      p_subject: subject,
      p_status: 'sent',
      p_resend_message_id: resendData.id,
    });

    // 4. 웹 푸시도 발송 — 구독 기기가 있으면 (구독 자체가 사용자 동의). 이메일과 동일 알림.
    //    인앱 벨과 동일한 짧은 본문 + 딥링크(link) 사용 → 탭 시 해당 화면으로 이동.
    await sendWebPushToUser(supabase, user_id, inappTitle, inapp.body, inappLink);

    return c.json({ success: true, message_id: resendData.id });
  } catch (err: any) {
    console.error('[send-email] 예외:', err);
    return c.json({ error: '이메일 발송 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// 어드민 공지 푸시 발송 (Phase 10.7 보강 — 인앱 벨 INSERT 는 admin_broadcast_notification RPC 가,
// 잠금화면 푸시는 이 엔드포인트가 담당. AdminBroadcast.tsx 가 둘 다 호출)
// ============================================
// 호출: POST /server/broadcast-push   Body: { segment, title, body, link }
app.post('/broadcast-push', async (c) => {
  try {
    const supabase = getSupabaseClient(true);

    // 호출자 인증 + 어드민 검증
    const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return c.json({ error: '인증이 필요합니다' }, 401);
    const { data: caller, error: callerErr } = await supabase.auth.getUser(token);
    if (callerErr || !caller?.user) return c.json({ error: '인증 실패' }, 401);
    const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', caller.user.id).single();
    if (!prof?.is_admin) return c.json({ error: '어드민만 발송 가능합니다' }, 403);

    const { segment = 'all', title, body, link } = await c.req.json();
    if (!title) return c.json({ error: '제목이 필요합니다' }, 400);
    if (!['all', 'premium', 'free', 'creators'].includes(segment)) {
      return c.json({ error: '잘못된 세그먼트' }, 400);
    }

    // 모든 푸시 구독(작은 테이블)을 가져온 뒤 세그먼트로 필터 — 전체 profiles 스캔 회피
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id');
    if (!subs || !subs.length) return c.json({ success: true, pushed: 0 });

    // 정지 계정 제외 (정지자는 보통 소수)
    const { data: suspended } = await supabase.from('profiles').select('id').eq('is_suspended', true);
    const suspendedSet = new Set((suspended || []).map((r: any) => r.id));
    let allowed = (uid: string) => !suspendedSet.has(uid);

    if (segment === 'premium' || segment === 'free') {
      const { data: tierUsers } = await supabase.from('profiles').select('id').eq('subscription_tier', segment);
      const tierSet = new Set((tierUsers || []).map((r: any) => r.id));
      const base = allowed; allowed = (uid: string) => base(uid) && tierSet.has(uid);
    } else if (segment === 'creators') {
      const { data: vids } = await supabase.from('videos').select('creator_id');
      const creatorSet = new Set((vids || []).map((r: any) => r.creator_id).filter(Boolean));
      const base = allowed; allowed = (uid: string) => base(uid) && creatorSet.has(uid);
    }

    const targets = subs.filter((s: any) => allowed(s.user_id));
    const pushed = await sendWebPushToSubs(
      supabase,
      targets,
      String(title).replace(/^\[CREAITE\]\s*/, '').slice(0, 200),
      (body && String(body).slice(0, 200)) || '탭하여 확인하세요',
      (typeof link === 'string' && link) ? link.slice(0, 500) : '/',
    );
    return c.json({ success: true, pushed });
  } catch (err: any) {
    console.error('[broadcast-push] 예외:', err);
    return c.json({ error: '공지 푸시 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// Phase 25 — 자동 모더레이션 (Google Vision SafeSearch)
// ============================================
//
// 호출: POST /server/moderate-video
// Body: { video_id }
//
// 동작:
//   1. videos 테이블에서 thumbnail URL 조회
//   2. Google Vision SafeSearch API 호출
//   3. 5단계 likelihood → 0~100 점수 변환
//   4. score = max(adult, violence, racy) [spoof/medical 무시]
//   5. update_video_moderation RPC 호출 → DB가 status 자동 결정

app.post('/moderate-video', async (c) => {
  try {
    const supabase = getSupabaseClient(true);

    // M1(2026-05-31): 호출자 인증 — 무인증 시 임의 video_id로 Vision API 비용 어뷰징/상태 위변조 가능
    const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return c.json({ error: '인증이 필요합니다' }, 401);
    const { data: caller, error: callerErr } = await supabase.auth.getUser(token);
    if (callerErr || !caller?.user) return c.json({ error: '인증 실패' }, 401);
    const callerId = caller.user.id;

    const { video_id } = await c.req.json();

    if (!video_id) {
      return c.json({ error: 'Missing video_id' }, 400);
    }

    // 1. 영상 정보 조회 (thumbnail URL + 소유자)
    const { data: video, error: vidErr } = await supabase
      .from('videos')
      .select('id, thumbnail, creator_id')
      .eq('id', video_id)
      .single();

    if (vidErr || !video) {
      return c.json({ error: 'Video not found', details: vidErr }, 404);
    }

    // M1: 영상 소유자 또는 어드민만 (service_role 클라이언트라 grant/RLS 우회 조회)
    if (video.creator_id !== callerId) {
      const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', callerId).single();
      if (!prof?.is_admin) return c.json({ error: '권한이 없습니다' }, 403);
    }

    if (!video.thumbnail) {
      // 썸네일 없음 — 분석 불가. pending 유지
      await supabase.rpc('update_video_moderation', {
        p_video_id: video_id,
        p_score: null,
        p_categories: null,
        p_error: 'No thumbnail available',
      });
      return c.json({ error: 'No thumbnail available', skipped: true }, 400);
    }

    // 2. Google Vision SafeSearch 호출
    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
    if (!apiKey) {
      console.error('[moderate-video] GOOGLE_VISION_API_KEY 미설정');
      return c.json({ error: 'Vision API key not configured' }, 500);
    }

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { source: { imageUri: video.thumbnail } },
            features: [{ type: 'SAFE_SEARCH_DETECTION' }],
          }],
        }),
      }
    );

    const visionData = await visionRes.json();

    if (!visionRes.ok) {
      const errMsg = visionData?.error?.message || 'Vision API error';
      console.error('[moderate-video] Vision API 실패:', errMsg);
      await supabase.rpc('update_video_moderation', {
        p_video_id: video_id,
        p_score: null,
        p_categories: null,
        p_error: errMsg,
      });
      return c.json({ error: errMsg, details: visionData }, 500);
    }

    const safeSearch = visionData?.responses?.[0]?.safeSearchAnnotation;

    if (!safeSearch) {
      const errMsg = 'No safeSearchAnnotation in Vision response';
      console.error('[moderate-video] ', errMsg, visionData);
      await supabase.rpc('update_video_moderation', {
        p_video_id: video_id,
        p_score: null,
        p_categories: null,
        p_error: errMsg,
      });
      return c.json({ error: errMsg }, 500);
    }

    // 3. 5단계 likelihood → 0~100 점수 변환
    const LIKELIHOOD_SCORE: Record<string, number> = {
      VERY_UNLIKELY: 0,
      UNLIKELY: 25,
      POSSIBLE: 50,
      LIKELY: 75,
      VERY_LIKELY: 100,
      UNKNOWN: 0,
    };

    const categories = {
      adult: LIKELIHOOD_SCORE[safeSearch.adult] ?? 0,
      violence: LIKELIHOOD_SCORE[safeSearch.violence] ?? 0,
      racy: LIKELIHOOD_SCORE[safeSearch.racy] ?? 0,
      spoof: LIKELIHOOD_SCORE[safeSearch.spoof] ?? 0,
      medical: LIKELIHOOD_SCORE[safeSearch.medical] ?? 0,
    };

    // 4. score = max(adult, violence, racy) — spoof/medical 무시
    const score = Math.max(categories.adult, categories.violence, categories.racy);

    // 5. DB 업데이트 (RPC가 점수 기반으로 status + is_hidden 자동 결정)
    const { data: updatedVideo, error: updErr } = await supabase.rpc('update_video_moderation', {
      p_video_id: video_id,
      p_score: score,
      p_categories: categories,
    });

    if (updErr) {
      console.error('[moderate-video] DB 업데이트 실패:', updErr);
      return c.json({ error: 'DB update failed', details: updErr }, 500);
    }

    return c.json({
      success: true,
      score,
      status: updatedVideo?.moderation_status,
      categories,
    });
  } catch (err: any) {
    console.error('[moderate-video] 예외:', err);
    return c.json({ error: '모더레이션 처리 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// C3 — 토스페이먼츠 환불 (어드민이 1클릭으로 카드 환불까지)
// ============================================
//
// 호출: POST /server/refund-payment
//   Headers: Authorization: Bearer <admin_access_token>
//   Body: { payment_id: BIGINT, admin_note?: string }
//
// 동작:
//   1. Authorization 토큰으로 사용자 인증 + profiles.is_admin 확인
//   2. payments 조회 → payment_key (토스 거래 식별자) 확보
//   3. 토스 API POST /v1/payments/{paymentKey}/cancel 호출
//   4. 성공 시 admin_refund_payment RPC 호출 (DB 갱신 + 권한 회수 + admin_logs)
//   5. 응답에 user_id 등 알림 메일 발송용 정보 포함 → 클라이언트가 sendNotification 호출

app.post('/refund-payment', async (c) => {
  try {
    // 1) 인증 토큰 추출
    const authHeader = c.req.header('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return c.json({ error: '인증 토큰이 필요합니다' }, 401);
    }

    // 2) 사용자 조회 + 어드민 권한 확인 (service_role 로 안전하게)
    const supabase = getSupabaseClient(true);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return c.json({ error: '인증 실패' }, 401);
    }
    const adminUserId = userData.user.id;

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', adminUserId)
      .single();
    if (profileErr || !profile?.is_admin) {
      return c.json({ error: '어드민 권한이 필요합니다' }, 403);
    }

    // 3) 입력 검증
    const body = await c.req.json();
    const payment_id = body?.payment_id;
    const admin_note = body?.admin_note || null;
    if (!payment_id) {
      return c.json({ error: 'payment_id 필요' }, 400);
    }

    // 4) payments 조회
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .select('id, payment_key, status, amount, order_id, payment_type, user_id, refund_reason, method')
      .eq('id', payment_id)
      .single();
    if (pErr || !payment) {
      return c.json({ error: '결제 정보를 찾을 수 없습니다' }, 404);
    }
    if (!payment.payment_key) {
      return c.json({ error: '토스 결제 키가 없습니다 (수동 처리 필요)' }, 400);
    }
    if (!['completed', 'refund_requested'].includes(payment.status)) {
      return c.json({ error: `환불 가능 상태 아님: ${payment.status}` }, 400);
    }

    // 5) 토스 API 환불 호출
    const tossSecretKey = Deno.env.get('TOSS_SECRET_KEY');
    if (!tossSecretKey) {
      console.error('[refund-payment] TOSS_SECRET_KEY 미설정');
      return c.json({ error: '결제 서버 설정 오류 (관리자 문의)' }, 500);
    }

    const cancelReason = admin_note || payment.refund_reason || '관리자 환불';
    const tossAuthHeader = `Basic ${btoa(tossSecretKey + ':')}`;
    const tossRes = await fetch(
      `https://api.tosspayments.com/v1/payments/${payment.payment_key}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': tossAuthHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancelReason }),
      }
    );

    const tossBody = await tossRes.json();
    if (!tossRes.ok) {
      console.error('[refund-payment] 토스 cancel 실패:', tossBody);
      return c.json({
        error: tossBody?.message || '토스페이먼츠 환불 실패',
        code: tossBody?.code,
        details: tossBody,
      }, 502);
    }

    // 6) admin_refund_payment RPC 호출
    //    어드민 토큰으로 클라이언트 만들어야 assert_admin 통과 (auth.uid()가 어드민)
    const supabaseAsAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { error: rpcErr } = await supabaseAsAdmin.rpc('admin_refund_payment', {
      p_payment_id: payment_id,
      p_admin_note: admin_note,
    });

    if (rpcErr) {
      // 토스 환불은 성공했는데 DB 갱신 실패 — 운영팀에 알림 필요한 위험 상태
      console.error('[refund-payment] DB 갱신 실패 (토스 환불은 성공):', rpcErr);
      return c.json({
        error: '토스 환불은 완료됐으나 DB 갱신 실패. 운영팀에 알려주세요.',
        toss_canceled: true,
        db_error: rpcErr.message,
        toss_transaction_key: tossBody?.transactionKey,
      }, 500);
    }

    // 7) 성공 응답 — 클라이언트가 환불 완료 메일 발송에 사용
    return c.json({
      success: true,
      message: '환불 처리 완료 (토스 + DB)',
      toss_transaction_key: tossBody?.transactionKey,
      payment: {
        id: payment.id,
        user_id: payment.user_id,
        amount: payment.amount,
        order_id: payment.order_id,
        payment_type: payment.payment_type,
        method: payment.method,
        refund_reason: payment.refund_reason,
        admin_note,
      },
    });
  } catch (err: any) {
    console.error('[refund-payment] 예외:', err);
    return c.json({ error: '환불 처리 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

Deno.serve(app.fetch);