//import { createBrowserClient } from '@supabase/ssr';

//const SUPABASE_URL = 'https://mozaczdffhifbqqcgaws.supabase.co'; // ← replace with your URL
//const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vemFjemRmZmhpZmJxcWNnYXdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MjQ1MDIsImV4cCI6MjA2NDMwMDUwMn0.vew4V_GfthSxO5iYrizEivUHjqnSQ0v9pMi0rDngrWs'; // ← replace with your anon public key

// export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// lib/supabase.ts
/* import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const { url, anonKey } = Constants.expoConfig?.extra?.supabase ?? {};

export const supabase = createClient(url, anonKey); 

/*import { createClient } from '@supabase/supabase-js';
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
}); */

// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

let NativeAsyncStorage: any = null;
if (Platform.OS !== 'web') {
  // avoid "window is not defined" during web/SSR
  NativeAsyncStorage = require('@react-native-async-storage/async-storage').default;
}

const noopStorage = {
  getItem: async (_k: string) => null,
  setItem: async (_k: string, _v: string) => {},
  removeItem: async (_k: string) => {},
};

const isServer = typeof window === 'undefined';

// Read extra from both dev (Constants) and EAS/OTA (Updates.manifest)
function readExtra() {
  const fromConstants = (Constants.expoConfig?.extra ?? {}) as any;
  const fromUpdates =
    ((Updates as any)?.manifest?.extra ??
      (Updates as any)?.manifest?.expoClient?.extra) || {};
  return { ...fromConstants, ...fromUpdates };
}

const extra = readExtra();

// Support both env vars and your nested extra.supabase shape
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  extra?.supabase?.url;

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  extra?.supabase?.anonKey;

if (__DEV__) {
  console.log('🔧 Supabase config sources', {
    hasEnvUrl: !!process.env.EXPO_PUBLIC_SUPABASE_URL,
    hasEnvKey: !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    hasExtraUrl: !!extra?.supabase?.url,
    hasExtraKey: !!extra?.supabase?.anonKey,
  });
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase config missing. Add EXPO_PUBLIC_* envs or set expo.extra.supabase.url / anonKey in app.json.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServer ? (noopStorage as any) : Platform.OS === 'web' ? undefined : NativeAsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
