import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { supabase } from '../utils/supabaseClient';
import { sendNotification, buildWelcomeEmail } from '../utils/sendNotification';

interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

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
  signUp: (email: string, password: string, name?: string) => Promise<void>;
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

    // 1. 초기 세션 확인 함수
    const checkInitialSession = async () => {
      try {
        console.log('[AuthContext] Checking initial session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
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
        if (mounted) setLoading(false);
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
      if (mounted) setProfile(p);
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
      } else {
        updateUserState(null, null);
      }

      // 로딩 중이었다면 해제 (OAuth 리다이렉트 후 첫 이벤트 수신 시점)
      setLoading(false);
    });

    // 초기 로드 실행
    checkInitialSession();

    return () => {
      mounted = false;
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

  const signUp = async (email: string, password: string, name?: string) => {
    try {
      const response = await fetch(`${serverUrl}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sign up failed.');
      }

      // 테스트 모드: 이메일 자동 확인되므로 바로 로그인
      // M3(2026-05-31): 계정은 생성됐으나 자동 로그인만 실패한 경우 — '가입 실패'로 오인 방지
      try {
        await signIn(email, password);
      } catch {
        throw new Error('가입은 완료됐습니다. 로그인 화면에서 이메일/비밀번호로 다시 로그인해 주세요.');
      }

      // Phase 34 — 환영 메일 발송 (fire-and-forget, 실패해도 가입 흐름 무관)
      if (data?.user?.id) {
        const { subject, html } = buildWelcomeEmail(name || email.split('@')[0]);
        void sendNotification({
          user_id: data.user.id,
          type: 'welcome',
          to: email,
          subject,
          html,
        });
      }
    } catch (error) {
      console.error('회원가입 에러:', error);
      throw error;
    }
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
  const subscriptionActive =
    subscriptionTier !== 'free' &&
    (!profile?.subscription_expires_at ||
      new Date(profile.subscription_expires_at).getTime() > Date.now());

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