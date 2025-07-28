/*import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = 'https://mozaczdffhifbqqcgaws.supabase.co'; // ← replace with your URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vemFjemRmZmhpZmJxcWNnYXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MjQ1MDIsImV4cCI6MjA2NDMwMDUwMn0.vew4V_GfthSxO5iYrizEivUHjqnSQ0v9pMi0rDngrWs'; // ← replace with your anon public key

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
*/
// lib/supabase.ts
/* import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const { url, anonKey } = Constants.expoConfig?.extra?.supabase ?? {};

export const supabase = createClient(url, anonKey); */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const {
  extra: {
    supabase: { url, anonKey },
  },
} = Constants.expoConfig!;

export const supabase = createClient(url, anonKey, {
  auth: {
    // store auth tokens in AsyncStorage
    storage: AsyncStorage,
    // keep the session across app restarts
    persistSession: true,
    // automatically refresh the access token
    autoRefreshToken: true,
    // don’t try to parse the URL for a session
    detectSessionInUrl: false,
  },
});