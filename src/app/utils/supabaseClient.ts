import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

// Supabase 클라이언트 생성 (싱글톤)
export const supabaseAnonKey = publicAnonKey;
export const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
