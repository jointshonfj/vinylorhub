// Vinylor Hub · Edge Function „hub-containers“ — kontejnery: naskladnění do Shoptetu ve dvou krocích.
// Token je v Supabase Secrets (SHOPTET_API_TOKEN). Smí ji volat jen aktivní uživatel s 2FA (AAL2) a právem „kontejnery“.
//   { action: 'ct_check',    containerId, stockId }                 → kontrola před naskladněním (nic nezapisuje), vrací podpis kontroly
//   { action: 'ct_stock_in', containerId, stockId, sig, confirm }   → naskladnění; jen s platným podpisem a opsaným číslem kontejneru
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const BASE = 'https://api.myshoptet.com/api';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const norm = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function claims(jwt: string): Record<string, unknown> {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}
async function sha(s: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Nepřihlášen' }, 401);
    if (claims(jwt).aal !== 'aal2') return json({ error: 'Vyžaduje dvoufázové ověření.' }, 403);
    const { data: me } = await sb.from('hub_profiles').select('active, apps').eq('id', u.user.id).single();
    if (!me || !me.active || !(me.apps || []).includes('kontejnery')) return json({ error: 'Nemáš přístup k aplikaci Kontejnery.' }, 403);
    const token = Deno.env.get('SHOPTET_API_TOKEN');
    if (!token) return json({ error: 'V Supabase Secrets chybí SHOPTET_API_TOKEN.' }, 503);
    const hdr = { 'Shoptet-Private-API-Token': token, 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const call = async (method: string, path: string, body?: unknown) => {
      const r = await fetch(BASE + path, { method, headers: hdr, body: body ? JSON.stringify(body) : undefined });
      const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* ne JSON */ }
      return { status: r.status, json: j, text: j ? '' : t.slice(0, 200) };
    };
    const errText = (r: { json: any; text: string; status: number }) =>
      (r.json?.errors ? r.json.errors.map((e: any) => e.message || e.errorCode).filter(Boolean).join('; ') : r.text) || ('HTTP ' + r.status);
    const audit = (action: string, detail: Record<string, unknown>) => sb.from('hub_audit').insert({ actor: u.user.id, action, detail });
    const b = await req.json().catch(() => ({}));

    if (b.action === 'ct_check' || b.action === 'ct_stock_in') {
      const containerId = String(b.containerId || ''); const stockId = Number(b.stockId);
      if (!/^[0-9a-f-]{36}$/.test(containerId) || !Number.isInteger(stockId)) return json({ error: 'Neplatný kontejner nebo sklad.' }, 400);
      const { data: c } = await sb.from('ct_containers').select('*').eq('id', containerId).maybeSingle();
      if (!c) return json({ error: 'Kontejner nenalezen.' }, 404);
      if (c.status !== 'delivered') return json({ error: 'Kontejner musí být ve stavu „Doručeno“.' }, 409);
      const stocks = await call('GET', '/stocks');
      const stock = (stocks.json?.data?.stocks || []).find((s: any) => s.id === stockId);
      if (!stock) return json({ error: 'Takový sklad ve Shoptetu neexistuje.' }, 400);
      const { data: items } = await sb.from('ct_items').select('*').eq('container_id', containerId).order('sort').order('created_at');
      const { data: done } = await sb.from('ct_stock_log').select('item_id').eq('container_id', containerId);
      const doneIds = new Set((done || []).map((x: any) => x.item_id));
      const rows = (items || []).filter((i: any) => !i.custom && !i.skip && !i.stocked && !doneIds.has(i.id)).map((i: any) => ({ id: i.id, code: String(i.code || '').trim(), name: i.name, unit: i.unit, amount: Number(i.got ?? i.qty) }));
      if (!rows.length) return json({ error: 'Není co naskladňovat.' }, 409);
      if (rows.length > 150) return json({ error: 'Kontejner má víc než 150 položek.' }, 400);
      const { data: prods } = await sb.from('hub_products').select('code,name').in('code', rows.map(r => r.code));
      const known = new Map((prods || []).map((p: any) => [p.code, p.name]));
      const problems: { id: string; code: string; message: string }[] = [];
      const seen = new Set<string>();
      for (const r of rows) {
        if (!r.code || !Number.isFinite(r.amount) || r.amount <= 0 || r.amount > 1_000_000) problems.push({ id: r.id, code: r.code, message: 'Neplatný kód nebo množství.' });
        else if (!known.has(r.code)) problems.push({ id: r.id, code: r.code, message: 'Tenhle kód není v databázi produktů ze Shoptetu.' });
        if (seen.has(r.code)) problems.push({ id: r.id, code: r.code, message: 'Kód je v kontejneru dvakrát — sluč řádky.' });
        seen.add(r.code);
      }
      const sig = await sha(JSON.stringify([containerId, stockId, rows.map(r => [r.id, r.code, r.amount])]));

      if (b.action === 'ct_check') {
        return json({ ok: problems.length === 0, problems, sig, stock: { id: stockId, title: stock.title }, number: c.number, lines: rows.map(r => ({ ...r, shop: known.get(r.code) ?? null })) });
      }

      // ---- naskladnění: platná kontrola + opsané číslo kontejneru ----
      if (problems.length) return json({ error: 'Kontrola našla problémy — oprav je a spusť kontrolu znovu.', problems }, 409);
      if (!norm(c.number) || norm(b.confirm) !== norm(c.number)) return json({ error: 'Číslo kontejneru nesedí. Opiš ho přesně.' }, 400);
      if (String(b.sig || '') !== sig) return json({ error: 'Obsah kontejneru se od kontroly změnil. Spusť kontrolu znovu.' }, 409);
      const results: { id: string; code: string; status: string; message?: string }[] = [];
      for (const r of rows) {
        const { error: le } = await sb.from('ct_stock_log').insert({ container_id: containerId, item_id: r.id, code: r.code, amount: r.amount, stock_id: stockId, actor: u.user.id });
        if (le) { const dup = (le as { code?: string }).code === '23505'; results.push({ id: r.id, code: r.code, status: dup ? 'duplicate' : 'error', message: dup ? 'Tato položka už byla do Shoptetu odeslána.' : le.message }); continue; }
        let res;
        try { res = await call('PATCH', `/stocks/${stockId}/movements`, { data: [{ productCode: r.code, amountChange: r.amount }] }); }
        catch (e) { res = { status: 0, json: null, text: (e as Error).message }; }
        const failed = res.status !== 200 || (res.json?.errors && res.json.errors.length);
        if (failed) {
          if (res.status !== 0) await sb.from('ct_stock_log').delete().eq('container_id', containerId).eq('item_id', r.id);
          results.push({ id: r.id, code: r.code, status: 'error', message: res.status === 0 ? 'Spojení se Shoptetem se přerušilo — ověř stav ve Shoptetu a napiš správci, než to zkusíš znovu.' : errText(res) });
        } else {
          await sb.from('ct_stock_log').update({ request_id: res.json?.metadata?.requestId ?? null }).eq('container_id', containerId).eq('item_id', r.id);
          await sb.from('ct_items').update({ stocked: true }).eq('id', r.id);
          results.push({ id: r.id, code: r.code, status: 'ok' });
        }
        await sleep(250);
      }
      const { data: left } = await sb.from('ct_items').select('id').eq('container_id', containerId).eq('stocked', false).eq('skip', false).eq('custom', false);
      const all = !(left || []).length;
      await sb.from('ct_containers').update({ stock_id: stockId, updated_at: new Date().toISOString(), ...(all ? { stocked_at: new Date().toISOString() } : {}) }).eq('id', containerId);
      await audit('shoptet_container_stock_in', { container: c.number, stock: stockId, ok: results.filter(x => x.status === 'ok').length, failed: results.filter(x => x.status === 'error').length });
      return json({ ok: true, results, all });
    }
    return json({ error: 'Neznámá akce' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
