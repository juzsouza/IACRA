/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import { getBrowserDevSupabaseConfig } from './devSupabaseConfig';

const { url, anonKey } = getBrowserDevSupabaseConfig();
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
