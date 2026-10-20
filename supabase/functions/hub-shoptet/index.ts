// Vinylor Hub · Edge Function „hub-shoptet“ — jediné místo, které mluví se Shoptet Private API.
// Token je v Supabase Secrets (SHOPTET_API_TOKEN), nikdy se nevrací do prohlížeče.
// Smí ji volat jen přihlášený aktivní uživatel s dokončeným 2FA (AAL2). Každý zápis jde do bezpečnostního deníku.
//   { action: 'status' }                                   → spojení, sklady, stavy objednávek (jen správce)
//   { action: 'stock_in', receiptId, stockId, items: [{ id, code, amount }] }  → naskladnění (jen přírůstek, nikdy přepsání)
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const BASE = 'https://api.myshoptet.com/api';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function claims(jwt: string): Record<string, unknown> {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Nepřihlášen' }, 401);
    if (claims(jwt).aal !== 'aal2') return json({ error: 'Vyžaduje dvoufázové ověření.' }, 403);
    const { data: me } = await sb.from('hub_profiles').select('role, active').eq('id', u.user.id).single();
    if (!me || !me.active) return json({ error: 'Účet nemá přístup.' }, 403);
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

    if (b.action === 'status') {
      if (me.role !== 'admin') return json({ error: 'Jen pro správce.' }, 403);
      const [eshop, stocks, statuses, products] = await Promise.all([
        call('GET', '/eshop'), call('GET', '/stocks'), call('GET', '/orders/statuses'), call('GET', '/products?itemsPerPage=1'),
      ]);
      if (eshop.status === 401 || eshop.status === 403) return json({ ok: false, error: 'Shoptet odmítl token (' + errText(eshop) + '). Zkontroluj ho v administraci.' });
      const d = eshop.json?.data || {};
      return json({
        ok: eshop.status === 200,
        shop: { company: d.contactInformation?.company || d.billingInformation?.company || null, urls: d.urls ?? null },
        stocks: (stocks.json?.data?.stocks || []).map((s: any) => ({ id: s.id, title: s.title })),
        defaultStockId: stocks.json?.data?.defaultStockId ?? null,
        statuses: (statuses.json?.data?.statuses || []).map((s: any) => ({ id: s.id, name: s.name })),
        products: products.json?.data?.paginator?.totalCount ?? null,
      });
    }

    if (b.action === 'stock_in') {
      const stockId = Number(b.stockId);
      const receiptId = String(b.receiptId || '');
      const items = Array.isArray(b.items) ? b.items : [];
      if (!Number.isInteger(stockId) || !/^[0-9a-f-]{36}$/.test(receiptId)) return json({ error: 'Neplatná příjemka nebo sklad.' }, 400);
      if (!items.length || items.length > 100) return json({ error: 'Pošli 1 až 100 položek.' }, 400);
      const { data: rc } = await sb.from('stock_receipts').select('id').eq('id', receiptId).eq('deleted', false).maybeSingle();
      if (!rc) return json({ error: 'Příjemka nenalezena.' }, 404);
      const stocks = await call('GET', '/stocks');
      if (!(stocks.json?.data?.stocks || []).some((s: any) => s.id === stockId)) return json({ error: 'Takový sklad ve Shoptetu neexistuje.' }, 400);

      const results: { id: string; code: string; status: string; message?: string }[] = [];
      for (const it of items) {
        const id = String(it.id || '').slice(0, 40), code = String(it.code || '').trim().slice(0, 64), amount = Number(it.amount);
        if (!id || !code || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) { results.push({ id, code, status: 'error', message: 'Neplatný kód nebo množství.' }); continue; }
        // 1) zamknout položku v deníku PŘED odesláním
        const { error: le } = await sb.from('shoptet_stock_log').insert({ receipt_id: receiptId, item_id: id, code, amount, stock_id: stockId, actor: u.user.id });
        if (le) {
          if ((le as { code?: string }).code === '23505') results.push({ id, code, status: 'duplicate', message: 'Tato položka už byla do Shoptetu odeslána.' });
          else results.push({ id, code, status: 'error', message: le.message });
          continue;
        }
        // 2) odeslat přírůstek (amountChange = relativní změna, nikdy absolutní přepsání)
        let r;
        try { r = await call('PATCH', `/stocks/${stockId}/movements`, { data: [{ productCode: code, amountChange: amount }] }); }
        catch (e) { r = { status: 0, json: null, text: (e as Error).message }; }
        const failed = r.status !== 200 || (r.json?.errors && r.json.errors.length);
        if (failed) {
          // chyba je jednoznačná (Shoptet nic nezapsal) → odemknout, ať jde zkusit znovu. Při výpadku spojení (status 0) zámek ZŮSTÁVÁ.
          if (r.status !== 0) await sb.from('shoptet_stock_log').delete().eq('receipt_id', receiptId).eq('item_id', id);
          results.push({ id, code, status: 'error', message: r.status === 0 ? 'Spojení se Shoptetem se přerušilo — ověř stav ve Shoptetu a napiš správci, než to zkusíš znovu.' : errText(r) });
        } else {
          await sb.from('shoptet_stock_log').update({ request_id: r.json?.metadata?.requestId ?? null }).eq('receipt_id', receiptId).eq('item_id', id);
          results.push({ id, code, status: 'ok' });
        }
        await sleep(250); // šetříme limity Shoptet API
      }
      await audit('shoptet_stock_in', { receipt: receiptId, stock: stockId, ok: results.filter(x => x.status === 'ok').length, failed: results.filter(x => x.status === 'error').length, duplicate: results.filter(x => x.status === 'duplicate').length });
      return json({ ok: true, results });
    }
    return json({ error: 'Neznámá akce' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
