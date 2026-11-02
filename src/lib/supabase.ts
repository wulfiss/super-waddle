import { createClient } from '@supabase/supabase-js';
import { dev } from '$app/env';
import * as env from '$app/env/public';
export const supabase = !(dev && env.PUBLIC_PREVIEW_MODE === 'true') && env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
 ? createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_PUBLISHABLE_KEY) : null;
