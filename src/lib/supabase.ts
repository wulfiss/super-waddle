import { createClient } from '@supabase/supabase-js';
import * as env from '$app/env/public';
export const supabase = env.PUBLIC_PREVIEW_MODE !== 'true' && env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
 ? createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_PUBLISHABLE_KEY) : null;
