import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { supabase } from '../utils/supabaseClient';
import { sendNotification, buildWelcomeEmail } from '../utils/sendNotification';
import { getStoredRef, clearStoredRef } from '../utils/referral';

interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

// 'basic'은 예약된 중간 티어(광고 노출 + 5초 스킵). 현재 판매 경로 없음 — free/premium 2단 운영.
// 광고 스킵 로직(ProductDetail)은 이미 구현돼 있어, 향후 구독 상품만 열면 활성화됨.
type SubscriptionTier = 'free' | 'basic' | 'premium';

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  subscription_tier: SubscriptionTier;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  payout_info: any | null;
  is_admin: boolean | null;
  is_suspended: boolean | null;   // get_my_profile 이 SELECT * 라 이미 포함 — 정지 로그인 차단에 사용
  birthdate: string | null;
  age_verified: boolean | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  accessToken: string | null;
  loading: boolean;
  subscriptionTier: SubscriptionTier;
  isSubscriber: boolean;
  isPremium: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  // R2(2026-06-11): 이메일 인증 필수 — 확인 메일 발송 시 needsEmailConfirm=true 반환
  signUp: (email: string, password: string, name?: string) => Promise<{ needsEmailConfirm: boolean }>;
  resendConfirmEmail: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
  // H8: 비밀번호 재설정
  passwordRecovery: boolean;                                  // 재설정 메일 링크로 진입한 상태
  requestPasswordReset: (email: string) => Promise<void>;     // 재설정 메일 발송
  updatePassword: (newPassword: string) => Promise<void>;     // 새 비밀번호 설정
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);  // H8

  // 신규 Edge Function 'server'로 통일 (legacy 'make-server-f4aeac42' 제거)
  const serverUrl = `https://${projectId}.supabase.co/functions/v1/server`;

  // profile 가져오기 (가입 직후엔 트리거가 아직 처리 중일 수 있어 1회 재시도)
  const fetchProfile = useCallback(async (_userId: string): Promise<Profile | null> => {
    // 보안(C2): profiles 테이블 직접 select 대신 본인 전체 프로필 RPC.
    // profiles SELECT 는 공개 컬럼만 GRANT 되어 있고, 민감 컬럼(email/payout_info/
    // birthdate/business_* 등)은 본인만 이 RPC(auth.uid())로 읽는다.
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error) {
      console.error('[AuthContext] fetchProfile error:', error.message);
      return null;
    }
    return (data as Profile) ?? null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const p = await fetchProfile(user.id);
    if (p) setProfile(p);
  }, [user?.id, fetchProfile]);

  // signOut을 useCallback으로 감싸서 메모이제이션
  const signOut = useCallback(() => {
    setUser(null);
    setProfile(null);
    setAccessToken(null);

    // Supabase signOut은 선택적으로 호출 (에러 무시)
    try {
      supabase.auth.signOut().catch(err => {
        console.log('Supabase signOut error (ignored):', err);
      });
    } catch (err) {
      console.log('Supabase signOut error (ignored):', err);
    }
  }, []);

  // 세션 초기화 및 리스너 통합
  useEffect(() => {
    let mounted = true;

    // 실패세이프: getSession 행(hang)·웹뷰 락 등 어떤 이유로든 4초 내 로딩 해제 보장
    // → 로고 화면에서 무한 멈춤 방지. 정상 흐름에선 그 전에 setLoading(false) 호출돼 무해하고,
    //   onAuthStateChange 리스너가 이후 실제 세션 상태로 보정함.
    const loadingFailsafe = setTimeout(() => {
      if (mounted) {
        console.warn('[AuthContext] 로딩 실패세이프(4s) 발동 — getSession 지연/행 가능');
        setLoading(false);
      }
    }, 4000);

    // 1. 초기 세션 확인 함수
    const checkInitialSession = async () => {
      try {
        console.log('[AuthContext] Checking initial session...');
        // C(2026-07-04): getSession 이 인증 락/네트워크로 지연돼도 2초면 우선 진행.
        //   onAuthStateChange(INITIAL_SESSION) 가 이후 실제 세션으로 보정하므로 안전.
        const raced = await Promise.race([
          supabase.auth.getSession().then((r) => ({ ok: true as const, r })),
          new Promise<{ ok: false }>((res) => setTimeout(() => res({ ok: false }), 2000)),
        ]);
        if (!raced.ok) {
          console.warn('[AuthContext] getSession 2s 초과 → 우선 진행(리스너가 보정)');
          return;
        }
        const { data: { session }, error } = raced.r;

        if (error) {
          console.error('[AuthContext] getSession error:', error.message);
          return;
        }

        if (session && mounted) {
          console.log('[AuthContext] Initial session found:', session.user.email);
          updateUserState(session.user, session.access_token);
        } else {
          console.log('[AuthContext] No initial session found');
        }
      } catch (err) {
        console.error('[AuthContext] checkInitialSession crash:', err);
      } finally {
        // 로딩 해제 + 실패세이프 타이머 해제(성공 시 4s 경고가 매번 뜨던 노이즈 제거).
        //   → 이제 실패세이프 경고는 진짜 4s 이상 행일 때만 발생.
        if (mounted) { setLoading(false); clearTimeout(loadingFailsafe); }
      }
    };

    // 2. 상태 업데이트 헬퍼
    const updateUserState = async (supabaseUser: any, token: string | null) => {
      if (!supabaseUser) {
        setUser(null);
        setProfile(null);
        setAccessToken(null);
        return;
      }

      const name = supabaseUser.user_metadata?.name ||
                  supabaseUser.user_metadata?.full_name ||
                  supabaseUser.email?.split('@')[0] ||
                  'User';

      const userData = {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: name,
        created_at: supabaseUser.created_at,
      };

      setAccessToken(token);
      setUser(userData);
      console.log('[AuthContext] User state updated:', userData.email);

      // profile 비동기 로드 (실패해도 user 인증은 유지)
      const p = await fetchProfile(supabaseUser.id);
      if (!mounted) return;
      // 정지 계정 로그인 차단 — 프로필 is_suspended=true 면 즉시 로그아웃 + 안내.
      //   (쓰기·신원수정은 DB에서 이미 차단, 여기선 앱 접근 자체를 봉쇄. 이메일/구글/카카오/
      //    세션복원 등 모든 진입이 이 헬퍼를 거치므로 로그인 경로 무관하게 공통 차단.)
      if (p?.is_suspended) {
        toast.error('정지된 계정입니다. 이용이 제한됩니다. 문의: support@creaite.net', { duration: 10000 });
        signOut();
        return;
      }
      setProfile(p);
    };

    // M2(2026-05-31) + R2(2026-06-11): 신규 가입자 welcome 메일.
    // OAuth = 가입 직후(created_at 2분 내), 이메일 가입 = 인증 메일 링크 클릭 직후
    // (email_confirmed_at 10분 내 — 가입 시점엔 미인증 주소라 인증 완료 후 발송).
    // localStorage 가드로 중복/재로그인 발송 방지.
    const maybeSendWelcome = (u: any) => {
      try {
        const provider = u?.app_metadata?.provider;
        if (!provider) return;
        const fresh = (iso: string | null | undefined, windowMs: number) =>
          !!iso && Date.now() - new Date(iso).getTime() <= windowMs;
        const isNew = provider === 'email'
          ? fresh(u?.email_confirmed_at ?? u?.confirmed_at ?? u?.created_at, 600000)
          : fresh(u?.created_at, 120000);
        if (!isNew) return;
        const key = `creaite_welcome_${u.id}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
        const name = u.user_metadata?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'CREAITE 회원';
        const { subject, html } = buildWelcomeEmail(name);
        void sendNotification({ user_id: u.id, type: 'welcome', to: u.email, subject, html });
      } catch (e) {
        console.warn('[AuthContext] welcome 발송 실패:', e);
      }
    };

    // 초대(레퍼럴) 연결 — 신규 가입자만(기존 사용자 자기참조 방지). claim_referral RPC는 멱등.
    const maybeClaimReferral = (u: any) => {
      try {
        const code = getStoredRef();
        if (!code) return;
        const provider = u?.app_metadata?.provider;
        const fresh = (iso: string | null | undefined, windowMs: number) =>
          !!iso && Date.now() - new Date(iso).getTime() <= windowMs;
        const isNew = provider === 'email'
          ? fresh(u?.email_confirmed_at ?? u?.confirmed_at ?? u?.created_at, 600000)
          : fresh(u?.created_at, 120000);
        if (!isNew) { clearStoredRef(); return; }  // 기존 사용자면 소진만
        const guard = `creaite_ref_done_${u.id}`;
        if (localStorage.getItem(guard)) { clearStoredRef(); return; }
        localStorage.setItem(guard, '1');
        void supabase.rpc('claim_referral', { p_code: code }).then(({ error }) => {
          if (error) console.warn('[AuthContext] claim_referral 실패:', error.message);
        });
        clearStoredRef();
      } catch (e) {
        console.warn('[AuthContext] referral claim 오류:', e);
      }
    };

    // 3. 인증 상태 변경 리스너 즉시 등록
    console.log('[AuthContext] Subscribing to auth state changes...');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Auth event received:', event);
      
      if (!mounted) return;

      // H8: 비밀번호 재설정 메일 링크로 진입 → 새 비밀번호 설정 화면 노출 플래그
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);

      if (session) {
        updateUserState(session.user, session.access_token);
        // 신규 가입자 환영 메일 (실제 로그인 이벤트만 — 이메일 가입은 인증 완료 직후)
        if (event === 'SIGNED_IN' && session.user) {
          maybeSendWelcome(session.user);
          maybeClaimReferral(session.user);
        }
      } else {
        updateUserState(null, null);
      }

      // 로딩 중이었다면 해제 (OAuth 리다이렉트 후 첫 이벤트 수신 시점)
      setLoading(false);
      clearTimeout(loadingFailsafe);
    });

    // 초기 로드 실행
    checkInitialSession();

    return () => {
      mounted = false;
      clearTimeout(loadingFailsafe);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch(`${serverUrl}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // R2: 이메일 인증 전 로그인 시도 — Supabase 원문 대신 친절한 안내
        if (/email[_ ]not[_ ]confirmed|not confirmed/i.test(data.error || '')) {
          throw new Error('이메일 인증이 아직 완료되지 않았어요. 받은 편지함의 인증 메일 링크를 눌러주세요.');
        }
        throw new Error(data.error || 'Sign in failed.');
      }

      // Supabase SDK에 세션 동기화 — onAuthStateChange 리스너가 발동되어
      // user/accessToken/profile 상태가 일관되게 갱신됨
      // (이전엔 setUser/setAccessToken만 호출해서 SDK 클라이언트가 미동기 상태였음)
      if (data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      } else {
        // fallback: 세션 토큰이 응답에 없을 때만 수동 설정 (방어적)
        setAccessToken(data.session?.access_token ?? null);
        setUser(data.user);
        const p = await fetchProfile(data.user.id);
        setProfile(p);
      }
    } catch (error) {
      console.error('로그인 에러:', error);
      throw error;
    }
  };

  // R2(2026-06-11): Edge admin.createUser(email_confirm:true) 테스트 모드 제거.
  // supabase.auth.signUp 직접 호출 → Supabase 가 확인 메일 발송, 링크 클릭 후 로그인 가능.
  // (대시보드 "Confirm email" 이 꺼져 있으면 세션이 바로 생겨 기존처럼 즉시 로그인 — 하위호환)
  const signUp = async (email: string, password: string, name?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name || email.split('@')[0] },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        if (/already registered|already exists/i.test(error.message)) {
          throw new Error('이미 가입된 이메일입니다. 로그인해 주세요.');
        }
        throw new Error(error.message || 'Sign up failed.');
      }

      // Supabase 는 기존 가입 이메일로 재가입 시 보안상 에러 대신 identities 빈 배열을 반환
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        throw new Error('이미 가입된 이메일입니다. 로그인해 주세요.');
      }

      // 세션 없음 = 확인 메일 발송됨 (인증 후 로그인). 환영 메일은 인증 완료 SIGNED_IN 때 발송.
      return { needsEmailConfirm: !data.session };
    } catch (error) {
      console.error('회원가입 에러:', error);
      throw error;
    }
  };

  // R2: 인증 메일 재발송
  const resendConfirmEmail = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message || 'Failed to resend.');
  };

  const signInWithGoogle = async () => {
    // WebView 감지: 카카오톡/인스타/네이버 앱 내 브라우저 또는 Android WebView
    const ua = navigator.userAgent;
    const isWebView =
      /KAKAOTALK|NAVER|FBAN|FBAV|Instagram|Line|Twitter/i.test(ua) ||
      (/Android/i.test(ua) && /wv\b/i.test(ua));

    if (isWebView) {
      // Android: Chrome Intent로 외부 브라우저 열기 시도
      const currentHref = window.location.href;
      const chromeIntent = `intent://${currentHref.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
      try {
        window.location.href = chromeIntent;
      } catch {
        // fallback: 그냥 주소를 클립보드에 안내
      }
      throw new Error(
        'Google sign-in is not supported in in-app browsers. Please open the site in Chrome or Safari.'
      );
    }

    try {
      const redirectTo = `${window.location.origin}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });

      if (error) {
        console.error('OAuth error:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('Google 로그인 에러:', error);
      throw new Error(error.message || 'Google sign-in failed.');
    }
  };

  const signInWithKakao = async () => {
    try {
      const currentUrl = window.location.origin;
      console.log('Kakao OAuth - Redirect URL:', currentUrl);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: currentUrl,
        }
      });

      if (error) {
        console.error('OAuth error:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('Kakao 로그인 에러:', error);
      throw new Error(error.message || 'Kakao sign-in failed.');
    }
  };

  const subscriptionTier: SubscriptionTier = profile?.subscription_tier ?? 'free';
  // P9(2026-07-05): 만료일(expires_at) NULL = 비구독으로 통일(서버 재생게이트와 일치).
  //   영구 무료제공(관리자 컴프)은 NULL 대신 먼 미래 날짜(예: 2099-12-31)로 명시할 것.
  const subscriptionActive =
    subscriptionTier !== 'free' &&
    !!profile?.subscription_expires_at &&
    new Date(profile.subscription_expires_at).getTime() > Date.now();

  // H8: 비밀번호 재설정 메일 발송 (로그인 전 계정 복구)
  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  };
  // H8: 새 비밀번호 설정 (recovery 세션 또는 로그인 상태에서)
  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setPasswordRecovery(false);
  };
  const clearPasswordRecovery = () => setPasswordRecovery(false);

  const value = {
    user,
    profile,
    accessToken,
    loading,
    subscriptionTier,
    isSubscriber: subscriptionActive,
    isPremium: subscriptionActive && subscriptionTier === 'premium',
    refreshProfile,
    signIn,
    signUp,
    resendConfirmEmail,
    signInWithGoogle,
    signInWithKakao,
    signOut,
    isAuthenticated: !!user,
    passwordRecovery,
    requestPasswordReset,
    updatePassword,
    clearPasswordRecovery,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}