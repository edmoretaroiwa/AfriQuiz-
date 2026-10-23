import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://iptuvmouztoribqqfmyu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xw91xZ4aHWi9XnNmGoAQ5Q_oS-jHzVt';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
