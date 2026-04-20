import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY. Set them in .env (local) or Netlify environment variables (production).'
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
  },
});

export type ItemType = 'play' | 'doctor' | 'service' | 'class' | 'streaming' | 'event';

export interface Rating {
  id: string;
  user_id: string;
  item_type: ItemType;
  item_id: string;
  stars: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  item_type: ItemType;
  item_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  profile?: Profile;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface RatingSummary {
  item_type: ItemType;
  item_id: string;
  rating_count: number;
  avg_stars: number;
}
