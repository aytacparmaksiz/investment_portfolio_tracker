import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://sdytbbgcsgydhaksfbxo.supabase.co';
const supabaseKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkeXRiYmdjc2d5ZGhha3NmYnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTAyNzUsImV4cCI6MjA5NzE4NjI3NX0.75XlKVAwN7bilKtIDYcg1lQ83cq6WbdDHzt5oEanssk';

if (typeof import.meta !== 'undefined' && !import.meta.env?.VITE_SUPABASE_URL) {
  console.warn('VITE_SUPABASE_URL environment variable is not defined, using fallback.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
