import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { supabase } from '../utils/supabaseClient';

interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const serverUrl = `https://${projectId}.supabase.co/functions/v1/make-server-f4aeac42`;

  // signOut을 useCallback으로 감싸서 메모이제이션
  const signOut = useCallback(() => {
    setUser(null);
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
    const updateUserState = (supabaseUser: any, token: string | null) => {
      if (!supabaseUser) {
        setUser(null);
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
    };

    // 3. 인증 상태 변경 리스너 즉시 등록
    console.log('[AuthContext] Subscribing to auth state changes...');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthContext] Auth event received:', event);
      
      if (!mounted) return;

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
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      const token = data.session.access_token;
      setAccessToken(token);
      setUser(data.user);
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
        throw new Error(data.error || '회원가입에 실패했습니다.');
      }

      // 테스트 모드: 이메일 자동 확인되므로 바로 로그인
      await signIn(email, password);
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
        'Google 로그인은 앱 내 브라우저에서 지원되지 않습니다.\n\nChrome 또는 Safari 브라우저에서 사이트를 열어 로그인해 주세요.'
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
      throw new Error(error.message || 'Google 로그인에 실패했습니다.');
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
      throw new Error(error.message || 'Kakao 로그인에 실패했습니다.');
    }
  };

  const value = {
    user,
    accessToken,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithKakao,
    signOut,
    isAuthenticated: !!user,
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