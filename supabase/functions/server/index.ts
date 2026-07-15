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
  // 동시성 제한(100) — 수천 구독을 단일 Promise.all 로 쏘면 Edge CPU/메모리·타임아웃 위험.
  const CONC = 100;
  for (let i = 0; i < subs.length; i += CONC) {
    const chunk = subs.slice(i, i + CONC);
    await Promise.all(
      chunk.map((s) =>
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
  }
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

// Bunny Stream pull-zone 호스트 — 단일 소스. env 이름 3종 혼재(BUNNY_CDN_HOSTNAME/BUNNY_HOSTNAME)를
// 통일하고, 폴백은 잘못된 `vz-${libraryId}`(숫자 ID)가 아니라 실제 pull-zone GUID 로.
const BUNNY_CDN_HOST =
  Deno.env.get('BUNNY_CDN_HOSTNAME') ||
  Deno.env.get('BUNNY_HOSTNAME') ||
  'vz-6e85411f-96a.b-cdn.net';

// URL 화이트리스트: http(s) 스킴만 허용(javascript:/data: 등 저장형 XSS·피싱 차단). 그 외 '' 반환.
const safeHttpUrl = (u: unknown): string => {
  if (typeof u !== 'string' || !u) return '';
  try {
    const p = new URL(u);
    return (p.protocol === 'http:' || p.protocol === 'https:') ? u : '';
  } catch {
    return '';
  }
};

// PostgREST 기본 Max Rows(1000) 우회 — .range() 페이지네이션으로 전체 행 수집.
//   makeQuery(from,to) 는 반드시 결정적 정렬(.order)이 걸린 쿼리빌더를 반환해야 페이지 경계
//   중복/누락이 없다. 대량 세그먼트(>1000)에서 이메일·푸시가 조용히 앞 1000건만 발송되던 것 방지.
async function fetchAllRows<T = any>(makeQuery: (from: number, to: number) => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

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

// 회원가입 — R2(2026-06-11): 폐기.
// admin.createUser(email_confirm:true) 가 이메일 인증을 우회하던 테스트 모드 루트.
// 이제 클라이언트가 supabase.auth.signUp() 을 직접 호출 (확인 메일 발송 → 링크 클릭 후 로그인).
// 구버전 클라이언트/외부 호출이 인증 우회 계정을 만들지 못하도록 410 으로 차단.
app.post("/auth/signup", (c) => {
  return c.json({
    error: "이 가입 방식은 더 이상 지원되지 않습니다. 앱을 새로고침한 뒤 다시 가입해 주세요.",
    deprecated: true,
  }, 410);
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

    // 정지 계정 로그인 차단(서버측) — is_suspended 는 보호 컬럼이라 service_role 로 조회.
    //   클라 AuthContext 도 모든 경로에서 차단하지만, 이메일 경로는 여기서 세션 발급 전에 거부해
    //   로그인 모달에 즉시 안내 + 서버 방어층. OAuth 는 이 엔드포인트를 안 거쳐 클라가 담당.
    const admin = getSupabaseClient(true);
    const { data: prof } = await admin
      .from("profiles")
      .select("is_suspended")
      .eq("id", data.user.id)
      .single();
    if (prof?.is_suspended) {
      return c.json({ error: "정지된 계정입니다. 이용이 제한됩니다. 문의: support@creaite.net" }, 403);
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

// R1(2026-06-11): Bunny TUS presigned 서명 — 라이브러리 API Key 를 클라이언트에 주지 않기 위함
// signature = SHA256(libraryId + apiKey + expire + videoId), 클라이언트는 tusupload 엔드포인트로 업로드
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

    // 정지 계정 차단 + 남용 방지(#6): 비관리자는 시간당 create-upload 30회 제한 (빈 Bunny 영상 무한 생성 차단).
    // 관리자(시드 콘텐츠 대량 업로드)는 예외.
    // U-M2(2026-07-07): rl_hit 원자적 카운터로 교체(KV get→set 경합 제거). is_admin/is_suspended 는
    //   anon 미열람 컬럼이라 service 클라로 조회해야 함(기존 anon 조회는 항상 null → 예외/차단이 죽어있던 버그).
    {
      const supabaseAdmin = getSupabaseClient(true);
      const { data: _rlProf } = await supabaseAdmin.from('profiles').select('is_admin, is_suspended').eq('id', user.id).maybeSingle();
      // 정지된 계정은 업로드 불가 (모더레이션 — DB 트리거가 못 막는 service_role 경로라 여기서 차단)
      if (_rlProf?.is_suspended) {
        return c.json({ error: "정지된 계정은 업로드할 수 없습니다. 고객센터로 문의해 주세요." }, 403);
      }
      if (!_rlProf?.is_admin) {
        const { data: _rlOk } = await supabaseAdmin.rpc('rl_hit', {
          p_key: `create-upload:${user.id}`, p_limit: 30, p_window_sec: 3600,
        });
        if (_rlOk === false) {
          return c.json({ error: "업로드 요청이 너무 많습니다. 1시간 후 다시 시도해 주세요." }, 429);
        }
      }
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

    // R1: 업로드 직후 썸네일 라우트의 소유권 검증용 (save-metadata 가 나중에 전체 데이터로 덮어씀)
    await kv.set(`video:${videoData.guid}`, {
      userId: user.id,
      userEmail: user.email,
      title: videoData.title,
      createdAt: new Date().toISOString(),
      status: 'creating',
    });

    // R1: 라이브러리 API Key 대신 TUS presigned 서명만 반환 (6시간 유효)
    const tusExpire = Math.floor(Date.now() / 1000) + 6 * 3600;
    const tusSignature = await sha256Hex(`${libraryId}${apiKey}${tusExpire}${videoData.guid}`);

    return c.json({
      videoId: videoData.guid,
      libraryId: libraryId,
      title: videoData.title,
      tusSignature,
      tusExpire,
    });
  } catch (error) {
    console.error('비디오 생성 중 에러:', error);
    return c.json({ error: `비디오 생성 중 오류가 발생했습니다: ${error.message}` }, 500);
  }
});

// ── 영상 재생 토큰 발급 (Bunny Embed Token Auth — 서버 페이월) ─────────────────
// 비구독자: 짧은 수명(150초, 1분 미리보기 커버) → URL 추출해도 장편 프리미엄 끝까지 못 봄.
// 구독자/소유자/관리자/라이선스 구매자: 긴 수명(4시간) → 전체 시청.
// BUNNY_TOKEN_AUTH_KEY 미설정 시 token=null → 클라가 토큰 없이 재생(현행 유지, 무중단 전환).
app.post("/video-play-token", async (c) => {
  try {
    const { videoId } = await c.req.json().catch(() => ({}));
    if (!videoId) return c.json({ error: "videoId 필요" }, 400);

    const securityKey = Deno.env.get('BUNNY_TOKEN_AUTH_KEY');
    if (!securityKey) return c.json({ token: null, expires: null, fullAccess: false });

    const admin = getSupabaseClient(true);
    // 영상 연령등급·소유자·숨김/공개상태 (청소년보호 + 모더레이션 게이트 + 접근 판정에 사용)
    const { data: vid } = await admin.from('videos').select('age_rating, creator_id, is_hidden, visibility').eq('id', videoId).maybeSingle();
    const is19 = vid?.age_rating === '19';

    let fullAccess = false;
    let isOwner = false;
    let isAdmin = false;
    let ageVerified = false;
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (accessToken) {
      const { data: { user } } = await getSupabaseClient().auth.getUser(accessToken);
      if (user) {
        isOwner = vid?.creator_id === user.id;
        const { data: prof } = await admin.from('profiles')
          .select('subscription_tier, subscription_expires_at, is_admin, age_verified')
          .eq('id', user.id).maybeSingle();
        isAdmin = !!prof?.is_admin;
        ageVerified = !!prof?.age_verified;
        const isPremium = prof?.subscription_tier === 'premium' &&
          !!prof?.subscription_expires_at && new Date(prof.subscription_expires_at) > new Date();
        if (isPremium || isAdmin || isOwner) {
          fullAccess = true;
        } else {
          const { data: ord } = await admin.from('orders')
            .select('id').eq('buyer_id', user.id).eq('video_id', videoId).eq('status', 'completed').limit(1);
          fullAccess = !!ord && ord.length > 0;
        }
      }
    }

    // 청소년보호(서버 강제): 19금은 연령인증(또는 소유자·관리자) 없으면 토큰 자체를 발급 안 함
    //   → 미리보기(150초)도 불가. 클라 블러/게이트가 우회돼도 Bunny 토큰인증 ON 시 CDN 이 거부.
    if (is19 && !ageVerified && !isOwner && !isAdmin) {
      return c.json({ token: null, expires: null, fullAccess: false, ageBlocked: true });
    }

    // 모더레이션(서버 강제): 숨김(검수 대기·재검수·신고누적)·비공개 영상은 소유자·관리자 외
    //   토큰 미발급 — ID 직링크(?video=<id>)로 미검수 본편이 재생되던 우회 차단.
    //   (unlisted 는 링크 공유가 목적이라 발급 유지. 관리자=검수 화면, 소유자=본인 미리보기 예외.)
    if ((vid?.is_hidden === true || vid?.visibility === 'private') && !isOwner && !isAdmin) {
      return c.json({ token: null, expires: null, fullAccess: false, hiddenBlocked: true });
    }

    const ttl = fullAccess ? 4 * 3600 : 150;  // 전체 4시간 / 미리보기 150초
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const token = await sha256Hex(`${securityKey}${videoId}${expires}`);
    return c.json({ token, expires, fullAccess });
  } catch (error) {
    console.error('[video-play-token] 오류:', error);
    return c.json({ error: `토큰 발급 실패: ${error.message}` }, 500);
  }
});

// R1(2026-06-11): 커스텀 썸네일 업로드 프록시
// Bunny 썸네일 API 는 라이브러리 AccessKey 가 필요해 클라이언트 직접 호출 불가 → 서버 경유.
// 소유권: create-upload 시 KV 에 기록한 userId (또는 어드민)만 허용.
app.post("/videos/:videoId/thumbnail", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    }

    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    }

    const videoId = c.req.param('videoId');
    if (!videoId || !/^[0-9a-f-]{36}$/i.test(videoId)) {
      return c.json({ error: "올바른 videoId가 필요합니다." }, 400);
    }

    // 소유권 검증: KV(업로드 중) → videos 테이블(업로드 완료 후) → 어드민
    const supabaseAdmin = getSupabaseClient(true);
    let isOwner = false;
    const kvRecord = await kv.get(`video:${videoId}`);
    if (kvRecord?.userId === user.id) {
      isOwner = true;
    } else {
      const { data: videoRow } = await supabaseAdmin
        .from('videos').select('creator_id').eq('id', videoId).maybeSingle();
      if (videoRow?.creator_id === user.id) isOwner = true;
    }
    if (!isOwner) {
      const { data: profile } = await supabaseAdmin
        .from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) {
        return c.json({ error: "본인 영상에만 썸네일을 설정할 수 있습니다." }, 403);
      }
    }

    const libraryId = Deno.env.get('BUNNY_LIBRARY_ID');
    const apiKey = Deno.env.get('BUNNY_API_KEY');
    if (!libraryId || !apiKey) {
      return c.json({ error: "Bunny.net 설정이 완료되지 않았습니다." }, 500);
    }

    const body = await c.req.arrayBuffer();
    if (!body || body.byteLength === 0) {
      return c.json({ error: "이미지 데이터가 비어 있습니다." }, 400);
    }
    if (body.byteLength > 5 * 1024 * 1024) {
      return c.json({ error: "썸네일은 5MB 이하여야 합니다." }, 413);
    }

    const bunnyRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}/thumbnail`,
      {
        method: 'POST',
        headers: {
          'AccessKey': apiKey,
          'Content-Type': c.req.header('content-type') || 'image/jpeg',
        },
        body,
      }
    );

    if (!bunnyRes.ok) {
      const text = await bunnyRes.text().catch(() => '');
      console.error('Bunny thumbnail upload failed:', bunnyRes.status, text);
      return c.json({ error: `썸네일 업로드 실패 (${bunnyRes.status})` }, 502);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('썸네일 업로드 중 에러:', error);
    return c.json({ error: `썸네일 업로드 중 오류: ${error.message}` }, 500);
  }
});

// AI 자막 생성·번역 (Bunny Stream 내장 transcribe) — 비동기 큐잉, 완료 시 iframe 플레이어에 자동 표시
// 홍보문건(마케팅 소재) 자동 생성 — Claude API. 영상 제목·설명·장르로 홍보 카피/SNS 캡션/해시태그 생성.
//   선행: Supabase Edge 시크릿 ANTHROPIC_API_KEY 설정 필요(미설정 시 안내 에러).
app.post("/generate-promo", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    if (!accessToken) return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return c.json({ error: "유효하지 않은 토큰입니다." }, 401);

    // 비용 어뷰징 방지: 비관리자는 시간당 20회 (Anthropic 무제한 호출 차단). create-upload 동일 패턴.
    {
      const { data: _gpProf } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!_gpProf?.is_admin) {
        // U-M2(2026-07-07): rl_hit 원자적 카운터(supabase 는 이미 service 클라). 20/시간.
        const { data: _rlOk } = await supabase.rpc('rl_hit', {
          p_key: `generate-promo:${user.id}`, p_limit: 20, p_window_sec: 3600,
        });
        if (_rlOk === false) return c.json({ error: "AI 홍보문 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
      }
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return c.json({ error: "AI 홍보문건 기능이 아직 설정되지 않았습니다. (ANTHROPIC_API_KEY 미설정)" }, 503);

    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title || '').slice(0, 200);
    const description = String(body.description || '').slice(0, 1500);
    const category = String(body.category || '').slice(0, 50);
    const lang = String(body.language || 'ko').startsWith('ko') ? '한국어' : 'English';
    if (!title.trim()) return c.json({ error: "영상 제목이 필요합니다." }, 400);

    const prompt = `당신은 AI 영상 OTT 플랫폼 CREAITE의 마케팅 카피라이터입니다. 아래 영상의 홍보 소재를 ${lang}로 작성하세요.\n\n` +
      `[제목] ${title}\n[장르] ${category || '미지정'}\n[설명] ${description || '없음'}\n\n` +
      `다음을 JSON으로만 출력(설명·코드펜스 없이): {"tagline":"한 줄 캐치프레이즈(20자 내외)","caption":"SNS 게시용 2~3문장 홍보문","hashtags":["#태그",...최대 8개]}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[generate-promo] Anthropic 오류', res.status, t);
      return c.json({ error: `생성 실패 (${res.status})` }, 502);
    }
    const data = await res.json();
    const text = (data?.content?.[0]?.text || '').trim();
    let parsed: any = null;
    try { parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')); } catch { /* fall back to raw */ }
    return c.json({ ok: true, result: parsed || { caption: text, tagline: '', hashtags: [] } });
  } catch (error: any) {
    console.error('[generate-promo] 예외:', error);
    return c.json({ error: String(error?.message || error) }, 500);
  }
});

// 공지/게시글 자동 영문 번역 — 운영팀 공식 공지를 영어로 번역해 저장용 {title_en, content_en} 반환.
//   관리자 전용. ANTHROPIC_API_KEY 미설정 시 503 → 호출측은 무시하고 한글만 저장(영문모드 한글 폴백).
app.post("/translate-post", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    if (!accessToken) return c.json({ error: "인증 토큰이 필요합니다." }, 401);
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return c.json({ error: "유효하지 않은 토큰입니다." }, 401);
    const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!prof?.is_admin) return c.json({ error: "관리자만 사용할 수 있습니다." }, 403);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return c.json({ error: "번역 기능이 아직 설정되지 않았습니다. (ANTHROPIC_API_KEY 미설정)" }, 503);

    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title || '').slice(0, 300);
    const content = String(body.content || '').slice(0, 8000);
    if (!title.trim() && !content.trim()) return c.json({ error: "번역할 내용이 없습니다." }, 400);

    const prompt = `You are a professional Korean→English translator for CREAITE, an AI cinema OTT platform. ` +
      `Translate the following official announcement's title and body into natural, fluent English suitable for a product announcement. ` +
      `Keep the brand name "CREAITE" as-is. Preserve emoji, line breaks, bullet symbols (·), and any URLs/emails exactly. ` +
      `For Korean brand names (e.g. 메가커피), use a sensible English brand form (e.g. "Mega Coffee"). Convert ₩ amounts naturally (keep ₩). ` +
      `Output ONLY JSON, no code fence, no commentary: {"title_en":"...","content_en":"..."}\n\n` +
      `[TITLE]\n${title}\n\n[BODY]\n${content}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[translate-post] Anthropic 오류', res.status, t);
      return c.json({ error: `번역 실패 (${res.status})` }, 502);
    }
    const data = await res.json();
    const text = (data?.content?.[0]?.text || '').trim();
    let parsed: any = null;
    try { parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')); } catch { /* raw 파싱 실패 시 아래서 처리 */ }
    if (!parsed?.title_en && !parsed?.content_en) return c.json({ error: "번역 결과 파싱 실패" }, 502);
    return c.json({ ok: true, title_en: parsed.title_en || null, content_en: parsed.content_en || null });
  } catch (error: any) {
    console.error('[translate-post] 예외:', error);
    return c.json({ error: String(error?.message || error) }, 500);
  }
});

app.post("/videos/:videoId/transcribe", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    if (!accessToken) return c.json({ error: "인증 토큰이 필요합니다." }, 401);

    const supabase = getSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return c.json({ error: "유효하지 않은 토큰입니다." }, 401);

    const videoId = c.req.param('videoId');
    if (!videoId || !/^[0-9a-f-]{36}$/i.test(videoId)) {
      return c.json({ error: "올바른 videoId가 필요합니다." }, 400);
    }

    // 소유권 검증 (썸네일과 동일): KV → videos.creator_id → 어드민
    const supabaseAdmin = getSupabaseClient(true);
    let isOwner = false;
    const kvRecord = await kv.get(`video:${videoId}`);
    if (kvRecord?.userId === user.id) {
      isOwner = true;
    } else {
      const { data: videoRow } = await supabaseAdmin
        .from('videos').select('creator_id').eq('id', videoId).maybeSingle();
      if (videoRow?.creator_id === user.id) isOwner = true;
    }
    if (!isOwner) {
      const { data: profile } = await supabaseAdmin
        .from('profiles').select('is_admin').eq('id', user.id).single();
      if (!profile?.is_admin) {
        return c.json({ error: "본인 영상에만 자막을 생성할 수 있습니다." }, 403);
      }
    }

    // U-M5: 정지계정 차단 + 레이트리밋(유료 Bunny transcribe 무제한 재큐잉 어뷰징 방지). create-upload 동일 패턴.
    {
      const { data: _rlProf } = await supabaseAdmin
        .from('profiles').select('is_admin, is_suspended').eq('id', user.id).maybeSingle();
      if (_rlProf?.is_suspended) {
        return c.json({ error: "정지된 계정은 자막을 생성할 수 없습니다." }, 403);
      }
      if (!_rlProf?.is_admin) {
        const { data: _rlOk } = await supabaseAdmin.rpc('rl_hit', {
          p_key: `transcribe:${user.id}`, p_limit: 20, p_window_sec: 3600,
        });
        if (_rlOk === false) {
          return c.json({ error: "자막 생성 요청이 너무 많습니다. 1시간 후 다시 시도해 주세요." }, 429);
        }
      }
    }

    const libraryId = Deno.env.get('BUNNY_LIBRARY_ID');
    const apiKey = Deno.env.get('BUNNY_API_KEY');
    if (!libraryId || !apiKey) {
      return c.json({ error: "Bunny.net 설정이 완료되지 않았습니다." }, 500);
    }

    // 입력: 원본 언어 + 번역 대상 언어들 (ISO 639-1)
    const reqBody = await c.req.json().catch(() => ({}));
    const sourceLanguage: string = (reqBody.sourceLanguage || 'ko').toString().slice(0, 5);
    const targetLanguages: string[] = Array.isArray(reqBody.targetLanguages)
      ? reqBody.targetLanguages.filter((l: any) => typeof l === 'string').slice(0, 10)
      : [];

    const bunnyRes = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}/transcribe`,
      {
        method: 'POST',
        headers: { 'AccessKey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceLanguage, targetLanguages }),
      }
    );

    if (!bunnyRes.ok) {
      const text = await bunnyRes.text().catch(() => '');
      console.error('Bunny transcribe failed:', bunnyRes.status, text);
      // 401/403: 라이브러리에 자막(transcription) 기능 미활성 가능성
      const hint = (bunnyRes.status === 401 || bunnyRes.status === 403)
        ? " (Bunny 라이브러리의 Transcription 기능이 켜져 있는지 확인하세요)" : "";
      return c.json({ error: `자막 생성 요청 실패 (${bunnyRes.status})${hint}` }, 502);
    }

    // 완료는 비동기(수 분). 메타데이터에 자막 언어 표시 + 캡션 VTT URL 기록(완료 후 유효).
    const captionUrl = `https://${BUNNY_CDN_HOST}/${videoId}/captions/${sourceLanguage}.vtt`;
    await supabaseAdmin.from('videos')
      .update({ subtitle_language: sourceLanguage, subtitle_url: captionUrl })
      .eq('id', videoId);

    return c.json({ ok: true, queued: true, sourceLanguage, targetLanguages });
  } catch (error) {
    console.error('자막 생성 중 에러:', error);
    return c.json({ error: `자막 생성 중 오류: ${error.message}` }, 500);
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

    // 소유권/권한 검증 (#3·#4-b): 이 videoId 가 호출자 소유(create-upload 로 생성했거나 기존 본인 영상)이거나
    // 관리자여야 메타 저장 허용. 없으면 타인 videoId 로 메타 덮어쓰기·소유권 탈취 가능.
    const { data: _prof } = await supabaseAdmin.from('profiles').select('is_admin, display_name').eq('id', user.id).maybeSingle();
    const isAdmin = !!_prof?.is_admin;
    if (!isAdmin) {
      const ownerKv: any = await kv.get(`video:${videoId}`);
      let ownerId: string | undefined = ownerKv?.userId;
      if (!ownerId) {
        const { data: _vid } = await supabaseAdmin.from('videos').select('creator_id').eq('id', videoId).maybeSingle();
        ownerId = (_vid as any)?.creator_id ?? undefined;
      }
      if (!ownerId || ownerId !== user.id) {
        return c.json({ error: "이 영상에 대한 권한이 없습니다." }, 403);
      }
    }

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

    // 3분(180초) 미만은 판매 불가 — 클라 UI 게이트(Upload.tsx)뿐 아니라 서버에서도 강제(API 직접호출 우회 차단)
    const parseDurationSec = (d: string): number => {
      const parts = String(d || '').split(':').map((n) => parseInt(n, 10));
      if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return 0;
      return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    };
    const clientDurationSec = parseDurationSec(metadata.duration);
    // U1(2026-07-05): 클라 duration 을 신뢰하지 않음 — Bunny 가 보고한 실제 length(초) 우선.
    //   인코딩 완료 전이면 length=0 → 클라값 폴백(완전 차단은 Bunny 인코딩완료 웹훅 필요, 후속).
    //   Bunny 값이 있으면 duration_seconds 를 명시 저장해 트리거가 위조 문자열에서 재파생하지 못하게 함.
    let bunnyLenSec = 0;
    try {
      const _lib = Deno.env.get('BUNNY_LIBRARY_ID'); const _key = Deno.env.get('BUNNY_API_KEY');
      if (_lib && _key) {
        const _bv = await fetch(`https://video.bunnycdn.com/library/${_lib}/videos/${videoId}`, { headers: { AccessKey: _key, accept: 'application/json' } });
        if (_bv.ok) { const _bj = await _bv.json(); if (Number(_bj?.length) > 0) bunnyLenSec = Math.round(Number(_bj.length)); }
      }
    } catch (_e) { console.warn('[save-metadata] Bunny length 조회 실패:', _e); }
    const durationSec = bunnyLenSec > 0 ? bunnyLenSec : clientDurationSec;
    // U2(2026-07-05): 가격 서버검증 — 음수·NaN 은 0, ₩1억 상한 클램프. 180초 미만은 판매불가(0).
    const MAX_PRICE = 100000000;
    const rawPriceNum = parseInt(metadata.standardPrice || "0", 10);
    const boundedPrice = (Number.isFinite(rawPriceNum) && rawPriceNum >= 0) ? Math.min(rawPriceNum, MAX_PRICE) : 0;
    const safePrice = (durationSec > 0 && durationSec < 180) ? 0 : boundedPrice;

    // M4(2026-07-07): 챌린지 태그 서버검증 — 마감/미존재 챌린지 출품, 1인 3편 초과, 위조 슬러그 차단.
    //   업로드 자체는 막지 않고 '무효한 challenge:* 태그만' 제거(비챌린지 태그·정상 챌린지 태그는 유지).
    let validatedTags: string[] = (metadata.tags || "").split(',').map((t: string) => t.trim()).filter((t: string) => t !== "");
    const challengeTags = validatedTags.filter((t: string) => t.startsWith('challenge:'));
    if (challengeTags.length > 0) {
      const today = new Date().toISOString().slice(0, 10);  // 'YYYY-MM-DD' (challenges.starts_at/deadline 은 DATE)
      const okChallengeTags: string[] = [];
      for (const ct of challengeTags) {
        const slug = ct.slice('challenge:'.length);
        // ① 존재 + 현재 오픈(starts_at <= today <= deadline) 여부
        const { data: ch } = await supabaseAdmin
          .from('challenges')
          .select('tag')
          .eq('tag', slug)
          .lte('starts_at', today)
          .gte('deadline', today)
          .maybeSingle();
        if (!ch) continue;  // 미존재/마감/오픈전 → 태그 제거
        // ② 1인 최대 3편 (재업로드/수정 대비 자기 영상 제외)
        const { count } = await supabaseAdmin
          .from('videos')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', user.id)
          .contains('tags', [ct])
          .neq('id', videoId);
        if ((count ?? 0) >= 3) continue;  // 초과 출품 → 태그 제거
        okChallengeTags.push(ct);
      }
      validatedTags = validatedTags.filter((t: string) => !t.startsWith('challenge:')).concat(okChallengeTags);
    }

    // 히어로 클립: Bunny GUID(heroClipId)를 KV 소유권으로 검증 → 본인이 create-upload 로 만든 클립만.
    //   URL 은 GUID 로 서버 재구성(클라 문자열 불신). status='pending' → 웹훅/폴백이 실제 프레임 검수.
    let heroClipId: string | null = null;
    let heroClipUrl: string | null = null;
    if (metadata.heroClipId && /^[0-9a-f-]{36}$/i.test(metadata.heroClipId)) {
      const kvClip = await kv.get(`video:${metadata.heroClipId}`);
      if (kvClip?.userId === user.id) {
        heroClipId = metadata.heroClipId;
        heroClipUrl = `https://${BUNNY_CDN_HOST}/${heroClipId}/playlist.m3u8`;
      }
    }

    const { error: dbError } = await supabaseAdmin
      .from('videos')
      .upsert({
        id: videoId,
        title: metadata.title || 'Untitled',
        description: metadata.description || '',
        // 프로필 표시이름(display_name) 우선 — OAuth user_metadata.name(예: 'crebiz크레비즈')이 아니라
        // 사용자가 CREAITE 에서 설정한 이름(예: '크리에잇')으로 저장 (표시 일관성)
        creator: _prof?.display_name || user.user_metadata?.name || user.email?.split('@')[0],
        creator_id: user.id,
        // U-HIGH1: 재생·표시 URL 을 클라 입력(hlsUrl/thumbnailUrl)이 아니라 videoId(=Bunny GUID)로
        //   서버 재구성 — 검수대상(GUID 실제 프레임) ≠ 노출대상(클라 임의 URL) 우회 차단.
        thumbnail: `https://${BUNNY_CDN_HOST}/${videoId}/thumbnail.jpg`,
        video_url: `https://${BUNNY_CDN_HOST}/${videoId}/playlist.m3u8`,
        // U-HIGH2: 신규 업로드는 upsert 시점부터 숨김(검수 통과 전). 별도 후속 UPDATE(레이스+fail-open) 제거.
        //   save-metadata 는 업로드 전용(편집은 VideoEditModal 직접 update)이라 재숨김 부작용 없음.
        is_hidden: true,
        duration: metadata.duration || '0:00',
        // U1: Bunny 실제 length 있으면 명시 저장(트리거 재파생 차단). 없으면 null → 트리거가 문자열서 파생(폴백).
        duration_seconds: bunnyLenSec > 0 ? bunnyLenSec : null,
        views: "0",
        likes: 0,
        tags: validatedTags,  // M4: 챌린지 태그 서버검증 통과분만 (위 검증 블록 참조)
        // All-in-One 단일가: price_standard 만 사용. price_commercial/exclusive 는
        // stale 컬럼(어디서도 안 읽힘) — NOT NULL 안전을 위해 standard 와 동일값 유지. schema cleanup 시 DROP 예정.
        price_standard: safePrice,
        price_commercial: safePrice,
        price_exclusive: safePrice,
        ai_tool: metadata.aiTool || '',
        category: metadata.category || '',
        genre: metadata.genre || '',
        // U-M3: 서버 화이트리스트(19/junk 차단, 광고정책). 안전필드라 폴백은 최상위가 아닌
        //   최대 제한('15')으로 — 잘못된 값이 전체관람가(all)로 열리지 않게(청소년보호 방향).
        age_rating: ['all', '13', '15'].includes(metadata.age_rating) ? metadata.age_rating : '15',
        prompt: metadata.prompt || '',
        // status 서버 화이트리스트(임의 문자열 주입 차단). 알 수 없는 값은 'ready'.
        status: ['ready', 'processing', 'draft'].includes(metadata.status) ? metadata.status : 'ready',
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
        subtitle_url: safeHttpUrl(metadata.subtitleUrl) || null,  // U-M6: http(s)만
        // 공개 설정
        visibility: ['public', 'unlisted', 'private'].includes(metadata.visibility) ? metadata.visibility : 'public',
        // 라이선스/출처 (어드민 시드 콘텐츠용) — 비관리자는 서버에서 기본값 강제(#4-b). 클라 게이트만 믿지 않음.
        license_type: (isAdmin && ['original', 'cc0', 'cc-by', 'cc-by-sa', 'public-domain'].includes(metadata.licenseType)) ? metadata.licenseType : 'original',
        license_source_url: isAdmin ? (metadata.licenseSourceUrl || '') : '',
        attribution: isAdmin ? (metadata.attribution || '') : '',
        original_creator: isAdmin ? (metadata.originalCreator || '') : '',
        // 하이라이트 구간
        highlight_start: highlightStartNum,
        highlight_end: highlightEndNum,
        // OTT 히어로 미리보기 클립(30초 MP4, hero-clips 버킷). 있으면 히어로가 0초부터 네이티브 재생(선명).
        //   딥 seek 화질고착 회피용. http(s) 만 저장(safeHttpUrl). 없으면 null → 풀영상 폴백.
        // 히어로 클립(방식 C): Bunny GUID + 검수 대기. Ott 는 hero_clip_status='passed' 만 재생.
        hero_clip_id: heroClipId,
        hero_clip_url: heroClipUrl,
        hero_clip_status: heroClipId ? 'pending' : 'none',
        // Phase 28: Sponsorship
        sponsor_brand: metadata.sponsorBrand || null,
        // U-M6: 이미지 src·클릭 링크는 http(s) 스킴만(javascript:/data: 저장형 XSS·피싱 차단)
        sponsor_logo_url: safeHttpUrl(metadata.sponsorLogoUrl) || null,
        sponsor_disclosure: metadata.sponsorDisclosure || null,
        sponsor_link_url: safeHttpUrl(metadata.sponsorLinkUrl) || null,
      });

    if (dbError) {
      console.error('DB 저장 에러:', dbError);
      // KV는 성공했으므로 일단 진행할 수도 있지만, 정석은 에러 반환
      return c.json({ error: `DB 저장 실패: ${dbError.message}` }, 500);
    }

    // (숨김은 위 upsert 의 is_hidden:true 로 원자적 처리 — 별도 UPDATE 제거)

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
// 광고 이벤트 집계 (ad-fraud 방어 — Edge 경유)
// ============================================
// 클라가 raw RPC(increment_ad_*, record_ad_*) 대신 이 엔드포인트 호출.
// 신뢰 IP + 로그인 식별(auth.uid) + IP 다양성 레이트리밋 후 service_role 로 집계 RPC 실행.
// (raw RPC 는 ad_fraud_hardening_edge_20260628.sql 로 anon 회수됨 → 클라 직접호출 불가)
app.post("/ad-event", async (c: any) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { ad_id, type, video_id, format, position_seconds, completed, skipped, viewer_key } = body || {};
    if (!ad_id || !type) return c.json({ error: "ad_id, type required" }, 400);
    const VALID = ["feed_impression", "feed_click", "video_impression", "video_click"];
    if (!VALID.includes(type)) return c.json({ error: "invalid type" }, 400);

    const supabaseAdmin = getSupabaseClient(true);

    // 식별키: 로그인 = auth.uid(위조 불가) → 'u:'+uid, 익명 = 클라 세션키 → 'a:'+key
    let key: string | null = null;
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (token) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) key = "u:" + user.id;
      } catch { /* 익명 폴백 */ }
    }
    if (!key) {
      const sk = String(viewer_key || "").trim();
      if (sk) key = "a:" + sk;
    }
    if (!key) return c.json({ status: "nokey" });  // 식별 불가 → 집계 skip(과금 안전)

    const ip = (c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "").split(",")[0].trim() || null;

    // IP 다양성 레이트리밋(익명 키회전 차단). 로그인('u:')은 통과. 가드 오류는 fail-open.
    try {
      const { data: ok } = await supabaseAdmin.rpc("ad_event_guard", { p_ad_id: ad_id, p_viewer_key: key, p_ip: ip });
      if (ok === false) return c.json({ status: "ratelimited" });
    } catch (e) { console.error("ad_event_guard 에러:", e); }

    // 기존 과금 RPC를 service_role 로 호출(식별키를 p_viewer_key 로 전달 → 내부 dedup/과금 정합)
    if (type === "feed_impression") {
      await supabaseAdmin.rpc("increment_ad_impressions", { ad_id, p_viewer_key: key, p_video_id: video_id || null });
    } else if (type === "feed_click") {
      await supabaseAdmin.rpc("increment_ad_clicks", { ad_id, p_viewer_key: key });
    } else if (type === "video_impression") {
      await supabaseAdmin.rpc("record_ad_impression", {
        p_ad_id: ad_id, p_video_id: video_id, p_format: format || "preroll",
        p_position_seconds: position_seconds ?? null, p_completed: completed ?? false,
        p_skipped: skipped ?? false, p_viewer_key: key,
      });
    } else if (type === "video_click") {
      // #4(2026-07-08): viewer_key 전달 → (광고,뷰어,1시간) dedup (클릭 인플레이션 차단)
      await supabaseAdmin.rpc("record_ad_click", { p_ad_id: ad_id, p_video_id: video_id, p_format: format || "preroll", p_viewer_key: key });
    }
    return c.json({ status: "ok" });
  } catch (e: any) {
    console.error("ad-event 에러:", e);
    return c.json({ error: "ad-event 처리 오류" }, 500);
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

// M9: VAST 트래킹 픽셀 서명 — 무인증 픽셀의 위조/스팸 차단.
//   sig = HMAC-SHA256(service_role_key, "adId.videoId.exp")[:32]. exp 만료 시 무효.
//   서버가 생성한 태그만 유효한 sig 를 가지므로 외부에서 임의 ad_id 위조 불가.
async function vastSign(adId: string, videoId: string, exp: number): Promise<string> {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'creaite-vast';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${adId}.${videoId}.${exp}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
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
    const vastExp = Math.floor(Date.now() / 1000) + 30 * 60; // 30분 유효(반복 GET 재과금 창 단축, ad-fraud)
    const vastSig = await vastSign(ad.id, sourceVideoId || '', vastExp);
    const trackParams = new URLSearchParams({
      ad_id: ad.id,
      source_video_id: sourceVideoId,
      exp: String(vastExp),
      sig: vastSig,
    });

    // VAST XML 인젝션 방지: CDATA 탈출(]]>) 무력화 + 클릭링크 http(s) 제한 (광고주 셀프서비스 입력)
    const cd = (v: any) => String(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
    const safeLink = /^https?:\/\//i.test(String(ad.link_url || '')) ? ad.link_url : '#';

    // VAST 2.0 XML 생성
    const vastXml = `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="2.0">
  <Ad id="${ad.id}">
    <InLine>
      <AdSystem>CREAITE House Ads</AdSystem>
      <AdTitle><![CDATA[${cd(ad.title || 'Advertisement')}]]></AdTitle>
      <Description><![CDATA[${cd(ad.advertiser || '')}]]></Description>
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
              <ClickThrough><![CDATA[${cd(safeLink)}]]></ClickThrough>
              <ClickTracking><![CDATA[${trackBase}?${trackParams}&event=click]]></ClickTracking>
            </VideoClicks>
            <MediaFiles>
              ${ad.video_url && ad.video_url.includes('/playlist.m3u8') ? `
              <MediaFile delivery="progressive" type="video/mp4" width="1280" height="720">
                <![CDATA[${cd(ad.video_url.replace('/playlist.m3u8', '/play_720p.mp4'))}]]>
              </MediaFile>` : ''}
              <MediaFile delivery="streaming" type="application/x-mpegURL" width="1920" height="1080">
                <![CDATA[${cd(ad.video_url)}]]>
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

    // M9: 서명·만료 검증 — 위조/스팸 트래킹 차단 (실패 시 픽셀은 응답하되 기록 안 함)
    const exp = parseInt(c.req.query('exp') || '0', 10);
    const sig = c.req.query('sig') || '';
    const sigValid = !!sig && exp > Math.floor(Date.now() / 1000) &&
      (await vastSign(adId || '', sourceVideoId || '', exp)) === sig;

    if (adId && event && sigValid) {
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

    // P2(2026-07-05): 호출자 인증 + 소유자 바인딩 — orderId/paymentKey 는 토스 리다이렉트 URL 에
    //   노출되므로, 유출 시 타인이 이 엔드포인트로 피해자 결제를 confirm 하는 걸 차단(빌링 핸들러와 동일).
    //   ⚠️ 변수명 reqAuthHeader — 아래 토스 API 용 authHeader(Basic)와 충돌 방지.
    const reqAuthHeader = c.req.header('Authorization');
    const accessToken = reqAuthHeader?.replace('Bearer ', '');
    if (!accessToken) return c.json({ error: '로그인이 필요합니다' }, 401);
    const authClient = getSupabaseClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser(accessToken);
    if (authErr || !user) return c.json({ error: '인증 실패' }, 401);

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

    // P2: 결제 소유자와 호출자 일치 확인 (paymentKey 유출돼도 남의 결제 승인 불가)
    if (paymentRow.user_id !== user.id) {
      console.error('[toss-confirm] 소유자 불일치:', { orderId, owner: paymentRow.user_id, caller: user.id });
      return c.json({ error: '본인 결제만 승인할 수 있습니다' }, 403);
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
      body: JSON.stringify({ orderId, paymentKey, amount: Number(paymentRow.amount) }),  // M2: 클라값 아닌 저장금액을 단일 출처로
    });

    const tossBody = await tossRes.json();

    if (!tossRes.ok) {
      // C1: 동시 confirm 레이스 등으로 토스에서 이미 승인된 결제 → 실패로 뒤집지 말고 성공 처리.
      //   confirm_payment 는 멱등(completed 면 no-op)이라 안전.
      if (tossBody?.code === 'ALREADY_PROCESSED_PAYMENT') {
        await supabase.rpc('confirm_payment', {
          p_order_id: orderId, p_payment_key: paymentKey,
          p_method: '카드', p_approved_at: new Date().toISOString(), p_raw_response: tossBody,
        });
        return c.json({ success: true, message: '이미 처리된 결제입니다', alreadyProcessed: true });
      }
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
      amount: Number(paymentRow.amount),
      method: tossBody?.method,
      paymentType: paymentRow.payment_type,   // M5: 클라가 orderId 파싱 대신 이걸 쓰도록
    });
  } catch (err: any) {
    console.error('[toss-confirm] 예외:', err);
    return c.json({ error: '결제 승인 처리 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// 자동결제(빌링) — 카드 등록 후 빌링키 발급 + 첫 결제 (2026-06-12)
// 호출: POST /server/billing-auth-confirm  { authKey, customerKey }
// ============================================
app.post('/billing-auth-confirm', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.replace('Bearer ', '');
    if (!accessToken) return c.json({ error: '로그인이 필요합니다' }, 401);
    const authClient = getSupabaseClient();
    const { data: { user }, error: authErr } = await authClient.auth.getUser(accessToken);
    if (authErr || !user) return c.json({ error: '인증 실패' }, 401);

    const { authKey, customerKey } = await c.req.json();
    if (!authKey || !customerKey) return c.json({ error: 'authKey, customerKey 필요' }, 400);
    if (customerKey !== user.id) return c.json({ error: 'customerKey 불일치' }, 400);

    // B-2(2026-07-08): 결제 게이트 — 토스 live 키 전환 전(payments_enabled=0)엔 구독 결제 차단.
    //   테스트 키 상태에선 카드 등록이 실청구 없이 성공 → 진짜 프리미엄 +30일 무상 부여 +
    //   가짜 수납액이 M1 구독 풀(실수납 기준 정산)에 산입되는 원장 오염을 서버 단에서 차단.
    //   설정 행이 없으면 기본 허용(fail-open) — live 전환 후 행을 지워도 결제가 안 죽게.
    try {
      const { data: payGate } = await getSupabaseClient(true).rpc('get_platform_setting', { p_key: 'payments_enabled' });
      if (payGate !== null && payGate !== undefined && Number(payGate) < 1) {
        return c.json({ error: '결제 기능 준비 중입니다. 정식 오픈 후 이용해 주세요.' }, 503);
      }
    } catch { /* 설정 조회 실패는 fail-open (기존 동작 유지) */ }

    // P5(2026-07-05): 이미 활성 프리미엄이면 첫 결제 재실행 금지(정기 갱신은 billing-run 담당).
    //   기존 3분 시간창 대신 "현재 프리미엄?" 판정 → 느린복귀/재등록으로 인한 이중 빌링키·이중 +30일 차단.
    const idemClient = getSupabaseClient(true);
    const { data: prof } = await idemClient.from('profiles')
      .select('subscription_tier, subscription_expires_at').eq('id', user.id).maybeSingle();
    const stillPremium = prof?.subscription_tier === 'premium'
      && !!prof?.subscription_expires_at && new Date(prof.subscription_expires_at).getTime() > Date.now();
    if (stillPremium) {
      return c.json({ success: true, message: '이미 프리미엄 구독 중입니다.', idempotent: true });
    }

    const tossSecretKey = Deno.env.get('TOSS_SECRET_KEY');
    if (!tossSecretKey) return c.json({ error: '결제 서버 설정 오류 (관리자 문의)' }, 500);
    const authBasic = `Basic ${btoa(tossSecretKey + ':')}`;

    // 1) authKey → billingKey 발급
    const issueRes = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
      method: 'POST',
      headers: { 'Authorization': authBasic, 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey, customerKey }),
    });
    const issueBody = await issueRes.json();
    if (!issueRes.ok || !issueBody?.billingKey) {
      console.error('[billing] 빌링키 발급 실패:', issueBody);
      return c.json({ error: issueBody?.message || '카드 등록 실패', code: issueBody?.code }, 400);
    }
    const billingKey = issueBody.billingKey;

    // 2) 금액 (정책) — 폴백도 현재가(얼리버드 2,900)와 일치시켜, 설정 조회 실패 시 과청구 방지
    let amount = 2900;
    try {
      const { data } = await getSupabaseClient(true).rpc('get_platform_setting', { p_key: 'subscription_price_krw' });
      if (data && Number(data) > 0) amount = Number(data);
    } catch { /* 기본값 */ }

    // 3) 첫 결제 (빌링키로 즉시 청구) — P3: 결정적 orderId(유저+일자) + Idempotency-Key 로 동시/재제출 이중청구 차단
    const orderId = `sub_${user.id.slice(0, 8)}_first_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const chargeRes = await fetch(`https://api.tosspayments.com/v1/billing/${billingKey}`, {
      method: 'POST',
      headers: { 'Authorization': authBasic, 'Content-Type': 'application/json', 'Idempotency-Key': orderId },
      body: JSON.stringify({ customerKey, amount, orderId, orderName: 'CREAITE 프리미엄 구독 (자동결제)', customerEmail: user.email }),
    });
    const chargeBody = await chargeRes.json();
    if (!chargeRes.ok) {
      console.error('[billing] 첫 결제 실패:', chargeBody);
      return c.json({ error: chargeBody?.message || '결제 실패', code: chargeBody?.code }, 400);
    }
    const card = chargeBody?.card || issueBody?.card || {};
    const cardLast4 = (card?.number || '').replace(/[^0-9]/g, '').slice(-4) || null;

    // 4) DB 반영 (구독 +30일 + billing 저장)
    const { error: applyErr } = await getSupabaseClient(true).rpc('billing_apply_charge', {
      p_user_id: user.id, p_billing_key: billingKey, p_customer_key: customerKey,
      p_card_company: card?.company || null, p_card_last4: cardLast4, p_amount: amount,
      p_order_id: orderId, p_payment_key: chargeBody?.paymentKey || null,
      p_approved_at: chargeBody?.approvedAt || new Date().toISOString(), p_raw: chargeBody,
    });
    if (applyErr) {
      // P4: 토스 첫 결제 성공 + DB 반영 실패 → 청구 취소(void)해 "돈만 나가고 미부여" 방지.
      console.error('[billing] billing_apply_charge 실패, 토스 취소 시도:', applyErr);
      try {
        if (chargeBody?.paymentKey) await fetch(`https://api.tosspayments.com/v1/payments/${chargeBody.paymentKey}/cancel`, {
          method: 'POST', headers: { 'Authorization': authBasic, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cancelReason: 'DB 반영 실패 자동 취소' }),
        });
      } catch (ve) { console.error('[billing] 토스 취소 실패(수동조치 필요):', ve); }
      return c.json({ error: '결제 처리에 실패해 취소되었습니다. 다시 시도해 주세요.' }, 500);
    }

    return c.json({ success: true, message: '자동결제가 설정되고 첫 결제가 완료되었습니다.', cardLast4 });
  } catch (err: any) {
    console.error('[billing-auth-confirm] 예외:', err);
    return c.json({ error: '자동결제 설정 중 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// 자동결제 정기 청구 (스케줄러 전용) — 2026-06-12
// 호출: POST /server/billing-run  헤더 x-cron-secret: <BILLING_CRON_SECRET>
// ============================================
app.post('/billing-run', async (c) => {
  try {
    const secret = c.req.header('x-cron-secret');
    const expected = Deno.env.get('BILLING_CRON_SECRET');
    if (!expected || secret !== expected) return c.json({ error: 'unauthorized' }, 401);

    const tossSecretKey = Deno.env.get('TOSS_SECRET_KEY');
    if (!tossSecretKey) return c.json({ error: 'TOSS_SECRET_KEY 미설정' }, 500);
    const authBasic = `Basic ${btoa(tossSecretKey + ':')}`;
    const admin = getSupabaseClient(true);

    // 만료 1일 전부터 청구 (구독 공백 방지)
    const dueBefore = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // N3: 원자적 claim(FOR UPDATE SKIP LOCKED) — cron 동시실행 시 이중청구 방지
    const { data: due, error } = await admin
      .rpc('billing_claim_due', { p_limit: 200, p_due_before: dueBefore });
    if (error) return c.json({ error: error.message }, 500);

    let ok = 0, fail = 0;
    for (const sub of (due || [])) {
      // P3: 주기 결정적 orderId — 같은 주기 재시도는 동일 orderId → 토스 Idempotency-Key +
      //   payments.order_id 로 재청구 차단(토스성공+apply실패/크래시 시 같은달 이중청구 방지).
      const period = String(sub.next_charge_at || '').slice(0, 10).replace(/-/g, '')
        || new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderId = `sub_${sub.user_id.slice(0, 8)}_${period}`;
      try {
        const res = await fetch(`https://api.tosspayments.com/v1/billing/${sub.billing_key}`, {
          method: 'POST',
          headers: { 'Authorization': authBasic, 'Content-Type': 'application/json', 'Idempotency-Key': orderId },
          body: JSON.stringify({ customerKey: sub.customer_key, amount: sub.amount, orderId, orderName: 'CREAITE 프리미엄 구독 (자동결제)' }),
        });
        const body = await res.json();
        if (!res.ok) {
          await admin.rpc('billing_mark_failed', { p_user_id: sub.user_id, p_reason: body?.message || body?.code || 'charge failed' });
          fail++; continue;
        }
        const card = body?.card || {};
        const { error: applyErr } = await admin.rpc('billing_apply_charge', {
          p_user_id: sub.user_id, p_billing_key: sub.billing_key, p_customer_key: sub.customer_key,
          p_card_company: card?.company || null, p_card_last4: (card?.number || '').replace(/[^0-9]/g, '').slice(-4) || null,
          p_amount: sub.amount, p_order_id: orderId, p_payment_key: body?.paymentKey || null,
          p_approved_at: body?.approvedAt || new Date().toISOString(), p_raw: body,
        });
        if (applyErr) {
          // P4: 토스 청구 성공 + DB 반영 실패 → 청구 취소(void)해 "돈만 나가고 미부여" 방지. 다음 cron 이 깨끗이 재시도.
          console.error('[billing-run] apply 실패, 토스 취소 시도:', sub.user_id, applyErr);
          try {
            if (body?.paymentKey) await fetch(`https://api.tosspayments.com/v1/payments/${body.paymentKey}/cancel`, {
              method: 'POST', headers: { 'Authorization': authBasic, 'Content-Type': 'application/json' },
              body: JSON.stringify({ cancelReason: 'DB 반영 실패 자동 취소' }),
            });
          } catch (ve) { console.error('[billing-run] 토스 취소 실패(수동조치 필요):', ve); }
          fail++; continue;
        }
        ok++;
      } catch (e: any) {
        await admin.rpc('billing_mark_failed', { p_user_id: sub.user_id, p_reason: e?.message || 'exception' });
        fail++;
      }
    }
    return c.json({ success: true, charged: ok, failed: fail, total: (due || []).length });
  } catch (err: any) {
    console.error('[billing-run] 예외:', err);
    return c.json({ error: String(err?.message || err) }, 500);
  }
});

// ============================================
// 계정 삭제 30일 경과 영구 파기 (스케줄러 전용) — 2026-06-14
// 호출: POST /server/purge-deletions  헤더 x-cron-secret: <BILLING_CRON_SECRET>
//   profiles.deletion_requested_at <= now()-30d 대상 → auth.admin.deleteUser(id).
//   profiles.id REFERENCES auth.users(id) ON DELETE CASCADE 이므로 auth.users 삭제 시
//   profiles 및 연관 사용자 데이터가 CASCADE로 일괄 정리됨 (개인정보 파기 의무 충족).
//   ※ SQL의 purge_pending_deletions 는 auth.uid() 어드민 가드가 있어 cron 호출 불가 →
//     자동 파기는 이 엔드포인트가 담당. (어드민 수동 호출용으로 SQL 함수는 그대로 보존)
// ============================================
app.post('/purge-deletions', async (c) => {
  try {
    const secret = c.req.header('x-cron-secret');
    const expected = Deno.env.get('BILLING_CRON_SECRET');
    if (!expected || secret !== expected) return c.json({ error: 'unauthorized' }, 401);

    const admin = getSupabaseClient(true);
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 30일+ 경과한 삭제 요청자 (한 번에 최대 100건 — 폭주 방지, 매일 반복 처리)
    const { data: targets, error } = await admin
      .from('profiles')
      .select('id')
      .not('deletion_requested_at', 'is', null)
      .lte('deletion_requested_at', threshold)
      .limit(100);
    if (error) return c.json({ error: error.message }, 500);

    let ok = 0, fail = 0;
    for (const t of (targets || [])) {
      try {
        // auth.users 삭제 → FK CASCADE 로 profiles·연관 데이터 일괄 파기
        const { error: delErr } = await admin.auth.admin.deleteUser(t.id);
        if (delErr) { console.error('[purge-deletions] deleteUser 실패', t.id, delErr.message); fail++; continue; }
        ok++;
      } catch (e: any) {
        console.error('[purge-deletions] 예외', t.id, e?.message || e); fail++;
      }
    }
    return c.json({ success: true, purged: ok, failed: fail, total: (targets || []).length });
  } catch (err: any) {
    console.error('[purge-deletions] 예외:', err);
    return c.json({ error: String(err?.message || err) }, 500);
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
    // 복제(spread) — 아래 new_follower 개인화에서 body/link 를 변형해도 모듈 공유 INAPP 가 오염되지 않게.
    const inapp = { ...(INAPP[type] || { type: 'system', body: '탭하여 확인하세요', link: '/' }) };

    // H1-2(2026-06-25): actor 타입(타 사용자에게 가는 알림)은 클라 subject/html/link 를 신뢰하지 않음 →
    //   서버 템플릿으로 고정(신뢰 도메인 mail.creaite.net 피싱 차단). self(본인)·admin(신뢰) 타입만 클라 콘텐츠 사용.
    const isActor = !SELF_TYPES.includes(type) && !ADMIN_TYPES.includes(type);

    // N1/N2: new_follower 는 actor(=팔로워=인증된 caller)를 서버가 알고 있으므로, 팔로워 이름/채널
    //   딥링크를 서버가 직접 구성한다(클라 link/html 불신 유지 → 피싱 안전). 동시에 최근 동일 팔로워
    //   알림이 있으면 전체 스킵(언팔→재팔 반복 스팸 디듀프). 링크에 actor id 를 심어 그걸로 디듀프.
    if (isActor && type === 'new_follower') {
      const { data: actorProf } = await supabase
        .from('profiles').select('display_name').eq('id', callerId).maybeSingle();
      const followerName = String(actorProf?.display_name || '').slice(0, 30) || '누군가';
      inapp.body = `${followerName}님이 회원님을 팔로우하기 시작했어요`;
      inapp.link = `/?tab=channel&creator=${callerId}`;   // 팔로워 채널 직행(서버구성이라 안전)

      const { data: recentDup } = await supabase
        .from('notifications').select('id')
        .eq('user_id', user_id)
        .ilike('link', `%creator=${callerId}%`)
        .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(1);
      if (recentDup && recentDup.length > 0) {
        return c.json({ success: true, skipped: true, reason: 'duplicate new_follower within 24h' });
      }
    }

    const ACTOR_SUBJECT: Record<string, string> = {
      comment_reply:           'CREAITE — 새 답글이 달렸어요',
      new_follower:            'CREAITE — 새 팔로워가 생겼어요',
      new_video_from_followed: 'CREAITE — 팔로우한 채널의 새 영상',
    };
    const escEmail = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const buildSafeEmail = (titleText: string, bodyText: string, ctaPath: string) => {
      const url = `https://www.creaite.net${ctaPath.startsWith('/') ? ctaPath : '/' + ctaPath}`;
      return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
        <div style="max-width:560px;margin:0 auto;padding:32px 24px;color:#e5e7eb;">
          <div style="font-weight:900;font-size:20px;color:#a78bfa;margin-bottom:24px;">CREAITE</div>
          <h1 style="font-size:20px;color:#fff;margin:0 0 16px;">${escEmail(titleText)}</h1>
          <div style="font-size:14px;line-height:1.7;color:#d1d5db;">${escEmail(bodyText)}</div>
          <div style="margin:24px 0;"><a href="${escEmail(url)}" style="display:inline-block;background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;">확인하기</a></div>
          <hr style="border:none;border-top:1px solid #262626;margin:28px 0;">
          <div style="font-size:11px;color:#6b7280;line-height:1.6;">이 메일은 CREAITE 활동 알림입니다. <a href="https://www.creaite.net/?tab=mypage&section=settings" style="color:#a78bfa;">알림 설정</a>에서 끌 수 있어요.</div>
        </div></body></html>`;
    };
    // actor=서버 고정값, self·admin=클라값
    const emailSubject = isActor ? (ACTOR_SUBJECT[type] || 'CREAITE 알림') : subject;
    const emailHtml    = isActor ? buildSafeEmail(emailSubject, inapp.body, inapp.link) : html;
    const inappTitle = isActor
      ? (ACTOR_SUBJECT[type] || 'CREAITE 알림')
      : String(subject || '').replace(/^\[CREAITE\]\s*/, '').slice(0, 200);
    // 인앱/푸시 link: actor 타입도 same-origin 상대경로(/로 시작, //·/\ 아님) 클라 링크는 허용.
    //   (App.handleNotificationNavigate 가 화이트리스트 파라미터만 추출 → 외부이동 불가라 피싱 무관.
    //    이메일 html 만 서버고정 유지.) new_follower 는 위에서 서버구성한 inapp.link 우선.
    const isSafeRelLink = (l: unknown): l is string => typeof l === 'string' && /^\/(?![/\\])/.test(l);
    const inappLink = isActor
      ? (type === 'new_follower' ? inapp.link : (isSafeRelLink(clientLink) ? clientLink.slice(0, 500) : inapp.link))
      : ((typeof clientLink === 'string' && clientLink) ? clientLink.slice(0, 500) : inapp.link);

    // MED-1: comment_reply/new_video_from_followed 표적 스팸 방지 — 동일 수신자·동일 link 10초 내
    //   중복이면 벨/이메일 모두 생략. 정당한 연속 알림은 link(video/creator id)가 달라 대부분 보존.
    //   (new_follower 는 위에서 24h 디듀프로 별도 처리.)
    if (isActor && type !== 'new_follower' && inappLink && inappLink !== '/') {
      const { data: recentDup } = await supabase
        .from('notifications').select('id')
        .eq('user_id', user_id)
        .eq('link', inappLink)
        .gte('created_at', new Date(Date.now() - 10 * 1000).toISOString())
        .limit(1);
      if (recentDup && recentDup.length > 0) {
        return c.json({ success: true, skipped: true, reason: 'duplicate actor notification within 10s' });
      }
    }

    // ── 벨(in-app): inapp 게이트 후 기록 (설정에서 이 타입 벨을 끄면 스킵) ──
    //    inapp_<type> opt-out 컬럼 없는 타입은 should_send 가 fail-open=true 반환(발송 유지).
    const { data: bellOn, error: bellErr } = await supabase.rpc('should_send_notification',
      { p_user_id: user_id, p_type: type, p_channel: 'inapp' });
    if (bellErr) console.warn('[send-email] 벨 게이트 확인 실패(fail-open 유지):', bellErr);
    // 명시 opt-out(false)만 스킵 — 오류/null 은 벨 유지(fail-open, SQL should_send 철학과 일치).
    if (bellOn !== false) {
      try {
        await supabase.from('notifications').insert({
          user_id, type: inapp.type, title: inappTitle, body: inapp.body, link: inappLink, read: false,
        });
      } catch (e) {
        console.warn('[send-email] 인앱 알림 기록 실패:', e);
      }
    }

    // ── 이메일: email 게이트 (끔·오류·키없음이면 이메일만 스킵하고 푸시는 계속 진행) ──
    let emailMessageId: string | null = null;
    const { data: emailOn, error: checkError } = await supabase.rpc('should_send_notification',
      { p_user_id: user_id, p_type: type, p_channel: 'email' });
    if (checkError) console.error('[send-email] 이메일 설정 확인 실패:', checkError);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (emailOn && resendApiKey) {
      const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@mail.creaite.net';
      const replyTo = Deno.env.get('RESEND_REPLY_TO') || 'support@creaite.net';
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: `CREAITE <${fromEmail}>`, to: [to], reply_to: replyTo, subject: emailSubject, html: emailHtml }),
        });
        const resendData = await resendRes.json();
        if (!resendRes.ok) {
          await supabase.rpc('log_notification', {
            p_user_id: user_id, p_type: type, p_channel: 'email', p_recipient: to,
            p_subject: subject, p_status: 'failed', p_error_message: JSON.stringify(resendData),
          });
        } else {
          emailMessageId = resendData.id;
          await supabase.rpc('log_notification', {
            p_user_id: user_id, p_type: type, p_channel: 'email', p_recipient: to,
            p_subject: subject, p_status: 'sent', p_resend_message_id: resendData.id,
          });
        }
      } catch (e) {
        console.error('[send-email] Resend 예외:', e);
      }
    } else if (!resendApiKey) {
      console.error('[send-email] RESEND_API_KEY 미설정 — 이메일 스킵');
    }

    // ── 웹푸시: push 게이트 독립 판단 (이메일과 분리 — 이메일을 꺼도 푸시는 push_<type> 기준) ──
    const { data: pushOn } = await supabase.rpc('should_send_notification',
      { p_user_id: user_id, p_type: type, p_channel: 'push' });
    if (pushOn) {
      await sendWebPushToUser(supabase, user_id, inappTitle, inapp.body, inappLink);
    }

    return c.json({ success: true, message_id: emailMessageId });
  } catch (err: any) {
    console.error('[send-email] 예외:', err);
    return c.json({ error: '이메일 발송 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// 어드민 브로드캐스트 이메일 (2026-06-16) — 세그먼트 대상에게 Resend 배치 발송.
//   어드민 검증 → admin_broadcast_email_targets(segment) → Resend /emails/batch (100건씩).
//   수신거부자(notification_preferences.email_broadcast=false) 제외 + 푸터에 수신거부 링크.
// ============================================
// 호출: POST /server/broadcast-email   Body: { segment, title, body, link }
app.post('/broadcast-email', async (c) => {
  try {
    const admin = getSupabaseClient(true);
    const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return c.json({ error: '인증이 필요합니다' }, 401);
    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller?.user) return c.json({ error: '인증 실패' }, 401);
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', caller.user.id).single();
    if (!prof?.is_admin) return c.json({ error: '어드민만 발송 가능합니다' }, 403);

    const { segment = 'all', title, body, link } = await c.req.json();
    if (!title || !String(title).trim()) return c.json({ error: '제목이 필요합니다' }, 400);

    // 전체 대상 수집(1000행 캡 우회) — RPC 결과를 user_id 정렬로 페이지네이션
    let list: { email: string }[];
    try {
      const rows = await fetchAllRows<any>((from, to) =>
        admin.rpc('admin_broadcast_email_targets', { p_segment: segment }).order('user_id').range(from, to));
      list = rows.filter((t: any) => t?.email);
    } catch (tErr: any) {
      return c.json({ error: '대상 조회 실패: ' + (tErr?.message || tErr) }, 500);
    }
    if (list.length === 0) return c.json({ success: true, sent: 0, total: 0 });

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@mail.creaite.net';
    const replyTo = Deno.env.get('RESEND_REPLY_TO') || 'support@creaite.net';
    if (!resendApiKey) return c.json({ error: 'Resend API key not configured' }, 500);

    // 텍스트/속성 컨텍스트 모두 안전하게 — 따옴표까지 이스케이프(href 속성 탈출 방지)
    const esc = (s: string) => String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const settingsUrl = 'https://www.creaite.net/?tab=mypage&section=settings';
    // 상대경로(/?tab=...)는 절대 URL 로, http(s) 스킴만 허용(safeHttpUrl 로 저장형 XSS 차단)
    const rawCta = typeof link === 'string' && link ? (link.startsWith('http') ? link : `https://www.creaite.net${link}`) : '';
    const ctaUrl = safeHttpUrl(rawCta);
    const html = `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
      <div style="max-width:560px;margin:0 auto;padding:32px 24px;color:#e5e7eb;">
        <div style="font-weight:900;font-size:20px;color:#a78bfa;margin-bottom:24px;">CREAITE</div>
        <h1 style="font-size:20px;color:#fff;margin:0 0 16px;">${esc(title)}</h1>
        ${body ? `<div style="font-size:14px;line-height:1.7;color:#d1d5db;">${esc(body).replace(/\n/g, '<br>')}</div>` : ''}
        ${ctaUrl ? `<div style="margin:24px 0;"><a href="${esc(ctaUrl)}" style="display:inline-block;background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;">자세히 보기</a></div>` : ''}
        <hr style="border:none;border-top:1px solid #262626;margin:28px 0;">
        <div style="font-size:11px;color:#6b7280;line-height:1.6;">
          이 메일은 CREAITE 서비스 공지입니다. 수신을 원치 않으시면 <a href="${settingsUrl}" style="color:#a78bfa;">알림 설정</a>에서 공지 이메일 수신을 끄실 수 있습니다.<br>
          크레비즈 · 경기도 파주시 평화로342번길 71-5 · <a href="mailto:support@creaite.net" style="color:#a78bfa;">support@creaite.net</a>
        </div>
      </div></body></html>`;

    const subject = `[CREAITE] ${String(title).trim()}`;
    let sent = 0;
    // Resend 배치 API: 1회 최대 100건
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const payload = chunk.map((u) => ({
        from: `CREAITE <${fromEmail}>`,
        to: [u.email],
        reply_to: replyTo,
        subject,
        html,
        // Gmail/Yahoo 대량발송 규정 — 원클릭 수신거부 헤더(딜리버빌리티/스팸 회피)
        headers: {
          'List-Unsubscribe': `<${settingsUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }));
      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) { sent += chunk.length; }
        else { console.error('[broadcast-email] batch 실패', res.status, await res.text().catch(() => '')); }
      } catch (e) {
        console.error('[broadcast-email] batch 예외', e);
      }
    }
    return c.json({ success: true, sent, total: list.length });
  } catch (err: any) {
    console.error('[broadcast-email] 예외:', err);
    return c.json({ error: String(err?.message || err) }, 500);
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

    // 푸시 구독 + 정지 목록을 전체 수집(1000행 캡 우회, 결정적 정렬).
    //   정지 제외는 fail-closed 여야 함 — 조회 실패 시 예외로 중단(정지자에게 새는 것 방지).
    let subs: any[], suspended: any[];
    try {
      subs = await fetchAllRows((from, to) =>
        supabase.from('push_subscriptions').select('endpoint, p256dh, auth, user_id').order('endpoint').range(from, to));
      suspended = await fetchAllRows((from, to) =>
        supabase.from('profiles').select('id').eq('is_suspended', true).order('id').range(from, to));
    } catch (e: any) {
      return c.json({ error: '대상 조회 실패: ' + (e?.message || e) }, 500);
    }
    if (!subs.length) return c.json({ success: true, pushed: 0 });

    const suspendedSet = new Set(suspended.map((r: any) => r.id));
    let allowed = (uid: string) => !suspendedSet.has(uid);

    if (segment === 'premium' || segment === 'free') {
      const tierUsers = await fetchAllRows((from, to) =>
        supabase.from('profiles').select('id').eq('subscription_tier', segment).order('id').range(from, to));
      const tierSet = new Set(tierUsers.map((r: any) => r.id));
      const base = allowed; allowed = (uid: string) => base(uid) && tierSet.has(uid);
    } else if (segment === 'creators') {
      const vids = await fetchAllRows((from, to) =>
        supabase.from('videos').select('creator_id').order('id').range(from, to));
      const creatorSet = new Set(vids.map((r: any) => r.creator_id).filter(Boolean));
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
//   5. apply_moderation_result RPC 호출 → 통과 시 공개(is_hidden=false), 그 외 숨김 유지

// ── 공유 모더레이션 헬퍼 ────────────────────────────────────────────────────
//   Bunny 가 인코딩한 실제 썸네일({host}/{id}/thumbnail.jpg)을 서버가 직접 바이트로 가져와
//   base64 로 Vision 에 전달 → (1) 클라가 넘긴 썸네일 URL 위조 차단, (2) Bunny referrer
//   화이트리스트(creaite.net)는 Referer 헤더로 통과, (3) Vision 의 referrer 무관.
//   apply_moderation_result 는 pending 에서만 전이 → 통과=공개, 실패=pending 유지(fail-closed).
// Bunny 실제 썸네일({host}/{id}/thumbnail.jpg)을 서버가 직접 바이트로 가져와 base64 로 Vision 검수 →
// score(max adult/violence/racy) + categories 산출. DB 반영은 호출자(본편/클립)가 결정. 인코딩 미완=error.
async function scoreBunnyThumbnail(
  videoId: string,
): Promise<{ score?: number; categories?: any; error?: string }> {
  const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!apiKey) {
    console.error('[moderate] GOOGLE_VISION_API_KEY 미설정');
    return { error: 'Vision API key not configured' };
  }
  const thumbUrl = `https://${BUNNY_CDN_HOST}/${videoId}/thumbnail.jpg`;

  let b64: string;
  try {
    const imgRes = await fetch(thumbUrl, { headers: { Referer: 'https://www.creaite.net' } });
    if (!imgRes.ok) return { error: `thumbnail fetch ${imgRes.status}` };
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    if (buf.byteLength === 0) return { error: 'empty thumbnail' };
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK) as any);
    }
    b64 = btoa(bin);
  } catch (e: any) {
    return { error: 'thumbnail fetch error: ' + (e?.message || e) };
  }

  let visionData: any;
  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: b64 }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }],
        }),
      },
    );
    visionData = await visionRes.json();
    if (!visionRes.ok) return { error: visionData?.error?.message || 'Vision API error' };
  } catch (e: any) {
    return { error: 'vision error: ' + (e?.message || e) };
  }

  const safeSearch = visionData?.responses?.[0]?.safeSearchAnnotation;
  if (!safeSearch) return { error: 'No safeSearchAnnotation in Vision response' };

  const LIKELIHOOD_SCORE: Record<string, number> = {
    VERY_UNLIKELY: 0, UNLIKELY: 25, POSSIBLE: 50, LIKELY: 75, VERY_LIKELY: 100, UNKNOWN: 0,
  };
  const categories = {
    adult: LIKELIHOOD_SCORE[safeSearch.adult] ?? 0,
    violence: LIKELIHOOD_SCORE[safeSearch.violence] ?? 0,
    racy: LIKELIHOOD_SCORE[safeSearch.racy] ?? 0,
    spoof: LIKELIHOOD_SCORE[safeSearch.spoof] ?? 0,
    medical: LIKELIHOOD_SCORE[safeSearch.medical] ?? 0,
  };
  const score = Math.max(categories.adult, categories.violence, categories.racy);
  return { score, categories };
}

// 본편 검수: Bunny 썸네일 점수 → apply_moderation_result(통과 시 공개). 실패=pending 유지(fail-closed).
async function moderateVideoById(
  supabase: any,
  videoId: string,
): Promise<{ ok: boolean; score?: number; status?: string; error?: string }> {
  const r = await scoreBunnyThumbnail(videoId);
  if (r.error) {
    if (r.error !== 'Vision API key not configured') {
      await supabase.rpc('apply_moderation_result', {
        p_video_id: videoId, p_score: null, p_categories: null, p_error: r.error,
      });
    }
    return { ok: false, error: r.error };
  }
  const { data: updated, error: updErr } = await supabase.rpc('apply_moderation_result', {
    p_video_id: videoId, p_score: r.score, p_categories: r.categories,
  });
  if (updErr) {
    console.error('[moderate] DB 업데이트 실패:', updErr);
    return { ok: false, error: 'DB update failed', score: r.score };
  }
  return { ok: true, score: r.score, status: updated?.moderation_status };
}

// 히어로 클립 검수: 클립 Bunny 썸네일 점수 → apply_hero_clip_moderation(통과 시 재생허용). 실패=pending.
async function moderateHeroClip(
  supabase: any,
  clipId: string,
): Promise<{ ok: boolean; score?: number; error?: string }> {
  const r = await scoreBunnyThumbnail(clipId);
  const { error: updErr } = await supabase.rpc('apply_hero_clip_moderation', {
    p_clip_id: clipId,
    p_score: r.error ? null : r.score,
    p_categories: r.categories ?? null,
    p_error: r.error ?? null,
  });
  if (updErr) console.error('[moderate-clip] DB 업데이트 실패:', updErr);
  return { ok: !r.error, score: r.score, error: r.error };
}

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

    // 소유권 확인용 최소 조회 (썸네일은 헬퍼가 Bunny 실제 프레임으로 직접 검수)
    const { data: video, error: vidErr } = await supabase
      .from('videos')
      .select('id, creator_id')
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

    // 실제 Bunny 썸네일 기반 검수 (헬퍼가 apply_moderation_result 로 공개/숨김 결정)
    const result = await moderateVideoById(supabase, video_id);
    if (result.error === 'Vision API key not configured') {
      return c.json({ error: result.error }, 500);
    }
    // 썸네일 미생성(인코딩 중)·Vision 일시오류는 200 + status='pending' — 클라 폴백이 재시도.
    return c.json({
      success: result.ok,
      score: result.score,
      status: result.status ?? 'pending',
      error: result.error,
    });
  } catch (err: any) {
    console.error('[moderate-video] 예외:', err);
    return c.json({ error: '모더레이션 처리 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ── 히어로 클립 편집 연결 (기존 영상에 hero_clip 추가/교체/제거) ──
//   save-metadata(신규)와 달리 편집에서 이미 등록된 영상에 hero_clip 을 붙인다.
//   검증: 본편 소유자/어드민 + 클립 GUID KV 소유권(본인이 create-upload 로 만든 클립만).
//   URL 은 GUID 로 서버 재구성(클라 문자열 불신), status='pending' → moderate-hero-clip 이 검수.
app.post('/videos/set-hero-clip', async (c) => {
  try {
    const supabase = getSupabaseClient(true);
    const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return c.json({ error: '인증이 필요합니다' }, 401);
    const { data: caller, error: callerErr } = await supabase.auth.getUser(token);
    if (callerErr || !caller?.user) return c.json({ error: '인증 실패' }, 401);
    const callerId = caller.user.id;

    const { video_id, heroClipId } = await c.req.json();
    if (!video_id) return c.json({ error: 'Missing video_id' }, 400);

    // 본편 소유권(본인 또는 어드민)
    const { data: video, error: vidErr } = await supabase
      .from('videos').select('id, creator_id').eq('id', video_id).single();
    if (vidErr || !video) return c.json({ error: 'Video not found' }, 404);
    let isAdmin = false;
    if (video.creator_id !== callerId) {
      const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', callerId).single();
      isAdmin = !!prof?.is_admin;
      if (!isAdmin) return c.json({ error: '권한이 없습니다' }, 403);
    }

    // 제거(heroClipId 없음) → 본편 폴백으로 되돌림
    if (!heroClipId) {
      await supabase.from('videos').update({ hero_clip_id: null, hero_clip_url: null, hero_clip_status: 'none' }).eq('id', video_id);
      return c.json({ success: true, status: 'none' });
    }
    if (!/^[0-9a-f-]{36}$/i.test(heroClipId)) return c.json({ error: 'Invalid clip id' }, 400);

    // 클립 GUID KV 소유권 — 본인이 create-upload 로 만든 클립만(타인 GUID 도용 차단). save-metadata 와 동일.
    const kvClip = await kv.get(`video:${heroClipId}`);
    if (kvClip?.userId !== callerId && !isAdmin) return c.json({ error: '클립 소유권 확인 실패' }, 403);

    const heroClipUrl = `https://${BUNNY_CDN_HOST}/${heroClipId}/playlist.m3u8`;
    const { error: upErr } = await supabase.from('videos').update({
      hero_clip_id: heroClipId, hero_clip_url: heroClipUrl, hero_clip_status: 'pending',
    }).eq('id', video_id);
    if (upErr) return c.json({ error: upErr.message }, 500);
    return c.json({ success: true, status: 'pending' });
  } catch (err: any) {
    return c.json({ error: '히어로 클립 연결 오류: ' + (err?.message || err) }, 500);
  }
});

// ── 히어로 클립 검수 (클라 폴백 — 웹훅 지연/미설정 대비) ──
//   video_id 의 소유자/어드민만. 클립(hero_clip_id)이 pending 이면 Bunny 썸네일 검수 → passed/rejected.
app.post('/moderate-hero-clip', async (c) => {
  try {
    const supabase = getSupabaseClient(true);
    const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return c.json({ error: '인증이 필요합니다' }, 401);
    const { data: caller, error: callerErr } = await supabase.auth.getUser(token);
    if (callerErr || !caller?.user) return c.json({ error: '인증 실패' }, 401);
    const callerId = caller.user.id;

    const { video_id } = await c.req.json();
    if (!video_id) return c.json({ error: 'Missing video_id' }, 400);

    const { data: video, error: vidErr } = await supabase
      .from('videos').select('id, creator_id, hero_clip_id, hero_clip_status').eq('id', video_id).single();
    if (vidErr || !video) return c.json({ error: 'Video not found' }, 404);
    if (video.creator_id !== callerId) {
      const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', callerId).single();
      if (!prof?.is_admin) return c.json({ error: '권한이 없습니다' }, 403);
    }
    if (!video.hero_clip_id) return c.json({ success: true, status: 'none' });
    if (video.hero_clip_status !== 'pending') {
      return c.json({ success: true, status: video.hero_clip_status });  // 이미 판정
    }
    const cres = await moderateHeroClip(supabase, video.hero_clip_id);
    if (cres.error === 'Vision API key not configured') return c.json({ error: cres.error }, 500);
    const { data: after } = await supabase
      .from('videos').select('hero_clip_status').eq('id', video_id).single();
    return c.json({ success: cres.ok, status: after?.hero_clip_status ?? 'pending', score: cres.score, error: cres.error });
  } catch (err: any) {
    console.error('[moderate-hero-clip] 예외:', err);
    return c.json({ error: '클립 검수 중 서버 오류: ' + (err?.message || err) }, 500);
  }
});

// ============================================
// Bunny Stream 인코딩 완료 웹훅 → 서버강제 모더레이션 + 실제 길이 반영
// ============================================
//   Bunny 대시보드 → Stream 라이브러리 → Webhook URL 등록:
//     https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/bunny/webhook?secret=<BUNNY_WEBHOOK_SECRET>
//   payload: { VideoLibraryId, VideoGuid, Status }
//     Status 3=Finished, 4=ResolutionFinished, 5=Failed (그 외=인코딩중)
//   Bunny 는 서명 헤더가 없어 URL 쿼리 시크릿으로 인증.
app.post('/bunny/webhook', async (c) => {
  try {
    // 1. 시크릿 검증
    const expected = Deno.env.get('BUNNY_WEBHOOK_SECRET');
    if (!expected || c.req.query('secret') !== expected) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const body = await c.req.json().catch(() => ({}));
    const guid = body?.VideoGuid || body?.videoGuid;
    const status = body?.Status ?? body?.status;
    const libId = String(body?.VideoLibraryId ?? body?.videoLibraryId ?? '');
    if (!guid) return c.json({ error: 'missing VideoGuid' }, 400);

    // 우리 라이브러리만
    const ourLib = Deno.env.get('BUNNY_LIBRARY_ID');
    if (ourLib && libId && libId !== String(ourLib)) {
      return c.json({ ok: true, ignored: 'other library' });
    }

    // Finished(3)/ResolutionFinished(4) 만 처리
    if (status !== 3 && status !== 4) {
      return c.json({ ok: true, ignored: `status ${status}` });
    }

    const supabase = getSupabaseClient(true);

    // 본편 영상인지 조회
    const { data: vrow } = await supabase
      .from('videos').select('moderation_status').eq('id', guid).maybeSingle();

    if (vrow) {
      // ── 본편 영상 경로 ──
      // 2. Bunny 실제 length → duration_seconds 갱신 (트리거가 티어 재분류, duration 위조 무력화)
      try {
        const apiKey = Deno.env.get('BUNNY_API_KEY');
        if (apiKey && ourLib) {
          const metaRes = await fetch(
            `https://video.bunnycdn.com/library/${ourLib}/videos/${guid}`,
            { headers: { AccessKey: apiKey, accept: 'application/json' } },
          );
          if (metaRes.ok) {
            const meta = await metaRes.json();
            const lenSec = Math.round(Number(meta?.length) || 0);
            if (lenSec > 0) {
              await supabase.from('videos').update({ duration_seconds: lenSec }).eq('id', guid);
            }
          }
        }
      } catch (e) {
        console.warn('[bunny-webhook] length 조회 실패:', e);
      }
      // 3. pending 만 검수(다중 해상도 웹훅 Vision 중복 방지). 통과 시 공개.
      if (vrow.moderation_status !== 'pending') {
        return c.json({ ok: true, guid, already: vrow.moderation_status });
      }
      const result = await moderateVideoById(supabase, guid);
      console.log('[bunny-webhook] moderation', guid, result.score, result.status, result.error || '');
      return c.json({ ok: true, guid, score: result.score, status: result.status });
    }

    // ── 히어로 클립 경로 (본편 아님 → hero_clip_id 로 조회) ──
    const { data: crow } = await supabase
      .from('videos').select('id, hero_clip_status').eq('hero_clip_id', guid).maybeSingle();
    if (crow) {
      if (crow.hero_clip_status !== 'pending') {
        return c.json({ ok: true, guid, clipAlready: crow.hero_clip_status });
      }
      const cres = await moderateHeroClip(supabase, guid);
      console.log('[bunny-webhook] hero-clip', guid, cres.score, cres.error || '');
      return c.json({ ok: true, guid, clipScore: cres.score });
    }

    // 본편도 클립도 아님 → save-metadata 전 레이스 또는 우리 것 아님(클라 폴백이 이후 처리)
    return c.json({ ok: true, ignored: 'no matching video/clip row yet' });
  } catch (err: any) {
    console.error('[bunny-webhook] 예외:', err);
    return c.json({ error: 'webhook error: ' + (err?.message || err) }, 500);
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

    // R6(2026-06-11): RPC 가 확정 정산과 겹치는 환불이면 경고 TEXT 반환 (없으면 null)
    const { data: settlementWarning, error: rpcErr } = await supabaseAsAdmin.rpc('admin_refund_payment', {
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
      settlement_warning: settlementWarning || null,  // R6: 확정 정산과 겹침 경고
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