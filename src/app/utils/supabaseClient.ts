import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

// Supabase 클라이언트 생성 (싱글톤)
export const supabaseAnonKey = publicAnonKey;
export const supabaseUrl = `https://${projectId}.supabase.co`;

// ── 인증 락 타임아웃 (A, 2026-07-04) ──
// 기본 클라이언트는 getSession/토큰갱신 시 navigator.locks 기반 인증 락을 잡는데,
// TWA 웹뷰·다중 탭에서 이 락이 행(hang)하면 getSession 이 무한 대기 → 첫 로딩이 최대 4초 멈춤.
// 락 획득에 짧은 타임아웃을 두고, 못 잡으면 락 없이 실행(단일 활성 컨텍스트 가정)해 행을 방지한다.
// 정상 시엔 기존과 동일하게 락으로 동시 리프레시를 보호한다.
const LOCK_TIMEOUT_MS = 2000;
async function boundedLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const locks: any = (typeof navigator !== 'undefined' && (navigator as any).locks) || null;
  if (!locks?.request) return fn(); // navigator.locks 미지원(구형 웹뷰) → 락 없이 실행
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOCK_TIMEOUT_MS);
  try {
    // 락을 잡으면 그 안에서 fn 실행. 타임아웃 시 request 가 AbortError 로 reject(=fn 미실행).
    return await locks.request(name, { mode: 'exclusive', signal: ctrl.signal }, () => fn());
  } catch (e: any) {
    if (e?.name === 'AbortError') return fn(); // 락 획득 타임아웃 → 락 없이 실행(fn 이중실행 아님)
    throw e; // fn 내부 에러는 그대로 전파
  } finally {
    clearTimeout(timer);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // OAuth 리다이렉트 세션 파싱에 필요
    lock: boundedLock,
  },
});
