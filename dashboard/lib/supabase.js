// supabase.js — init client + helpers de RPC (Dashboard Lead Gen · Dr. Duprat)
const SB_URL = 'https://viflrlxwvziimdbbcgtf.supabase.co';
const SB_KEY = 'sb_publishable_zEi5XvniJ8UWi4w2ozK1YA_f-GgrOl9';

// Cliente escopado: Dr. Duprat
export const CLIENT_ID = 'e857d86a-b7b6-4227-88ca-f20689eff687';

// supabase-js carregado via CDN UMD em <script>, expoe window.supabase.createClient
export const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
  auth: { persistSession: false }
});

// Helper: chama RPC e levanta erro com contexto
export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    console.error(`[rpc:${name}]`, error);
    throw new Error(`RPC ${name}: ${error.message}`);
  }
  return data;
}

export const SUPABASE_URL = SB_URL;
