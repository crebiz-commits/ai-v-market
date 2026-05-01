import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Supabase Edge Function 함수 이름이 path prefix로 포함되므로 basePath 설정
const app = new Hono().basePath('/server');

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
app.use(
  "/*",
  cors({
    origin: "*",
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
        price_standard: parseInt(metadata.standardPrice || "0"),
        price_commercial: parseInt(metadata.commercialPrice || "0"),
        price_exclusive: parseInt(metadata.exclusivePrice || "0"),
        ai_tool: metadata.aiTool || '',
        category: metadata.category || '',
        genre: metadata.genre || '',
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
// 호출 예: GET /vast-tag?source_video_id=abc123
//
// 동작:
//   1. ad_type='video_preroll' && is_active=true 광고 중 가중치 랜덤 선택
//   2. VAST 2.0 표준 XML 응답
//   3. impression/click 트래킹 URL 포함
app.get("/vast-tag", async (c) => {
  try {
    const sourceVideoId = c.req.query('source_video_id') || '';
    const supabaseAdmin = getSupabaseClient(true);

    // 가중치 기반 랜덤 광고 선택
    const { data: ads, error: pickError } = await supabaseAdmin.rpc('pick_random_video_preroll');

    if (pickError || !ads || ads.length === 0) {
      // 광고 없음 → 빈 VAST 응답 (Bunny가 광고 스킵)
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<VAST version="2.0"></VAST>`,
        { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
      );
    }

    const ad = ads[0];

    // 트래킹 URL 베이스 (현재 호스트 기준)
    const url = new URL(c.req.url);
    const trackBase = `${url.origin}${url.pathname.replace('/vast-tag', '/vast-track')}`;
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
        // Bunny Player가 Google IMA SDK(imasdk.googleapis.com)로 VAST 호출하므로 CORS 필수
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
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
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
      }
    );
  }
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
      // Google IMA SDK / Bunny Player에서 호출하므로 CORS 허용
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
  });
});

Deno.serve(app.fetch);