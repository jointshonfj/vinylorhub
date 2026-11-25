// Vinylor Hub · Edge Function „hub-product-media“ — fotka a odkaz na e-shop k produktům v kontejnerech.
// Jen ČTE ze Shoptet API (token v Supabase Secrets: SHOPTET_API_TOKEN) a ukládá do tabulky hub_product_media.
// Volá ji plánovač (anon) i aplikace (2FA). Kódy si bere z ct_items — zvenku se žádné neposílají.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function claims(jwt: string): Record<string, unknown> {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}
const CDN = 'https://cdn.myshoptet.com/usr/www.vinylor.cz/user/shop/';
const FRESH_MS = 7 * 86400_000, RETRY_MS = 6 * 3600_000, BATCH = 40;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const c = claims((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
    if (c.role !== 'anon' && c.aal !== 'aal2') return json({ error: 'Vyžaduje dvoufázové ověření.' }, 403);
    const token = Deno.env.get('SHOPTET_API_TOKEN');
    if (!token) return json({ error: 'V Supabase Secrets chybí SHOPTET_API_TOKEN.' }, 503);

    const { data: items, error: e1 } = await sb.from('ct_items').select('code').eq('custom', false).limit(5000);
    if (e1) throw new Error(e1.message);
    const { data: have, error: e2 } = await sb.from('hub_product_media').select('code,error,fetched_at').limit(5000);
    if (e2) throw new Error(e2.message);
    const known = new Map((have || []).map((x: any) => [x.code, x]));
    const todo = [...new Set((items || []).map((i: any) => String(i.code || '').trim()).filter(Boolean))].filter(code => {
      const k: any = known.get(code);
      return !k || Date.now() - Date.parse(k.fetched_at) > (k.error ? RETRY_MS : FRESH_MS);
    }).slice(0, BATCH);

    let ok = 0, failed = 0;
    for (const code of todo) {
      const row: Record<string, unknown> = { code, error: '', fetched_at: new Date().toISOString() };
      try {
        const r = await fetch('https://api.myshoptet.com/api/products/code/' + encodeURIComponent(code) + '?include=images', { headers: { 'Shoptet-Private-API-Token': token, Accept: 'application/json' } });
        if (r.status === 429) break;
        const j: any = await r.json().catch(() => null);
        const p = j?.data?.product ?? j?.data;
        if (r.status !== 200 || !p) throw new Error((j?.errors || []).map((x: any) => x.message || x.errorCode).join('; ') || 'HTTP ' + r.status);
        // fotka varianty (barvy), jinak hlavní fotka produktu
        const variant = (p.variants || []).find((v: any) => v.code === code);
        const img = (p.images || []).find((x: any) => variant?.image && x.name === variant.image) || (p.images || []).find((x: any) => x.isMainImage) || (p.images || [])[0];
        const small = (img?.signedCdnNames || []).find((x: any) => x.type === 'related')?.name;
        row.image = img?.cdnName ? CDN + 'big/' + img.cdnName : '';
        row.thumb = small ? CDN + 'related/' + small : row.image;
        row.url = p.visibility !== 'hidden' && String(p.url || '').startsWith('https://www.vinylor.cz/') ? p.url : '';
        ok++;
      } catch (e) { row.error = (e as Error).message.slice(0, 300); failed++; }
      const { error } = await sb.from('hub_product_media').upsert(row, { onConflict: 'code' });
      if (error) throw new Error(error.message);
      await sleep(350);
    }
    return json({ ok: true, loaded: ok, failed, asked: todo.length });
  } catch (e) { return json({ ok: false, error: (e as Error).message }, 500); }
});
