import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
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
  signOut: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const serverUrl = `https://${projectId}.supabase.co/functions/v1/make-server-f4aeac42`;

  // signOut을 useCallback으로 감싸서 메모이제이션
  const signOut = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    
    // Supabase signOut은 선택적으로 호출 (에러 무시)
    try {
      supabase.auth.signOut().catch(err => {
        console.log('Supabase signOut error (ignored):', err);
      });
    } catch (err) {
      console.log('Supabase signOut error (ignored):', err);
    }
  }, []);

  // 세션 초기화 - 한 번만 실행
  useEffect(() => {
    if (initialized) return;

    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const initAuth = async () => {
      try {
        // 타임아웃 설정 (5초 후 강제 로딩 완료)
        timeoutId = setTimeout(() => {
          if (mounted && !initialized) {
            console.warn('Auth initialization timeout - continuing without session');
            setLoading(false);
            setInitialized(true);
          }
        }, 5000);

        console.log('[AuthContext] Starting initialization...');

        // 로컬 스토리지 먼저 확인 (빠른 초기 렌더링)
        const storedToken = localStorage.getItem('access_token');
        const storedUser = localStorage.getItem('user');

        console.log('[AuthContext] LocalStorage check:', {
          hasToken: !!storedToken,
          hasUser: !!storedUser
        });

        if (storedToken && storedUser && mounted) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setAccessToken(storedToken);
            setUser(parsedUser);
            console.log('[AuthContext] Restored from localStorage:', parsedUser.email);
          } catch (parseError) {
            console.error('[AuthContext] Parse error:', parseError);
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
          }
        }

        // Supabase 세션 확인 (비동기)
        try {
          console.log('[AuthContext] Checking Supabase session...');
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          console.log('[AuthContext] Supabase session result:', {
            hasSession: !!session,
            error: sessionError?.message
          });
          
          if (sessionError) {
            console.log('[AuthContext] Session error (continuing):', sessionError.message);
          } else if (session && mounted) {
            // OAuth 세션이 있으면 업데이트
            const token = session.access_token;
            const supabaseUser = session.user;
            
            console.log('[AuthContext] Found Supabase session for:', supabaseUser.email);
            
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
            
            localStorage.setItem('access_token', token);
            localStorage.setItem('user', JSON.stringify(userData));
            
            console.log('[AuthContext] Session saved:', userData.email);
          } else {
            console.log('[AuthContext] No Supabase session found');
          }
        } catch (supabaseError) {
          console.log('[AuthContext] Supabase error (continuing):', supabaseError);
        }

        clearTimeout(timeoutId);
        console.log('[AuthContext] Initialization complete');
      } catch (error) {
        console.error('[AuthContext] Init error (continuing):', error);
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [initialized]);

  // Auth 상태 변경 리스너 - 초기화 후에만 활성화
  useEffect(() => {
    if (!initialized) return;

    let mounted = true;

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth event:', event);
        
        if (!mounted) return;

        try {
          if (event === 'SIGNED_IN' && session) {
            const token = session.access_token;
            const supabaseUser = session.user;
            
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
            
            localStorage.setItem('access_token', token);
            localStorage.setItem('user', JSON.stringify(userData));
          } else if (event === 'SIGNED_OUT') {
            setUser(null);
            setAccessToken(null);
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
          }
        } catch (error) {
          console.error('Auth state change error:', error);
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error('Auth listener setup error:', error);
      return () => {
        mounted = false;
      };
    }
  }, [initialized]);

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

      localStorage.setItem('access_token', token);
      localStorage.setItem('user', JSON.stringify(data.user));
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
    try {
      const currentUrl = window.location.origin;
      console.log('Google OAuth - Redirect URL:', currentUrl);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: currentUrl,
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

  const value = {
    user,
    accessToken,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
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