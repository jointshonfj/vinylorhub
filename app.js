// Vinylor Hub — frontend (GitHub Pages + Supabase)
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { offerPdf } from './pdf.js';

const { createClient } = window.supabase; // knihovna je přímo v aplikaci (vendor/supabase.js)
// Relace: na důvěryhodném zařízení přežije zavření prohlížeče (localStorage), jinak jen do zavření okna (sessionStorage).
const trustedDevice = () => { try { return localStorage.getItem('vh_trusted') === '1'; } catch { return false; } };
const setTrusted = on => { try { on ? localStorage.setItem('vh_trusted', '1') : localStorage.removeItem('vh_trusted'); } catch {} };
const authStore = () => { try { return trustedDevice() ? localStorage : sessionStorage; } catch { return null; } };
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: {
  persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'vh-auth',
  storage: {
    getItem: k => { try { return authStore()?.getItem(k) ?? null; } catch { return null; } },
    setItem: (k, v) => { try { authStore()?.setItem(k, v); } catch {} },
    removeItem: k => { try { localStorage.removeItem(k); } catch {} try { sessionStorage.removeItem(k); } catch {} },
  },
} });
const Calc = window.Calc;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const M = Calc.money;
const STATUSES = { draft: 'Koncept', sent: 'Odeslána', postponed: 'Odložena', confirmed: 'Překlopena do Shoptetu', rejected: 'Zamítnuta' };
const STATUS_ORDER = Object.keys(STATUSES);
const STATUS_HINT = {
  draft: 'rozpracovaná, zákazník ji ještě nemá',
  sent: 'zákazník nabídku dostal',
  postponed: 'líbí se mu, ale ještě se nerozhodl',
  confirmed: 'potvrzeno, objednávka je v Shoptetu',
  rejected: 'zákazník nabídku odmítl',
};
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const S = { me: null, users: [], offers: [], settings: null, products: null, view: ls.get('vh_view') || 'board', q: '', who: '', fStatus: '' };
const CREDIT = `<div class="credit">Postaveno na struktuře <b>SmartJoi</b>™<br>vytvořil <a href="https://www.jointshon.cz" target="_blank" rel="noopener">jointshon.cz</a></div>`;
let leaveGuard = null;
let routeCleanup = null; // úklid při odchodu z obrazovky (např. živé odběry)

// ---------- pomocné ----------
function check({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}
async function fetchAll(build) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const rows = check(await build().range(from, from + page - 1));
    out.push(...rows);
    if (rows.length < page) return out;
  }
}
const userName = id => (S.users.find(u => u.id === id) || {}).name || '';
const initials = id => userName(id).split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase() || '?';
const czDate = s => { if (!s) return ''; const d = new Date(s.length === 10 ? s + 'T00:00' : s); return d.toLocaleDateString('cs-CZ'); };
const czDateTime = s => new Date(s).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ago = s => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'právě teď'; if (m < 60) return `před ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `před ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? 'včera' : `před ${d} dny`;
};
const daysSince = s => Math.floor((Date.now() - new Date(s).getTime()) / 864e5);
const custLabel = c => c.company || c.name || c.email || c.phone || 'Bez zákazníka';
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stat = s => `<span class="st" data-s="${s}">${esc(STATUSES[s] || s)}</span>`;
const emptyCustomer = () => ({ name: '', company: '', ico: '', dic: '', street: '', city: '', country: 'Česká republika', email: '', phone: '' });
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toNum = v => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const numStr = n => String(n ?? '').replace('.', ',');
function highlight(text, q) {
  const t = String(text ?? ''); const tokens = fold(q).split(/\s+/).filter(x => x.length > 1);
  if (!tokens.length) return esc(t);
  const f = fold(t); const marks = new Array(t.length).fill(false);
  for (const tok of tokens) { let i = f.indexOf(tok); while (i >= 0) { for (let k = i; k < i + tok.length; k++) marks[k] = true; i = f.indexOf(tok, i + 1); } }
  let out = '', open = false;
  for (let i = 0; i < t.length; i++) {
    if (marks[i] && !open) { out += '<mark>'; open = true; } else if (!marks[i] && open) { out += '</mark>'; open = false; }
    out += esc(t[i]);
  }
  return out + (open ? '</mark>' : '');
}
function tween(el, to, fmt = M) {
  if (!el) return;
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 420;
  const step = now => { const p = Math.min(1, Math.max(0, (now - t0) / dur)); const e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => { if (Number(el.dataset.v) === to) el.textContent = fmt(to); }, dur + 80); // pojistka (např. tab na pozadí)
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ---------- toast, dialogy, menu ----------
function toast(msg, opts = {}) {
  if (opts === true) opts = { err: true };
  const d = document.createElement('div');
  d.className = 't' + (opts.err ? ' err' : '');
  d.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button>${esc(opts.action.label)}</button>` : ''}`;
  const close = () => { d.classList.add('out'); setTimeout(() => d.remove(), 250); };
  if (opts.action) $('button', d).onclick = () => { opts.action.fn(); close(); };
  $('#toast').appendChild(d);
  setTimeout(close, opts.action ? 6000 : opts.err ? 5000 : 2600);
}
function modal({ title, body = '', actions = [{ label: 'Zavřít', value: null }], focus }) {
  return new Promise(resolve => {
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${body}<div class="acts">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
    const done = v => { bd.classList.add('out'); document.removeEventListener('keydown', key); setTimeout(() => bd.remove(), 150); resolve(v); };
    const valueOf = a => (typeof a.value === 'function' ? a.value(bd) : a.value);
    const key = e => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { const a = actions[actions.length - 1]; e.preventDefault(); done(valueOf(a)); }
    };
    bd.addEventListener('mousedown', e => { if (e.target === bd) done(null); });
    $$('[data-i]', bd).forEach(b => b.onclick = () => done(valueOf(actions[b.dataset.i])));
    document.addEventListener('keydown', key);
    document.body.appendChild(bd);
    setTimeout(() => { const f = focus ? $(focus, bd) : $('.acts .btn:last-child', bd); if (f) { f.focus(); if (f.select) f.select(); } }, 30);
  });
}
const confirmBox = (title, text, { ok = 'Potvrdit', danger = false } = {}) => modal({
  title, body: `<p>${esc(text)}</p>`, actions: [{ label: 'Zrušit', value: false }, { label: ok, value: true, cls: danger ? 'danger solid' : 'primary' }],
});
const promptBox = (title, label, value = '', { placeholder = '', ok = 'Uložit', text = '' } = {}) => modal({
  title, body: `${text ? `<p>${esc(text)}</p>` : ''}<label>${esc(label)}</label><input class="pin" value="${esc(value)}" placeholder="${esc(placeholder)}">`,
  focus: '.pin', actions: [{ label: 'Zrušit', value: null }, { label: ok, value: bd => $('.pin', bd).value, cls: 'primary' }],
});
const passwordBox = (who, pw) => modal({
  title: 'Dočasné heslo', body: `<p>Předej ho uživateli <b>${esc(who)}</b>. Po prvním přihlášení si ho změní.</p><div class="pw">${esc(pw)}</div>`,
  actions: [{ label: 'Zkopírovat a zavřít', value: true, cls: 'primary' }],
}).then(() => navigator.clipboard?.writeText(pw).catch(() => {}));
function popMenu(anchor, items) {
  document.querySelectorAll('.menu').forEach(m => m.remove());
  return new Promise(resolve => {
    const m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = items.map((it, i) => `<button data-i="${i}" ${it.s ? `data-s="${it.s}"` : ''}>${esc(it.label)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.top = (r.bottom + m.offsetHeight + 8 > innerHeight ? r.top - m.offsetHeight - 6 : r.bottom + 6) + 'px';
    const close = v => { m.remove(); document.removeEventListener('mousedown', out, true); resolve(v); };
    const out = e => { if (!m.contains(e.target)) close(null); };
    setTimeout(() => document.addEventListener('mousedown', out, true));
    $$('button', m).forEach(b => b.onclick = e => { e.stopPropagation(); close(items[b.dataset.i].value); });
  });
}

// ---------- data ----------
const fromRow = r => ({
  id: r.id, number: r.number, status: r.status, statusAt: r.status_at, date: r.date, validUntil: r.valid_until,
  customer: { ...emptyCustomer(), ...(r.customer || {}) }, recipient: r.recipient || '', items: r.items || [],
  note: r.note || '', terms: r.terms || '', shoptetOrder: r.shoptet_order || '', net: Number(r.net), total: Number(r.total),
  createdBy: r.created_by, issuedBy: r.issued_by, lastEditBy: r.last_edit_by, version: r.version,
  createdAt: r.created_at, updatedAt: r.updated_at, commentCount: r.offer_comments ? r.offer_comments[0]?.count || 0 : 0,
});
async function loadSettings() {
  S.settings = check(await sb.from('hub_settings').select('*').eq('id', 1).single());
  return S.settings;
}
const cfg = () => S.settings.data;
async function loadUsers() {
  S.users = check(await sb.from('hub_profiles').select('*').order('name'));
  S.me = S.users.find(u => u.id === S.me.id) || S.me;
}
async function loadProducts(force) {
  if (S.products && !force) return S.products;
  const rows = await fetchAll(() => sb.from('hub_products').select('code,name,variant,supplier,price_vat,action_price,visible').order('code'));
  S.products = rows.map(p => ({ ...p, priceVat: Number(p.price_vat), actionPrice: p.action_price == null ? null : Number(p.action_price), fcode: fold(p.code), text: fold(`${p.code} ${p.name} ${p.variant} ${p.supplier}`) }));
  return S.products;
}
function searchProducts(q, includeHidden) {
  const fq = fold(q).trim();
  const tokens = fq.split(/\s+/).filter(Boolean);
  if (!tokens.length || !S.products) return [];
  const out = [];
  for (const p of S.products) {
    if (!includeHidden && !p.visible) continue;
    if (!tokens.every(t => p.text.includes(t))) continue;
    out.push({ score: (p.fcode === fq ? 0 : p.fcode.startsWith(fq) ? 1 : 2) + (p.visible ? 0 : 3), p });
  }
  out.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name, 'cs') || a.p.code.localeCompare(b.p.code));
  return out.slice(0, 40).map(x => x.p);
}
// dřívější zákazníci z nabídek (pro rychlé vyplnění)
async function knownCustomers() {
  if (!S.offers.length) { try { await refreshOffers(true); } catch {} }
  const map = new Map();
  for (const o of S.offers) {
    const c = o.customer; if (!c.name && !c.company) continue;
    const key = fold(c.ico || c.email || c.company + '|' + c.name);
    if (!map.has(key)) map.set(key, { ...c, _last: o.date, _count: 1 }); else map.get(key)._count++;
  }
  return [...map.values()];
}
// ARES — veřejný registr firem (CORS povolený)
const ARES = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty';
function aresMap(x) {
  const s = x.sidlo || {};
  const cislo = [s.cisloDomovni, s.cisloOrientacni].filter(Boolean).join('/') + (s.cisloOrientacniPismeno || '');
  const street = s.nazevUlice ? `${s.nazevUlice} ${cislo}` : [s.nazevCastiObce || s.nazevObce, cislo].filter(Boolean).join(' ');
  const psc = s.psc ? String(s.psc).replace(/^(\d{3})(\d{2})$/, '$1 $2') : '';
  return {
    company: x.obchodniJmeno || '', ico: x.ico || '', dic: x.dic || '',
    street: street.trim(), city: [psc, s.nazevMestskehoObvodu || s.nazevObce].filter(Boolean).join(' '),
    country: s.nazevStatu || 'Česká republika', _addr: s.textovaAdresa || '',
  };
}
async function aresSearch(q) {
  const t = /^[\d\s]+$/.test(q.trim()) ? q.replace(/\s/g, '') : q.trim();
  if (/^\d{6,8}$/.test(t)) {
    const r = await fetch(`${ARES}/${t.padStart(8, '0')}`);
    if (!r.ok) return [];
    return [aresMap(await r.json())];
  }
  if (t.length < 3) return [];
  const r = await fetch(`${ARES}/vyhledat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ obchodniJmeno: t, pocet: 6 }) });
  if (!r.ok) return [];
  return ((await r.json()).ekonomickeSubjekty || []).map(aresMap);
}

// ---------- router ----------
async function route() {
  const h = location.hash || '#/';
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  if (idleExpired()) return logout('Odhlášeno po 2 hodinách nečinnosti.');
  const { data: aal, error: aalErr } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalErr || aal?.currentLevel !== 'aal2') { S.me = null; return renderMfa(); }
  touchActivity();
  if (!S.me) {
    try {
      S.me = { id: session.user.id };
      await loadUsers();
      if (!S.users.some(u => u.id === session.user.id)) throw new Error('Tento účet nemá do Vinylor Hubu přístup.');
      await loadSettings();
    } catch (e) {
      return logout(e.message);
    }
  }
  if (leaveGuard) { const g = leaveGuard; leaveGuard = null; await g(); }
  if (S.me.must_change && h !== '#/ucet') { location.hash = '#/ucet'; return; }
  if (routeCleanup) { const c = routeCleanup; routeCleanup = null; c(); }
  document.querySelectorAll('.menu, .sumbar').forEach(m => m.remove());
  let m;
  if ((m = h.match(/^#\/o\/([\w-]+)/))) return renderEditor(m[1]);
  if ((m = h.match(/^#\/s\/([\w-]+)/))) return renderReceipt(m[1]);
  if (h === '#/sklad') return renderStock();
  if (h === '#/navstevy') return renderVisits();
  if (h === '#/nastenka') return renderBoards();
  if ((m = h.match(/^#\/b\/([\w-]+)/))) return renderBoard(m[1]);
  if (h === '#/nastaveni') return renderSettings();
  if (h === '#/ucet') return renderAccount();
  return renderOffers();
}
window.addEventListener('hashchange', route);
route();
window.addEventListener('focus', () => { if ((location.hash || '#/') === '#/' && S.me) refreshOffers().catch(() => {}); });

function shell(active, inner) {
  const nav = (href, key, icon, label) => `<a href="${href}" class="${active === key ? 'on' : ''}"><span class="ico">${icon}</span><span>${label}</span></a>`;
  if (!$('.shell')) {
    $('#app').innerHTML = `
    <div class="mobile-top"><button id="menuBtn" aria-label="Menu">☰</button><b>Vinylor Hub</b></div>
    <div class="shell">
      <aside class="side" id="side"></aside>
      <main class="main" id="main"></main>
    </div>`;
    $('#menuBtn').onclick = () => $('#side').classList.toggle('open');
  }
  $('#side').innerHTML = `
    <a class="brand" href="#/"><img src="img/icon.png" alt=""><span>Vinylor Hub<small>automatizace</small></span></a>
    <nav class="nav">
      ${nav('#/', 'offers', '📄', 'Nabídky')}
      ${nav('#/sklad', 'stock', '📦', 'Naskladnění')}
      ${nav('#/navstevy', 'visits', '🚶', 'Návštěvnost')}
      ${nav('#/nastenka', 'boards', '🗂️', 'Nástěnka')}
      <div class="nav-h">Připravujeme</div>
      <a class="soon" href="#"><span class="ico">🚚</span><span>Objednávky</span><em>brzy</em></a>
      <div class="nav-h">Systém</div>
      ${nav('#/nastaveni', 'settings', '⚙️', 'Nastavení')}
      ${nav('#/ucet', 'account', '👤', 'Můj účet')}
    </nav>
    <div class="me"><div class="who"><span class="av lg">${initials(S.me.id)}</span><div><b>${esc(S.me.name)}</b><a href="#/ucet">Účet</a><a href="#" id="logout">Odhlásit</a></div></div>${CREDIT}</div>`;
  $('#logout').onclick = e => { e.preventDefault(); logout(); };
  $('#side').onclick = e => { if (e.target.closest('a')) $('#side').classList.remove('open'); };
  // nový <main> bez posluchačů z předchozí obrazovky
  const old = $('#main'); const main = old.cloneNode(false); old.replaceWith(main);
  main.className = 'main';
  main.innerHTML = inner;
  void main.offsetWidth; main.classList.add('enter');
  window.scrollTo(0, 0);
}

// ---------- přihlášení (e-mail + heslo → kód z aplikace 2FA) ----------
const IDLE_MS = 2 * 60 * 60 * 1000; // po 2 hodinách nečinnosti odhlásit
const touchActivity = () => { try { localStorage.setItem('vh_act', String(Date.now())); } catch {} };
const idleExpired = () => { try { const t = Number(localStorage.getItem('vh_act') || 0); return t && Date.now() - t > IDLE_MS; } catch { return false; } };
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (S.me) touchActivity(); }, { passive: true }));
setInterval(() => { if (S.me && idleExpired()) logout('Odhlášeno po 2 hodinách nečinnosti.'); }, 60_000);

async function logout(msg = '', scope = 'local') {
  if (leaveGuard) { try { await leaveGuard(); } catch {} leaveGuard = null; }
  if (routeCleanup) { try { routeCleanup(); } catch {} routeCleanup = null; }
  try { await sb.rpc('hub_log', { p_action: 'logout', p_detail: { scope } }); } catch {}
  try { await sb.auth.signOut({ scope }); } catch {}
  Object.assign(S, { me: null, users: [], offers: [], products: null, settings: null });
  document.querySelectorAll('.sumbar, .backdrop, .menu').forEach(x => x.remove());
  history.replaceState(null, '', location.pathname + location.search + '#/');
  renderLogin(msg);
}

const loginFails = { n: 0, until: 0 };
async function renderLogin(msg = '') {
  let lastEmail = '';
  try { lastEmail = localStorage.getItem('vh_last_email') || ''; } catch {}
  $('#app').innerHTML = `
  <div class="login"><form class="panel" id="lf" autocomplete="on">
    <img class="logo" src="img/logo.png" alt="Vinylor">
    <h1>Vinylor Hub</h1>
    <div class="f"><label for="le-mail">E-mail</label><input id="le-mail" name="email" type="email" autocomplete="username" required value="${esc(lastEmail)}" placeholder="jmeno@vinylor.cz"></div>
    <div class="f"><label for="le-pw">Heslo</label><input id="le-pw" name="password" type="password" autocomplete="current-password" required></div>
    <label class="trust"><input type="checkbox" id="le-trust" ${trustedDevice() ? 'checked' : ''}> Důvěryhodné zařízení <span class="muted">— zůstat přihlášen i po zavření prohlížeče</span></label>
    <div class="err" id="le" role="alert">${esc(msg)}</div>
    <button class="btn primary lg" style="width:100%;margin-top:4px">Pokračovat</button>
    <div class="login-sec">🔒 Přístup jen pro tým Vinylor. Po hesle následuje kód z ověřovací aplikace v telefonu.</div>
    ${CREDIT}
  </form></div>`;
  $(lastEmail ? '#le-pw' : '#le-mail').focus();
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    if (Date.now() < loginFails.until) { $('#le').textContent = `Příliš mnoho pokusů. Zkus to znovu za ${Math.ceil((loginFails.until - Date.now()) / 1000)} s.`; return; }
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim().toLowerCase();
    setTrusted($('#le-trust').checked);
    const btn = $('button', e.target); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Ověřuji…';
    const { error } = await sb.auth.signInWithPassword({ email, password: String(f.get('password') || '') });
    if (error) {
      loginFails.n++; if (loginFails.n >= 5) { loginFails.until = Date.now() + 60_000 * Math.min(10, loginFails.n - 4); }
      btn.disabled = false; btn.textContent = 'Pokračovat';
      $('#le').textContent = /rate|too many/i.test(error.message) ? 'Příliš mnoho pokusů. Zkus to za chvíli.' : 'Nesprávný e-mail nebo heslo.';
      const p = $('#lf'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
      $('#le-pw').value = ''; $('#le-pw').focus();
      return;
    }
    loginFails.n = 0;
    try { localStorage.setItem('vh_last_email', email); } catch {}
    touchActivity();
    try { await sb.rpc('hub_log', { p_action: 'login', p_detail: { trusted: trustedDevice(), ua: navigator.userAgent.slice(0, 120) } }); } catch {}
    S.me = null;
    route();
  };
}

// druhý krok: ověřovací kód (TOTP) — nebo první nastavení 2FA
async function renderMfa() {
  let prof = null;
  try { prof = check(await sb.rpc('hub_my_profile'))[0]; } catch {}
  if (!prof || !prof.active) { await logout('Tento účet nemá do Vinylor Hubu přístup.'); return; }
  const { data: lf, error } = await sb.auth.mfa.listFactors();
  if (error) { await logout('Přihlášení vypršelo, přihlas se znovu.'); return; }
  const verified = (lf.totp || []).filter(f => f.status === 'verified');
  const box = (title, body) => {
    $('#app').innerHTML = `<div class="login"><form class="panel mfa" id="mf">
      <div class="mfa-ico">🔐</div><h1>${esc(title)}</h1>${body}
      <div class="err" id="me" role="alert"></div>
      <button class="btn primary lg" style="width:100%">Ověřit</button>
      <button type="button" class="btn ghost" id="mfOut" style="width:100%;margin-top:6px">Zpět na přihlášení</button>
    </form></div>`;
    $('#mfOut').onclick = () => logout();
  };
  const codeInput = `<input id="mf-code" class="code-in" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required>`;
  let factorId;
  if (verified.length) {
    factorId = verified[0].id;
    box(`Ahoj, ${prof.name.split(' ')[0]}`, `<p class="muted">Zadej 6místný kód z ověřovací aplikace v telefonu (Google Authenticator, Microsoft Authenticator…).</p>${codeInput}`);
  } else {
    // první přihlášení: nastavení 2FA
    for (const f of (lf.all || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified')) { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch {} }
    const { data: en, error: e2 } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Vinylor Hub ' + new Date().toLocaleDateString('cs-CZ') + ' ' + Math.random().toString(36).slice(2, 6) });
    if (e2) { box('Dvoufázové ověření', `<p class="err">Nepodařilo se připravit 2FA: ${esc(e2.message)}</p>`); return; }
    factorId = en.id;
    box('Zapni si dvoufázové ověření', `
      <ol class="mfa-steps">
        <li>Nainstaluj do telefonu <b>Google Authenticator</b> nebo <b>Microsoft Authenticator</b>.</li>
        <li>V aplikaci zvol <b>Přidat účet → Naskenovat QR kód</b> a naskenuj:</li>
      </ol>
      <img class="mfa-qr" src="${esc(en.totp.qr_code)}" alt="QR kód pro ověřovací aplikaci">
      <details class="mfa-secret"><summary>Nejde naskenovat? Opiš klíč ručně</summary><code>${esc(en.totp.secret.replace(/(.{4})/g, '$1 ').trim())}</code></details>
      <ol class="mfa-steps" start="3"><li>Opiš sem 6místný kód, který aplikace ukazuje:</li></ol>${codeInput}`);
  }
  const ci = $('#mf-code'); ci.focus();
  ci.addEventListener('input', () => { ci.value = ci.value.replace(/\D/g, '').slice(0, 6); if (ci.value.length === 6) $('#mf').requestSubmit(); });
  $('#mf').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#mf .btn.primary'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Ověřuji…';
    const { error: ve } = await sb.auth.mfa.challengeAndVerify({ factorId, code: ci.value });
    if (ve) {
      btn.disabled = false; btn.textContent = 'Ověřit';
      $('#me').textContent = /rate|too many/i.test(ve.message) ? 'Příliš mnoho pokusů, chvíli počkej.' : 'Kód nesedí. Zkontroluj čas v telefonu a zadej aktuální kód.';
      ci.value = ''; ci.focus(); const p = $('#mf'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
      return;
    }
    try { await sb.rpc('hub_log', { p_action: verified.length ? 'mfa_verified' : 'mfa_enrolled', p_detail: {} }); } catch {}
    touchActivity();
    if (!verified.length) toast('Dvoufázové ověření je zapnuté ✓');
    S.me = null; route();
  };
}

// ---------- přehled nabídek ----------
const OFFER_LIST_COLS = 'id,number,status,status_at,date,valid_until,customer,created_by,issued_by,updated_at,created_at,note,shoptet_order,net,total,version,offer_comments(count)';
async function refreshOffers(silent) {
  const rows = await fetchAll(() => sb.from('offers').select(OFFER_LIST_COLS).eq('deleted', false).order('created_at', { ascending: false }));
  S.offers = rows.map(fromRow);
  if (!silent && $('#ov')) { drawStats(); drawOffersBody(); }
}
function boardSkeleton() {
  return `<div class="stats">${'<div class="panel stat"><div class="sk" style="height:12px;width:60%"></div><div class="sk" style="height:24px;width:80%;margin-top:10px"></div></div>'.repeat(4)}</div>
    <div class="board">${STATUS_ORDER.map(s => `<section class="col" data-s="${s}"><div class="col-h">${esc(STATUSES[s])}</div>${'<div class="sk" style="height:92px;margin-bottom:8px"></div>'.repeat(s === 'draft' ? 3 : 2)}</section>`).join('')}</div>`;
}
async function renderOffers() {
  shell('offers', `<div class="topbar"><h1>Nabídky</h1></div>${boardSkeleton()}`);
  try { await refreshOffers(true); } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  drawOffers();
}
function filteredOffers() {
  const q = fold(S.q).trim();
  return S.offers.filter(o => {
    if (S.who && o.issuedBy !== S.who && o.createdBy !== S.who) return false;
    if (S.view === 'list' && S.fStatus && o.status !== S.fStatus) return false;
    if (!q) return true;
    const c = o.customer;
    return fold([o.number, c.name, c.company, c.email, c.phone, c.city, c.ico, o.note, o.shoptetOrder].join(' ')).includes(q);
  });
}
async function newOffer(copyFrom = null) {
  const o = check(await sb.rpc('hub_create_offer', { p_copy_from: copyFrom }));
  location.hash = '#/o/' + o.id;
  return o;
}
function drawOffers() {
  const main = $('#main');
  main.innerHTML = `
  <div class="topbar">
    <h1>Nabídky</h1>
    <button class="btn primary" id="newOffer" title="Nová nabídka (N)">＋ Nová nabídka</button>
    <div class="search grow" style="max-width:380px"><span class="ic">⌕</span><input id="q" placeholder="Hledat číslo, zákazníka, IČO, telefon…" value="${esc(S.q)}"><span class="hint-k"><kbd>/</kbd></span></div>
    <select id="who" style="width:auto">
      <option value="">Všichni</option>
      ${S.users.map(u => `<option value="${u.id}" ${S.who === u.id ? 'selected' : ''}>${u.id === S.me.id ? 'Moje' : esc(u.name)}</option>`).join('')}
    </select>
    <div class="seg"><button data-v="board" class="${S.view === 'board' ? 'on' : ''}">Nástěnka</button><button data-v="list" class="${S.view === 'list' ? 'on' : ''}">Seznam</button></div>
  </div>
  <div id="stats"></div>
  <div id="ov"></div>`;
  main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
  $('#newOffer').onclick = async e => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> Zakládám…'; try { await newOffer(); } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = '＋ Nová nabídka'; } };
  $('#q').oninput = e => { S.q = e.target.value; drawOffersBody(); };
  $('#who').onchange = e => { S.who = e.target.value; drawStats(); drawOffersBody(); };
  $$('.seg button', main).forEach(b => b.onclick = () => { S.view = b.dataset.v; ls.set('vh_view', S.view); drawOffersBody(); $$('.seg button', main).forEach(x => x.classList.toggle('on', x === b)); });
  drawStats(); drawOffersBody();
}
function drawStats() {
  const el = $('#stats'); if (!el) return;
  const list = S.who ? S.offers.filter(o => o.issuedBy === S.who || o.createdBy === S.who) : S.offers;
  const open = list.filter(o => o.status === 'sent' || o.status === 'postponed');
  const month = new Date().toISOString().slice(0, 7);
  const won = list.filter(o => o.status === 'confirmed' && String(o.statusAt).slice(0, 7) === month);
  const decided = list.filter(o => o.status === 'confirmed' || o.status === 'rejected');
  const rate = decided.length ? Math.round(100 * decided.filter(o => o.status === 'confirmed').length / decided.length) : null;
  const late = open.filter(o => (o.status === 'sent' && daysSince(o.statusAt) >= 5) || (o.status === 'postponed' && daysSince(o.statusAt) >= 7));
  const sum = a => a.reduce((x, o) => x + o.total, 0);
  el.innerHTML = `<div class="stats">
    <div class="panel stat" style="--c:var(--s-sent)"><div class="k">Rozjednané nabídky</div><div class="v" data-n="${sum(open)}">0 Kč</div><div class="s">${open.length} × odeslaná nebo odložená</div></div>
    <div class="panel stat" style="--c:var(--s-confirmed)"><div class="k">Potvrzeno tento měsíc</div><div class="v" data-n="${sum(won)}">0 Kč</div><div class="s">${won.length} nabídek překlopeno do Shoptetu</div></div>
    <div class="panel stat" style="--c:var(--brand)"><div class="k">Úspěšnost</div><div class="v">${rate == null ? '—' : rate + ' %'}</div><div class="s">z rozhodnutých nabídek</div></div>
    <div class="panel stat" style="--c:var(--s-postponed)"><div class="k">Ozvat se zákazníkovi</div><div class="v">${late.length}</div><div class="s">${late.length ? 'nabídky čekají příliš dlouho ⏰' : 'vše v pořádku ✓'}</div></div>
  </div>`;
  $$('[data-n]', el).forEach(v => tween(v, Number(v.dataset.n), n => M(n).replace(/,\d\d$/, '') + ' Kč'));
}
async function changeStatus(o, status) {
  const args = { p_id: o.id, p_status: status, p_shoptet_order: null };
  if (status === 'confirmed') {
    const n = await promptBox('Překlopit do Shoptetu', 'Číslo objednávky v Shoptetu (nepovinné)', o.shoptetOrder || '', { placeholder: 'např. 2026001234', ok: 'Potvrdit', text: `Nabídka ${o.number} se přesune mezi potvrzené.` });
    if (n === null) return null;
    args.p_shoptet_order = n.trim();
  }
  if (status === 'rejected' && !(await confirmBox('Zamítnout nabídku?', `Nabídka ${o.number} se označí jako zamítnutá zákazníkem.`, { ok: 'Zamítnout', danger: true }))) return null;
  return fromRow(check(await sb.rpc('hub_set_offer_status', args)));
}
async function moveOffer(o, status) {
  if (!o || o.status === status) return;
  try {
    const r = await changeStatus(o, status);
    if (!r) return;
    Object.assign(o, { status: r.status, statusAt: r.statusAt, shoptetOrder: r.shoptetOrder, updatedAt: r.updatedAt, version: r.version });
    drawStats(); drawOffersBody(o.id);
    toast(`${o.number} → ${STATUSES[o.status]}`);
  } catch (err) { toast(err.message, true); }
}
function drawOffersBody(movedId) {
  const ov = $('#ov'); if (!ov) return;
  const list = filteredOffers();
  if (!S.offers.length) {
    ov.innerHTML = `<div class="panel empty-big"><div class="ill">📄</div><h3>Zatím tu nejsou žádné nabídky</h3><p>Založ první nabídku — zákazníka dohledáš v ARES, produkty se berou rovnou z e-shopu.</p><button class="btn primary lg" id="firstOffer">＋ Vytvořit první nabídku</button></div>`;
    $('#firstOffer').onclick = () => $('#newOffer').click();
    return;
  }
  if (S.view === 'list') return drawList(ov, list);
  ov.innerHTML = `<div class="board">${STATUS_ORDER.map(s => {
    const cards = list.filter(o => o.status === s).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const sum = cards.reduce((a, o) => a + o.total, 0);
    return `<section class="col" data-s="${s}" data-drop="${s}">
      <div class="col-h">${esc(STATUSES[s])} <span class="cnt">${cards.length}</span><span class="sum">${cards.length ? M(sum).replace(/,\d\d$/, '') + ' Kč' : ''}</span></div>
      ${cards.map((o, i) => card(o, i, o.id === movedId)).join('') || `<div class="empty">${esc(STATUS_HINT[s])}</div>`}
    </section>`;
  }).join('')}</div>`;
  $$('.card', ov).forEach(c => {
    c.onclick = e => { if (e.target.closest('.stbtn')) return; location.hash = '#/o/' + c.dataset.id; };
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.id); e.dataTransfer.effectAllowed = 'move'; requestAnimationFrame(() => c.classList.add('dragging')); };
    c.ondragend = () => c.classList.remove('dragging');
  });
  $$('.stbtn', ov).forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const o = S.offers.find(x => x.id === b.closest('.card').dataset.id);
    const s = await popMenu(b, STATUS_ORDER.filter(x => x !== o.status).map(x => ({ label: STATUSES[x], value: x, s: x })));
    if (s) moveOffer(o, s);
  });
  $$('.col', ov).forEach(col => {
    let depth = 0;
    col.ondragenter = e => { e.preventDefault(); depth++; col.classList.add('over'); };
    col.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    col.ondragleave = () => { if (--depth <= 0) { depth = 0; col.classList.remove('over'); } };
    col.ondrop = e => {
      e.preventDefault(); depth = 0; col.classList.remove('over');
      moveOffer(S.offers.find(x => x.id === e.dataTransfer.getData('text/plain')), col.dataset.drop);
    };
  });
}
function card(o, i, moved) {
  const d = daysSince(o.statusAt);
  const late = (o.status === 'sent' && d >= 5) || (o.status === 'postponed' && d >= 7);
  return `<article class="card${moved ? ' moved' : ''}" draggable="true" data-id="${o.id}" data-s="${o.status}" style="--i:${Math.min(i, 12)}">
    <div class="t"><span class="no">${esc(o.number)}</span><span title="${esc(czDateTime(o.updatedAt))}">${ago(o.updatedAt)}</span></div>
    <div class="cu">${highlight(custLabel(o.customer), S.q)}${o.customer.company && o.customer.name ? `<span class="muted small" style="font-weight:400"> · ${esc(o.customer.name)}</span>` : ''}</div>
    ${o.note ? `<div class="nt">${esc(o.note)}</div>` : ''}
    <div class="b">
      <span class="av" title="${esc(userName(o.issuedBy))}">${initials(o.issuedBy)}</span>
      ${o.commentCount ? `<span title="Interní komentáře">💬 ${o.commentCount}</span>` : ''}
      ${late ? `<span class="late" title="Ve stavu už ${d} dní — ozvat se zákazníkovi?">⏰ ${d} d</span>` : ''}
      ${o.shoptetOrder ? `<span title="Objednávka v Shoptetu">🛒 ${esc(o.shoptetOrder)}</span>` : ''}
      <button class="st stbtn" data-s="${o.status}" title="Změnit stav">Stav ▾</button>
      <span class="price">${M(o.total)} Kč</span>
    </div>
  </article>`;
}
function drawList(ov, list) {
  ov.innerHTML = `
  <div class="chips" style="margin-bottom:12px">
    <button class="chip ${!S.fStatus ? 'on' : ''}" data-f="">Vše <span class="muted">${S.offers.length}</span></button>
    ${STATUS_ORDER.map(s => `<button class="chip ${S.fStatus === s ? 'on' : ''}" data-f="${s}">${esc(STATUSES[s])}</button>`).join('')}
  </div>
  <div class="panel" style="overflow-x:auto"><table class="list">
    <thead><tr><th>Číslo</th><th>Zákazník</th><th>Stav</th><th>Datum</th><th>Platnost</th><th>Vystavil</th><th class="r">Bez DPH</th><th class="r">S DPH</th></tr></thead>
    <tbody>${list.map((o, i) => `<tr class="click" data-id="${o.id}" style="animation-delay:${Math.min(i, 20) * 15}ms">
      <td class="nowrap num-t"><b>${esc(o.number)}</b></td>
      <td>${highlight(custLabel(o.customer), S.q)}<div class="muted small">${esc([o.customer.email, o.customer.phone].filter(Boolean).join(' · '))}</div></td>
      <td>${stat(o.status)}</td>
      <td class="nowrap">${czDate(o.date)}</td>
      <td class="nowrap ${o.validUntil < ymd(new Date()) ? 'muted' : ''}">${czDate(o.validUntil)}</td>
      <td class="nowrap">${esc(userName(o.issuedBy))}</td>
      <td class="r nowrap num-t">${M(o.net)}</td>
      <td class="r nowrap num-t"><b>${M(o.total)}</b></td>
    </tr>`).join('') || '<tr><td colspan="8" class="empty">Nic nenalezeno</td></tr>'}</tbody>
  </table></div>`;
  $$('.chip', ov).forEach(c => c.onclick = () => { S.fStatus = c.dataset.f; drawOffersBody(); });
  $$('tr.click', ov).forEach(r => r.onclick = () => { location.hash = '#/o/' + r.dataset.id; });
}
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || $('.backdrop')) return;
  if ((location.hash || '#/') !== '#/') return;
  if (e.key === '/') { e.preventDefault(); $('#q')?.focus(); }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); $('#newOffer')?.click(); }
});

// ---------- editor nabídky ----------
function editorSkeleton() {
  return `<div class="topbar"><div class="sk" style="height:30px;width:260px"></div></div>
    <div class="ed"><div>${'<div class="panel panel-b"><div class="sk" style="height:16px;width:30%"></div><div class="sk" style="height:110px;margin-top:14px"></div></div>'.repeat(2)}</div>
    <div>${'<div class="panel panel-b"><div class="sk" style="height:150px"></div></div>'.repeat(2)}</div></div>`;
}
async function renderEditor(id) {
  shell('offers', editorSkeleton());
  let o, comments, history;
  try {
    const [row, cm, hi] = await Promise.all([
      sb.from('offers').select('*').eq('id', id).eq('deleted', false).single().then(check),
      sb.from('offer_comments').select('*').eq('offer_id', id).order('created_at').then(check),
      sb.from('offer_history').select('*').eq('offer_id', id).order('at').then(check),
      loadSettings(),
    ]);
    o = fromRow(row); comments = cm; history = hi;
  } catch (e) { $('#main').innerHTML = `<div class="panel empty-big"><div class="ill">🔍</div><h3>Nabídku se nepodařilo otevřít</h3><p>${esc(e.message)}</p><a class="btn" href="#/">← Zpět na nabídky</a></div>`; return; }
  loadProducts().catch(e => toast('Produkty: ' + e.message, true));

  const E = { dirty: false, saving: null, timer: null };
  const st = cfg();
  const step = st.priceStep;
  const c = o.customer;
  const field = (k, label, cls = 'c2', type = 'text', ph = '') => `<div class="${cls}"><label>${label}</label><input data-c="${k}" type="${type}" value="${esc(c[k])}" placeholder="${esc(ph)}"></div>`;
  const plusDays = n => { const d = new Date(o.date + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); };

  $('#main').innerHTML = `
  <div class="ed-top" id="edTop"><div class="topbar">
    <a class="btn ghost" href="#/" title="Zpět na nabídky">←</a>
    <h1>Nabídka <span class="num-t">${esc(o.number)}</span></h1>
    <span id="stBadge">${stat(o.status)}</span>
    <span class="save" id="saveState">Uloženo</span>
    <span class="grow"></span>
    <button class="btn" id="dup" title="Vytvořit kopii nabídky">⧉ <span class="hide-xs">Duplikovat</span></button>
    <button class="btn ghost danger" id="del" title="Smazat nabídku">🗑</button>
  </div></div>
  <div class="ed">
    <div>
      <section class="panel">
        <div class="panel-h"><span class="step" id="step1">1</span>Zákazník <span class="sub">— komu nabídku posíláme</span></div>
        <div class="panel-b">
          <div class="search big" id="cs"><span class="ic">⌕</span><input id="cq" placeholder="Najít zákazníka — dřívější nabídky nebo firmu v ARES (název / IČO)…" autocomplete="off"><div class="results" id="cr" hidden></div></div>
          <div class="grid" style="margin-top:14px">
            ${field('name', 'Jméno a příjmení', 'c3', 'text', 'Jan Novák')}
            ${field('company', 'Firma', 'c3', 'text', 'nepovinné')}
            ${field('email', 'E-mail', 'c3', 'email', 'jan@email.cz')}
            ${field('phone', 'Telefon', 'c3', 'tel', '+420 …')}
            ${field('street', 'Ulice a č. p.', 'c3')}
            ${field('city', 'PSČ a město', 'c3', 'text', '110 00 Praha')}
            <div class="c2"><label>IČ <span class="ares-st" id="aresSt"></span></label><input data-c="ico" inputmode="numeric" value="${esc(c.ico)}" placeholder="8 číslic → doplní se z ARES"></div>
            ${field('dic', 'DIČ')}
            ${field('country', 'Země')}
            <div class="c6"><details ${o.recipient ? 'open' : ''}><summary>Konečný příjemce / jiná adresa dodání</summary>
              <textarea data-f="recipient" rows="2" style="margin-top:8px" placeholder="např. stavba Dobříš, Pražská 12 — p. Novák 777 …">${esc(o.recipient)}</textarea></details></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-h"><span class="step" id="step2">2</span>Položky <span class="sub">— ceny z e-shopu jsou s DPH, v PDF se přepočítají bez DPH</span></div>
        <div class="panel-b">
          <div class="row">
            <div class="search big grow" id="ps"><span class="ic">⌕</span><input id="pq" placeholder="Přidat produkt — kód nebo název, např. „teak 3,6“ nebo W-01-02" autocomplete="off"><div class="results" id="pr" hidden></div></div>
            <label class="row small" style="margin:0;gap:5px;color:var(--muted)"><input type="checkbox" id="phid" style="width:auto"> i skryté</label>
            <button class="btn" id="addCustom" title="Položka mimo e-shop (doprava, montáž…)">＋ Vlastní položka</button>
          </div>
          <div class="hint">↑ ↓ vybrat · <kbd>Enter</kbd> přidat · v množství <kbd>Enter</kbd> = zpět na hledání</div>
          <div id="items"></div>
          <div class="items-foot" id="itemsFoot">
            <div class="row small muted">Sleva všem položkám
              <div class="fld" style="width:84px"><input id="allDisc" inputmode="decimal" value="${esc(numStr(st.defaultDiscount))}"><span class="suf">%</span></div>
              <button class="btn sm" id="applyDisc">Použít</button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-h"><span class="step" id="step3">3</span>Poznámka pro zákazníka <span class="sub">— zobrazí se v PDF</span></div>
        <div class="panel-b">
          <textarea data-f="note" rows="3" placeholder="např. Terasové prkno WPC teak classic duté – 2,85 a 3,6 m">${esc(o.note)}</textarea>
          <details style="margin-top:12px"><summary>Podmínky nabídky (také v PDF)</summary>
            <textarea data-f="terms" rows="8" style="margin-top:8px">${esc(o.terms)}</textarea>
            <div class="row" style="justify-content:space-between;margin-top:6px"><span class="hint" style="margin:0">{platnost} se v PDF nahradí datem platnosti.</span><button class="btn sm" id="resetTerms">Obnovit výchozí</button></div>
          </details>
        </div>
      </section>
    </div>

    <div class="side-col">
      <section class="panel">
        <div class="panel-h">Stav nabídky</div>
        <div class="panel-b">
          <div class="status-pick" id="statusPick">${STATUS_ORDER.map(s => `<button data-s="${s}" class="${o.status === s ? 'on' : ''}" title="${esc(STATUS_HINT[s])}">${esc(STATUSES[s])}</button>`).join('')}</div>
          <div id="shoptetBox" style="margin-top:12px" ${o.status === 'confirmed' ? '' : 'hidden'}>
            <label>Číslo objednávky v Shoptetu</label>
            <input data-f="shoptetOrder" value="${esc(o.shoptetOrder)}" placeholder="např. 2026001234">
          </div>
          <button class="btn sm" id="copyShoptet" style="margin-top:12px;width:100%" title="Zkopíruje kódy a množství pro rychlé založení objednávky">📋 Kopírovat položky pro Shoptet</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-h">Údaje nabídky</div>
        <div class="panel-b grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <div><label>Datum</label><input type="date" data-f="date" value="${esc(o.date)}"></div>
          <div><label>Platnost do</label><input type="date" data-f="validUntil" value="${esc(o.validUntil)}">
            <div class="quick" id="quickValid"><button data-d="7">+7 d</button><button data-d="14">+14 d</button><button data-d="30">+30 d</button></div></div>
          <div style="grid-column:span 2"><label>Vystavil</label><select data-f="issuedBy">${S.users.map(u => `<option value="${u.id}" ${o.issuedBy === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
        </div>
      </section>

      <section class="panel private">
        <div class="panel-h">🔒 Interní komentáře <span class="sub">zákazník je neuvidí</span></div>
        <div class="panel-b">
          <div id="comments"></div>
          <div class="compose"><textarea id="cmText" rows="1" placeholder="Napiš komentář…"></textarea><button class="btn primary" id="cmSend" title="Odeslat (Ctrl+Enter)">➤</button></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-h">Historie</div>
        <div class="panel-b"><div class="timeline" id="hist"></div></div>
      </section>
    </div>
  </div>`;
  document.querySelectorAll('.sumbar').forEach(x => x.remove());
  const bar = document.createElement('div');
  bar.className = 'sumbar';
  bar.innerHTML = `
    <div class="m hide-m"><span>Položek</span><b id="sbCount">0</b></div>
    <div class="m hide-m"><span>Bez DPH</span><b id="sbNet" class="num-t">0,00 Kč</b></div>
    <div class="m hide-m"><span>DPH</span><b id="sbTax" class="num-t">0,00 Kč</b></div>
    <div class="m tot"><span>Celkem s DPH</span><b id="sbTotal" class="num-t">0,00</b></div>
    <span class="grow"></span>
    <button class="btn" id="pdfView">👁 <span class="hide-m">Náhled</span></button>
    <button class="btn primary" id="pdfDl">⬇ <span class="hide-xs">Stáhnout&nbsp;</span>PDF</button>`;
  document.body.appendChild(bar);
  const onScroll = () => $('#edTop')?.classList.toggle('scrolled', scrollY > 4);
  addEventListener('scroll', onScroll, { passive: true });

  // --- kroky (zelená fajfka u hotových částí) ---
  function drawSteps() {
    const s1 = !!(o.customer.name || o.customer.company), s2 = o.items.length > 0, s3 = !!o.note.trim();
    [['#step1', s1, 1], ['#step2', s2, 2], ['#step3', s3, 3]].forEach(([sel, ok, n]) => { const el = $(sel); if (el) { el.classList.toggle('done', ok); el.textContent = ok ? '✓' : n; } });
  }

  // --- položky ---
  const lineCalc = it => Calc.line(it, step);
  const open = new Set(); // rozbalené řádky (úprava ceny, slevy, kódu…)
  const priceLine = it => `${M(it.priceVat)} Kč / ${esc(it.unit || 'ks')}${Number(it.discount) ? ` · sleva ${numStr(it.discount)} %` : ''}${Number(it.vatRate) !== 21 ? ` · DPH ${numStr(it.vatRate)} %` : ''}`;
  function itemRow(it, n, isNew) {
    const l = lineCalc(it);
    const isOpen = open.has(it.id);
    const sub = [it.code, it.variant].filter(Boolean).map(esc).join(' · ');
    return `<div class="it${isNew ? ' new' : ''}${isOpen ? ' open' : ''}" data-id="${it.id}">
      <div class="it-main">
        <span class="it-n">${n}</span>
        <div class="it-info">
          <div class="it-name" data-o="name">${esc(it.name) || '<span class="muted">Bez názvu</span>'}</div>
          <div class="it-sub" data-o="sub">${sub}</div>
          <button class="it-price" data-a="edit" title="Upravit cenu, slevu, DPH">${priceLine(it)} <span class="pen">✎</span></button>
        </div>
        <div class="it-qty"><div class="stepper"><button data-a="minus" tabindex="-1" aria-label="Méně">−</button><input data-k="qty" inputmode="decimal" value="${esc(numStr(it.qty))}" aria-label="Množství"><span class="u" data-o="unit">${esc(it.unit || 'ks')}</span><button data-a="plus" tabindex="-1" aria-label="Více">+</button></div></div>
        <div class="it-sum"><b data-o="total">${M(l.total)} Kč</b><span data-o="net">${M(l.net)} bez DPH</span></div>
        <button class="ib del it-rm" data-a="rm" title="Odebrat položku">✕</button>
      </div>
      <div class="it-edit">
        <div class="f2"><label>Název</label><textarea data-k="name" rows="1">${esc(it.name)}</textarea></div>
        <div><label>Kód</label><input data-k="code" value="${esc(it.code)}"></div>
        <div><label>Varianta</label><input data-k="variant" value="${esc(it.variant)}"></div>
        <div><label>Cena/j s DPH</label><div class="fld"><input data-k="priceVat" inputmode="decimal" value="${esc(numStr(it.priceVat))}"><span class="suf">Kč</span></div></div>
        <div><label>Jednotka</label><input data-k="unit" value="${esc(it.unit)}"></div>
        <div><label>Sleva</label><div class="fld"><input data-k="discount" inputmode="decimal" value="${esc(numStr(it.discount))}"><span class="suf">%</span></div></div>
        <div><label>DPH</label><select data-k="vatRate">${[21, 12, 0].map(r => `<option value="${r}" ${Number(it.vatRate) === r ? 'selected' : ''}>${r} %</option>`).join('')}</select></div>
        <div class="f2 it-edit-foot"><span class="muted small" data-o="unitNet">Jedn. cena bez DPH: ${M(l.unitNet)} Kč</span><button class="btn sm" data-a="edit">Hotovo</button></div>
      </div>
    </div>`;
  }
  function drawItems(newId) {
    const t = Calc.totals(o, step);
    $('#items').innerHTML = o.items.length
      ? `<div class="items">${o.items.map((it, i) => itemRow(it, i + 1, it.id === newId)).join('')}</div>
         <div class="it-total"><span>Bez DPH</span><b data-o="tnet">${M(t.net)} Kč</b><span>DPH</span><b data-o="ttax">${M(t.tax)} Kč</b><span class="big">Celkem s DPH</span><b class="big" data-o="ttot">${M(t.total)} Kč</b></div>`
      : `<div class="items-empty" style="margin-top:12px"><b>Zatím žádné položky</b>Začni psát do vyhledávání nad tímto polem — stačí kus názvu nebo kód produktu.</div>`;
    $('#itemsFoot').style.display = o.items.length ? '' : 'none';
    $$('#items textarea[data-k="name"]').forEach(autoGrow);
    drawTotals(); drawSteps();
  }
  function drawTotals() {
    const t = Calc.totals(o, step);
    $('#sbCount').textContent = o.items.length;
    $('#sbNet').textContent = M(t.net) + ' Kč';
    $('#sbTax').textContent = M(t.tax) + ' Kč';
    tween($('#sbTotal'), t.total, n => M(n) + ' Kč');
    const set = (k, v) => { const el = $(`#items [data-o="${k}"]`); if (el) el.textContent = M(v) + ' Kč'; };
    set('tnet', t.net); set('ttax', t.tax); set('ttot', t.total);
  }
  function updateRow(it) {
    const row = $(`.it[data-id="${it.id}"]`); if (!row) return;
    const l = lineCalc(it);
    $('[data-o="total"]', row).textContent = M(l.total) + ' Kč';
    $('[data-o="net"]', row).textContent = M(l.net) + ' bez DPH';
    $('[data-o="unitNet"]', row).textContent = `Jedn. cena bez DPH: ${M(l.unitNet)} Kč`;
    $('[data-o="name"]', row).innerHTML = esc(it.name) || '<span class="muted">Bez názvu</span>';
    $('[data-o="sub"]', row).innerHTML = [it.code, it.variant].filter(Boolean).map(esc).join(' · ');
    $('[data-o="unit"]', row).textContent = it.unit || 'ks';
    $('.it-price', row).innerHTML = `${priceLine(it)} <span class="pen">✎</span>`;
    drawTotals();
  }
  const numKeys = ['qty', 'priceVat', 'discount', 'vatRate'];
  const autoGrow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  const onField = e => {
    if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    const row = e.target.closest('.it'); const k = e.target.dataset.k;
    if (!row || !k) return;
    const it = o.items.find(x => x.id === row.dataset.id);
    it[k] = numKeys.includes(k) ? toNum(e.target.value) : e.target.value;
    updateRow(it); markDirty();
  };
  $('#items').addEventListener('input', onField);
  $('#items').addEventListener('change', e => { if (e.target.tagName === 'SELECT') onField(e); });
  $('#items').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.k === 'qty') { e.preventDefault(); $('#pq').focus(); }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.dataset.k === 'qty') {
      e.preventDefault(); const it = o.items.find(x => x.id === e.target.closest('.it').dataset.id);
      it.qty = Math.max(0, Calc.r2(toNum(it.qty) + (e.key === 'ArrowUp' ? 1 : -1))); e.target.value = numStr(it.qty); updateRow(it); markDirty();
    }
  });
  $('#items').addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const row = b.closest('.it'); const i = o.items.findIndex(x => x.id === row.dataset.id); const it = o.items[i];
    if (b.dataset.a === 'plus' || b.dataset.a === 'minus') {
      it.qty = Math.max(0, Calc.r2(toNum(it.qty) + (b.dataset.a === 'plus' ? 1 : -1)));
      $('[data-k="qty"]', row).value = numStr(it.qty); updateRow(it); markDirty();
    }
    if (b.dataset.a === 'edit') {
      const on = !open.has(it.id);
      on ? open.add(it.id) : open.delete(it.id);
      row.classList.toggle('open', on);
      if (on) { autoGrow($('textarea', row)); setTimeout(() => $('[data-k="priceVat"]', row).focus(), 60); }
    }
    if (b.dataset.a === 'rm') {
      row.classList.add('out');
      setTimeout(() => {
        o.items.splice(i, 1); open.delete(it.id); drawItems(); markDirty();
        toast(`Odebráno: ${it.name || 'položka'}`, { action: { label: 'Vrátit', fn: () => { o.items.splice(Math.min(i, o.items.length), 0, it); drawItems(it.id); markDirty(); } } });
      }, 200);
    }
  });
  const rid = () => crypto.randomUUID().slice(0, 12);
  function addItem(p) {
    const same = p && o.items.find(x => x.code === p.code);
    if (same) {
      same.qty = Calc.r2(toNum(same.qty) + 1); drawItems(same.id); markDirty();
      toast(`${p.code} už v nabídce je — množství +1`);
      const q = $(`.it[data-id="${same.id}"] [data-k="qty"]`); q.focus(); q.select(); return;
    }
    const it = {
      id: rid(), code: p ? p.code : '', name: p ? p.name : '', variant: p ? p.variant : '', qty: 1, unit: 'ks',
      priceVat: p ? p.priceVat : 0, discount: p ? Number(st.defaultDiscount) || 0 : 0, vatRate: Number(st.defaultVat) || 21,
    };
    if (!p) open.add(it.id);
    o.items.push(it); drawItems(it.id); markDirty();
    const inp = $(p ? '[data-k="qty"]' : '[data-k="name"]', $(`.it[data-id="${it.id}"]`));
    inp.focus(); if (inp.select) inp.select();
    inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  $('#addCustom').onclick = () => addItem(null);
  $('#applyDisc').onclick = () => {
    const d = toNum($('#allDisc').value); o.items.forEach(it => { it.discount = d; });
    drawItems(); markDirty(); toast(`Sleva ${numStr(d)} % nastavena u všech ${o.items.length} položek`);
  };

  // --- našeptávač (sdílený pro produkty i zákazníky) ---
  function suggest({ input, box, fetch: getItems, render, pick, minLen = 2, delay = 120 }) {
    let found = [], sel = 0, timer = null, seq = 0;
    const draw = () => {
      box.hidden = false;
      box.innerHTML = render(found, sel);
      $$('[data-i]', box).forEach(el => el.classList.toggle('on', Number(el.dataset.i) === sel));
      $('.on', box)?.scrollIntoView({ block: 'nearest' });
    };
    const run = async () => {
      const q = input.value.trim();
      if (q.length < minLen) { box.hidden = true; found = []; return; }
      const my = ++seq;
      const r = await getItems(q, partial => { if (my === seq) { found = partial; sel = 0; draw(); } });
      if (my !== seq) return;
      found = r; sel = 0; draw();
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, delay); });
    input.addEventListener('keydown', e => {
      if (box.hidden || !found.length) { if (e.key === 'Escape') input.blur(); return; }
      if (e.key === 'ArrowDown') { sel = Math.min(found.length - 1, sel + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter') { e.preventDefault(); done(sel); }
      if (e.key === 'Escape') box.hidden = true;
    });
    box.addEventListener('mousedown', e => { const r = e.target.closest('[data-i]'); if (r) { e.preventDefault(); done(Number(r.dataset.i)); } });
    box.addEventListener('mousemove', e => { const r = e.target.closest('[data-i]'); if (r && Number(r.dataset.i) !== sel) { sel = Number(r.dataset.i); $$('[data-i]', box).forEach(el => el.classList.toggle('on', Number(el.dataset.i) === sel)); } });
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
    input.addEventListener('focus', () => { if (found.length && input.value.trim().length >= minLen) draw(); });
    const done = i => { const x = found[i]; if (!x || x._src === 'loading') return; box.hidden = true; input.value = ''; found = []; pick(x); };
    return { rerun: run };
  }

  // produkty
  const ps = suggest({
    input: $('#pq'), box: $('#pr'),
    fetch: async q => { if (!S.products) await loadProducts(); return searchProducts(q, $('#phid').checked); },
    render: list => { const q = $('#pq').value; return list.length ? list.map((p, i) => `<div class="res" data-i="${i}">
      <code>${highlight(p.code, q)}</code>
      <div>${highlight(p.name, q)}${p.visible ? '' : '<span class="tag grey">skrytý</span>'}${p.actionPrice ? `<span class="tag">akce ${M(p.actionPrice)}</span>` : ''}${o.items.some(x => x.code === p.code) ? '<span class="tag blue">v nabídce</span>' : ''}${p.variant ? `<div class="v">${highlight(p.variant, q)}</div>` : ''}</div>
      <div class="p">${M(p.priceVat)} Kč</div></div>`).join('') : `<div class="empty">${S.products ? 'Nic nenalezeno — zkus kratší dotaz nebo zaškrtni „i skryté“' : 'Načítám produkty…'}</div>`; },
    pick: addItem,
  });
  $('#phid').onchange = () => ps.rerun();

  // zákazníci (dřívější + ARES)
  suggest({
    input: $('#cq'), box: $('#cr'), delay: 250,
    fetch: async (q, partial) => {
      const fq = fold(q);
      const known = (await knownCustomers()).filter(c => fold([c.name, c.company, c.email, c.phone, c.ico].join(' ')).includes(fq)).slice(0, 5).map(c => ({ ...c, _src: 'known' }));
      partial([...known, { _src: 'loading' }]);
      let ares = [];
      try { ares = (await aresSearch(q)).filter(a => !known.some(k => k.ico && k.ico === a.ico)).map(a => ({ ...a, _src: 'ares' })); } catch {}
      return [...known, ...ares];
    },
    render: list => {
      const q = $('#cq').value;
      const row = (c, i) => c._src === 'loading' ? `<div class="empty"><span class="spin" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px"></span> Hledám v ARES…</div>`
        : `<div class="res cust" data-i="${i}"><span class="av">${c._src === 'ares' ? '🏢' : esc((c.company || c.name || '?')[0].toUpperCase())}</span>
          <div><b>${highlight(c.company || c.name, q)}</b>${c.company && c.name ? ` · ${highlight(c.name, q)}` : ''}<div class="v">${esc(c._src === 'ares' ? c._addr : [c.email, c.phone, c.city].filter(Boolean).join(' · '))}</div></div>
          <div class="v">${c.ico ? 'IČ ' + highlight(c.ico, q) : ''}</div></div>`;
      const known = list.map((c, i) => [c, i]).filter(([c]) => c._src === 'known');
      const rest = list.map((c, i) => [c, i]).filter(([c]) => c._src !== 'known');
      if (!list.length) return '<div class="empty">Nic nenalezeno — vyplň údaje ručně níže</div>';
      return (known.length ? `<div class="grp">Dřívější zákazníci</div>${known.map(([c, i]) => row(c, i)).join('')}` : '')
        + (rest.length ? `<div class="grp">Registr firem ARES</div>${rest.map(([c, i]) => row(c, i)).join('')}` : '');
    },
    pick: x => {
      for (const k of Object.keys(emptyCustomer())) {
        const v = x[k]; if (v == null || v === '') continue;
        o.customer[k] = v;
        const inp = $(`[data-c="${k}"]`); inp.value = v; inp.classList.remove('filled'); void inp.offsetWidth; inp.classList.add('filled');
      }
      markDirty(); drawSteps();
      toast(x._src === 'ares' ? 'Údaje firmy doplněny z ARES' : 'Zákazník doplněn z dřívější nabídky');
      $(x._src === 'ares' && !o.customer.name ? '[data-c="name"]' : '#pq').focus();
    },
  });

  // --- ostatní pole ---
  // IČ → automatické doplnění firmy z ARES
  let aresT = null, aresLast = '';
  const aresSt = (txt, cls = '') => { const el = $('#aresSt'); if (el) { el.textContent = txt; el.className = 'ares-st ' + cls; } };
  async function fillFromIco(ico) {
    if (ico === aresLast) return; aresLast = ico;
    aresSt('hledám v ARES…', 'busy');
    try {
      const [f] = await aresSearch(ico);
      if (!f || !f.company) { aresSt('v ARES nenalezeno', 'err'); return; }
      for (const k of ['company', 'dic', 'street', 'city', 'country']) {
        if (!f[k]) continue;
        o.customer[k] = f[k];
        const inp = $(`[data-c="${k}"]`); inp.value = f[k]; inp.classList.remove('filled'); void inp.offsetWidth; inp.classList.add('filled');
      }
      markDirty(); drawSteps();
      aresSt('✓ doplněno z ARES', 'ok');
    } catch { aresLast = ''; aresSt('ARES teď neodpovídá', 'err'); }
  }
  $('#main').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.c === 'ico') {
      clearTimeout(aresT); aresSt('');
      const v = t.value.replace(/\s/g, '');
      if (/^\d{8}$/.test(v)) aresT = setTimeout(() => fillFromIco(v), 250);
    }
    if (t.dataset.c) { o.customer[t.dataset.c] = t.value; markDirty(); drawSteps(); }
    else if (t.dataset.f) { o[t.dataset.f] = t.value; markDirty(); if (t.dataset.f === 'note') drawSteps(); }
  });
  $('#main').addEventListener('change', e => { if (e.target.dataset.f === 'issuedBy') { o.issuedBy = e.target.value; markDirty(); } });
  $('#quickValid').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; o.validUntil = plusDays(Number(b.dataset.d)); const i = $('[data-f="validUntil"]'); i.value = o.validUntil; i.classList.remove('filled'); void i.offsetWidth; i.classList.add('filled'); markDirty(); };
  $('#resetTerms').onclick = async () => { if (!(await confirmBox('Obnovit podmínky?', 'Text podmínek se nahradí výchozím textem z Nastavení.', { ok: 'Obnovit' }))) return; o.terms = st.terms; $('[data-f="terms"]').value = o.terms; markDirty(); };
  const cmText = $('#cmText');
  cmText.addEventListener('input', () => { cmText.style.height = 'auto'; cmText.style.height = Math.min(160, cmText.scrollHeight + 2) + 'px'; });

  // --- ukládání (automaticky) ---
  function setSave(text, cls = '') { const el = $('#saveState'); if (el) { el.textContent = text; el.className = 'save ' + cls; } }
  function markDirty() { E.dirty = true; setSave('Neuloženo', 'dirty'); clearTimeout(E.timer); E.timer = setTimeout(save, 1000); }
  async function save() {
    clearTimeout(E.timer);
    if (E.saving) await E.saving;
    if (!E.dirty) return;
    E.dirty = false; setSave('Ukládám…', 'busy');
    E.saving = (async () => {
      const t = Calc.totals(o, step);
      const row = {
        customer: o.customer, recipient: o.recipient, items: o.items, note: o.note, terms: o.terms, shoptet_order: o.shoptetOrder,
        date: o.date || null, valid_until: o.validUntil || null, issued_by: o.issuedBy, net: t.net, total: t.total,
      };
      try {
        const r = check(await sb.from('offers').update(row).eq('id', o.id).eq('version', o.version).select('version,updated_at,last_edit_by').maybeSingle());
        if (!r) {
          const cur = check(await sb.from('offers').select('last_edit_by').eq('id', o.id).single());
          const err = new Error(`Nabídku mezitím upravil(a) ${userName(cur.last_edit_by) || 'někdo jiný'}.`); err.conflict = true; throw err;
        }
        o.version = r.version;
        setSave('Uloženo');
      } catch (err) {
        E.dirty = !err.conflict;
        setSave(err.conflict ? 'Konflikt' : 'Chyba ukládání', 'err');
        if (err.conflict) {
          if (await confirmBox('Nabídku upravil někdo jiný', err.message + ' Načíst aktuální verzi? Tvoje poslední změny se zahodí.', { ok: 'Načíst aktuální' })) { leaveGuard = null; cleanup(); renderEditor(o.id); }
        } else { toast('Neuloženo: ' + err.message, true); E.timer = setTimeout(save, 5000); }
      }
    })();
    await E.saving; E.saving = null;
  }
  leaveGuard = async () => { await save(); cleanup(); };
  const onBefore = e => { if (E.dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', onBefore);
  const ks = e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
  document.addEventListener('keydown', ks);
  function cleanup() { removeEventListener('beforeunload', onBefore); document.removeEventListener('keydown', ks); removeEventListener('scroll', onScroll); bar.remove(); }

  // --- PDF ---
  const issuer = () => S.users.find(u => u.id === o.issuedBy);
  const busy = (b, on, html) => { b.disabled = on; if (on) { b.dataset.html = b.innerHTML; b.innerHTML = `<span class="spin"></span> ${html}`; } else b.innerHTML = b.dataset.html; };
  $('#pdfView', bar).onclick = async e => {
    const b = e.currentTarget; const w = window.open('', '_blank');
    busy(b, true, '');
    try { await save(); await offerPdf(o, st, issuer(), 'open', w); }
    catch (err) { if (w) w.close(); toast('PDF: ' + err.message, true); }
    busy(b, false);
  };
  $('#pdfDl', bar).onclick = async e => {
    const b = e.currentTarget;
    if (!o.items.length && !(await confirmBox('Nabídka nemá položky', 'Opravdu stáhnout PDF bez položek?', { ok: 'Stáhnout' }))) return;
    busy(b, true, 'Generuji…');
    try {
      await save(); await offerPdf(o, st, issuer(), 'download');
      if (o.status === 'draft') toast('PDF staženo. Až ho pošleš zákazníkovi, označ nabídku jako odeslanou.', { action: { label: 'Odeslána', fn: () => $('#statusPick [data-s="sent"]')?.click() } });
    } catch (err) { toast('PDF: ' + err.message, true); }
    busy(b, false);
  };

  // --- stav ---
  $('#statusPick').onclick = async e => {
    const b = e.target.closest('button[data-s]'); if (!b || b.dataset.s === o.status) return;
    await save();
    try {
      const r = await changeStatus(o, b.dataset.s);
      if (!r) return;
      Object.assign(o, { status: r.status, version: r.version, shoptetOrder: r.shoptetOrder });
      $$('#statusPick button').forEach(x => x.classList.toggle('on', x.dataset.s === o.status));
      $('#stBadge').innerHTML = stat(o.status);
      $('#shoptetBox').hidden = o.status !== 'confirmed';
      $('[data-f="shoptetOrder"]').value = o.shoptetOrder || '';
      history = check(await sb.from('offer_history').select('*').eq('offer_id', o.id).order('at'));
      drawHistory();
      toast('Stav: ' + STATUSES[o.status]);
    } catch (err) { toast(err.message, true); }
  };
  $('#copyShoptet').onclick = async () => {
    const txt = o.items.filter(i => i.code).map(i => `${i.code}\t${numStr(i.qty)}\t${i.name}${i.variant ? ', ' + i.variant : ''}`).join('\n');
    if (!txt) return toast('V nabídce nejsou položky s kódem', true);
    try { await navigator.clipboard.writeText(txt); toast('Zkopírováno: kód, množství, název'); }
    catch { modal({ title: 'Zkopíruj položky', body: `<textarea rows="8" readonly>${esc(txt)}</textarea>` }); }
  };

  // --- komentáře ---
  function drawComments() {
    $('#comments').innerHTML = comments.length ? comments.map(cm => `<div class="cm ${cm.author === S.me.id ? 'mine' : ''}">
      <span class="av" title="${esc(userName(cm.author))}">${initials(cm.author)}</span>
      <div class="bub"><div class="h"><b>${esc(userName(cm.author))}</b><span title="${esc(czDateTime(cm.created_at))}">${ago(cm.created_at)}</span>
      ${cm.author === S.me.id || S.me.role === 'admin' ? `<button class="x" data-cid="${cm.id}" title="Smazat">✕</button>` : ''}</div>
      <p>${esc(cm.text)}</p></div></div>`).join('') : '<div class="muted small">Zatím žádné komentáře. Sem si pište poznámky k jednání se zákazníkem — v PDF se neobjeví.</div>';
  }
  async function sendComment() {
    const text = cmText.value.trim(); if (!text) return;
    const b = $('#cmSend'); b.disabled = true;
    try {
      const cm = check(await sb.from('offer_comments').insert({ offer_id: o.id, author: S.me.id, text }).select().single());
      comments.push(cm); cmText.value = ''; cmText.style.height = ''; drawComments();
    } catch (err) { toast(err.message, true); }
    b.disabled = false;
  }
  $('#cmSend').onclick = sendComment;
  cmText.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendComment(); };
  $('#comments').onclick = async e => {
    const b = e.target.closest('[data-cid]'); if (!b) return;
    if (!(await confirmBox('Smazat komentář?', 'Komentář se nevratně odstraní.', { ok: 'Smazat', danger: true }))) return;
    try { check(await sb.from('offer_comments').delete().eq('id', b.dataset.cid)); comments = comments.filter(x => x.id !== b.dataset.cid); drawComments(); }
    catch (err) { toast(err.message, true); }
  };

  function drawHistory() {
    $('#hist').innerHTML = [...history].reverse().map(h => {
      const what = h.action === 'created' ? 'vytvořil(a) nabídku' + (h.note ? ` (${esc(h.note)})` : '') : `→ <b>${esc(STATUSES[h.to_status] || h.to_status)}</b>`;
      return `<div><b>${esc(userName(h.author))}</b> ${what}<br>${czDateTime(h.at)}</div>`;
    }).join('');
  }

  $('#dup').onclick = async e => {
    const b = e.currentTarget; busy(b, true, 'Kopíruji…');
    await save();
    try { const n = await newOffer(o.id); toast('Vytvořena kopie ' + n.number); } catch (err) { toast(err.message, true); busy(b, false); }
  };
  $('#del').onclick = async () => {
    if (!(await confirmBox(`Smazat nabídku ${o.number}?`, 'Nabídka zmizí z přehledu. Obnovit ji může jen správce.', { ok: 'Smazat', danger: true }))) return;
    try {
      E.dirty = false; clearTimeout(E.timer);
      check(await sb.from('offers').update({ deleted: true }).eq('id', o.id));
      leaveGuard = null; cleanup(); toast('Nabídka smazána'); location.hash = '#/';
    } catch (err) { toast(err.message, true); }
  };

  drawItems(); drawComments(); drawHistory();
  if (!o.items.length && !c.name && !c.company) $('#cq').focus();
}

// ---------- nastavení ----------
async function renderSettings() {
  shell('settings', `<div class="topbar"><h1>Nastavení</h1></div><div class="stack">${'<div class="panel panel-b"><div class="sk" style="height:120px"></div></div>'.repeat(3)}</div>`);
  const row = await loadSettings();
  const s = row.data, sup = s.supplier || {};
  const inp = (k, label, v, cls = '', type = 'text', extra = '') => `<div class="${cls}"><label>${label}</label><input name="${k}" type="${type}" value="${esc(v)}" ${extra}></div>`;
  $('#main').innerHTML = `
  <div class="topbar"><h1>Nastavení</h1></div>
  <form class="stack" id="sf">
    <section class="panel"><div class="panel-h">🛒 Produkty ze Shoptetu</div><div class="panel-b">
      <div class="form">
        ${inp('csvUrl', 'Odkaz na CSV export produktů', s.csvUrl, 'full')}
        <div class="full"><label>Stav</label><div id="pst" class="small"></div><div class="hint">Produkty se načítají automaticky každou hodinu.</div></div>
      </div>
      <button type="button" class="btn sm" id="refresh" style="margin-top:10px">↻ Načíst produkty teď</button>
    </div></section>

    <section class="panel"><div class="panel-h">📄 Nabídky</div><div class="panel-b form">
      ${inp('numberPrefix', 'Předpona čísla — jen číslice, {RR} = rok (26)', s.numberPrefix, '', 'text', 'pattern="(\\{RR\\}|\\{RRRR\\}|[0-9])*" title="Jen číslice a {RR} — číslo nabídky slouží jako variabilní symbol"')}
      ${inp('numberDigits', 'Počet číslic', s.numberDigits, '', 'number', 'min="1" max="10"')}
      ${inp('nextNumber', 'Další pořadové číslo', s.nextNumber, '', 'number', 'min="1"')}
      ${inp('validDays', 'Platnost nabídky (dní)', s.validDays, '', 'number', 'min="1"')}
      ${inp('defaultDiscount', 'Výchozí sleva na položky (%)', s.defaultDiscount, '', 'number', 'step="0.5"')}
      ${inp('defaultVat', 'Výchozí sazba DPH (%)', s.defaultVat, '', 'number')}
      <div><label>Zaokrouhlení jedn. ceny bez DPH</label><select name="priceStep">
        <option value="0.1" ${s.priceStep == 0.1 ? 'selected' : ''}>na 0,10 Kč (jako Pohoda — 429 → 354,60)</option>
        <option value="0.01" ${s.priceStep == 0.01 ? 'selected' : ''}>na haléře (429 → 354,55)</option>
      </select></div>
      <div class="full hint" id="numPreview"></div>
      ${inp('agreeLine', 'Úvodní věta podmínek', s.agreeLine, 'full')}
      <div class="full"><label>Výchozí podmínky ({platnost} = datum platnosti)</label><textarea name="terms" rows="8">${esc(s.terms)}</textarea></div>
    </div></section>

    <section class="panel"><div class="panel-h">📦 Naskladnění</div><div class="panel-b form">
      ${inp('stockRate', 'Výchozí kurz EUR/CZK (když se nepodaří načíst ČNB)', s.stockRate ?? 24.2055, '', 'number', 'step="0.0001"')}
      ${inp('stockTransportPct', 'Doprava k nákupní ceně (%)', s.stockTransportPct ?? 10, '', 'number', 'step="0.5"')}
      ${inp('marginWarn', 'Upozornit na marži pod (%) — oranžově', s.marginWarn ?? 25, '', 'number')}
      ${inp('marginBad', 'Varovat při marži pod (%) — červeně', s.marginBad ?? 15, '', 'number')}
    </div></section>

    <section class="panel"><div class="panel-h">🏢 Dodavatel (hlavička PDF)</div><div class="panel-b form">
      ${inp('s.company', 'Firma', sup.company)}
      ${inp('s.street', 'Ulice', sup.street)}
      ${inp('s.city', 'PSČ a město', sup.city)}
      ${inp('s.country', 'Země', sup.country)}
      ${inp('s.ico', 'IČ', sup.ico)}
      ${inp('s.dic', 'DIČ', sup.dic)}
      ${inp('s.phone', 'Telefon', sup.phone)}
      ${inp('s.mobile', 'Mobil', sup.mobile)}
      ${inp('s.email', 'E-mail', sup.email)}
      ${inp('s.web', 'Web', sup.web)}
      ${inp('s.bank', 'Bankovní účet (nepovinné)', sup.bank, 'full')}
    </div></section>
    <div><button class="btn primary lg">Uložit nastavení</button></div>
  </form>`;
  const drawPst = r => {
    $('#pst').innerHTML = (r.products_error ? `<div class="err">Chyba: ${esc(r.products_error)} (${czDateTime(r.products_error_at)})</div>` : '') +
      `<b>${r.products_count}</b> produktů · naposledy načteno ${r.products_synced_at ? ago(r.products_synced_at) : '—'}`;
  };
  drawPst(row);
  const preview = () => {
    const f = new FormData($('#sf'));
    const pre = String(f.get('numberPrefix')).replace('{RRRR}', String(new Date().getFullYear())).replace('{RR}', String(new Date().getFullYear()).slice(2));
    const num = pre + String(f.get('nextNumber')).padStart(Number(f.get('numberDigits')) || 5, '0');
    const ok = /^\d+$/.test(num) && num.length <= 10;
    $('#numPreview').innerHTML = `Další nabídka dostane číslo <b class="num-t" style="color:${ok ? 'var(--brand)' : 'var(--danger)'}">${esc(num)}</b>${ok ? ' — vhodné jako variabilní symbol ✓' : ' — nehodí se jako variabilní symbol (jen číslice, max. 10)'}`;
  };
  $('#sf').addEventListener('input', preview); preview();
  $('#refresh').onclick = async e => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> Načítám…';
    try {
      const { data, error } = await sb.functions.invoke('hub-products-sync', { body: {} });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error);
      drawPst(await loadSettings()); await loadProducts(true);
      toast('Produkty aktualizovány');
    } catch (err) { toast(err.message, true); }
    b.disabled = false; b.textContent = '↻ Načíst produkty teď';
  };
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const fresh = (await loadSettings()).data; // ať nepřepíšeme číslo řady, které mezitím někdo použil
    const data = { ...fresh, supplier: { ...(fresh.supplier || {}) } };
    const nums = ['numberDigits', 'nextNumber', 'validDays', 'defaultDiscount', 'defaultVat', 'priceStep', 'stockRate', 'stockTransportPct', 'marginWarn', 'marginBad'];
    for (const [k, v] of f) {
      if (k.startsWith('s.')) data.supplier[k.slice(2)] = v;
      else data[k] = nums.includes(k) ? Number(v) : v;
    }
    if (Number(f.get('nextNumber')) === Number(s.nextNumber)) data.nextNumber = fresh.nextNumber;
    const pre = String(data.numberPrefix).replace('{RRRR}', '2026').replace('{RR}', '26');
    if (!/^\d*$/.test(pre)) return toast('Předpona smí obsahovat jen číslice a {RR} — číslo nabídky je variabilní symbol.', true);
    if (pre.length + Number(data.numberDigits) > 10) return toast('Číslo nabídky by mělo víc než 10 číslic (limit variabilního symbolu).', true);
    try { check(await sb.from('hub_settings').update({ data }).eq('id', 1)); await loadSettings(); toast('Nastavení uloženo ✓'); }
    catch (err) { toast(err.message, true); }
  };
}

// ---------- účet ----------
async function adminCall(body) {
  const { data, error } = await sb.functions.invoke('hub-admin', { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
// pravidla hesla: aspoň 12 znaků, písmena i číslice, ne jméno/e-mail, ne běžná slova
const WEAK = ['heslo', 'password', 'vinylor', 'qwerty', '123456', 'gaviko', 'shoptet', 'dobris', 'terasa'];
function passwordProblems(pw, me) {
  const p = [];
  if (pw.length < 12) p.push('aspoň 12 znaků');
  if (!/[a-zá-ž]/i.test(pw) || !/\d/.test(pw)) p.push('písmena i číslice');
  const low = fold(pw);
  const parts = [...fold(me.name).split(/\s+/), fold(me.email.split('@')[0])].filter(x => x.length >= 3);
  if (parts.some(x => low.includes(x))) p.push('bez jména a e-mailu');
  if (WEAK.some(w => low.includes(w))) p.push('bez běžných slov (heslo, vinylor…)');
  if (/(.)\1{3,}/.test(pw)) p.push('bez opakování znaků');
  return p;
}
async function verifyCurrentPassword(email, password) {
  // ověření starého hesla v odděleném klientovi — hlavní přihlášení (s 2FA) zůstane beze změny
  const tmp = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'vh-verify-' + Date.now() } });
  const { error } = await tmp.auth.signInWithPassword({ email, password });
  if (!error) { try { await tmp.auth.signOut({ scope: 'local' }); } catch {} }
  return !error;
}
async function renderAccount() {
  const me = S.me;
  let factors = [];
  try { const { data } = await sb.auth.mfa.listFactors(); factors = (data?.totp || []).filter(f => f.status === 'verified'); } catch {}
  shell('account', `
  <div class="topbar"><h1>Můj účet</h1></div>
  <div class="stack" style="max-width:760px">
    ${me.must_change ? '<div class="panel panel-b" style="border-color:#f1c27d;background:#fff8ec">👋 Vítej! Nejdřív si prosím nastav vlastní heslo — dočasné heslo od správce už dál nepoužívej.</div>' : ''}
    <form class="panel" id="pw" autocomplete="on"><div class="panel-h">🔑 Změna hesla</div><div class="panel-b form">
      <input type="email" name="username" value="${esc(me.email)}" autocomplete="username" hidden>
      <div class="full"><label for="pw-old">Současné heslo</label><input id="pw-old" name="old" type="password" autocomplete="current-password" required></div>
      <div><label for="pw-new">Nové heslo</label><input id="pw-new" name="new" type="password" autocomplete="new-password" minlength="12" required></div>
      <div><label for="pw-new2">Nové heslo znovu</label><input id="pw-new2" name="new2" type="password" autocomplete="new-password" minlength="12" required></div>
      <div class="full"><div class="pw-meter"><i id="pwBar"></i></div><div class="hint" id="pwHint">Aspoň 12 znaků, písmena i číslice. Nejlepší je věta ze 3–4 slov, třeba „Terasa-pod-hruskou-2026“.</div></div>
      <div><button class="btn primary">Změnit heslo</button></div>
    </div></form>
    <section class="panel"><div class="panel-h">🔐 Dvoufázové ověření</div><div class="panel-b">
      ${factors.length ? `<div class="row"><span class="mg ok">Zapnuto</span><span class="grow">Při přihlášení se vyžaduje kód z aplikace v telefonu${factors[0].created_at ? ` · nastaveno ${czDate(factors[0].created_at)}` : ''}.</span></div>
        <div class="hint">Nový telefon nebo ztráta telefonu? Požádej správce o reset 2FA — při dalším přihlášení si ho nastavíš znovu.</div>`
      : '<div class="row"><span class="mg bad">Vypnuto</span><span class="grow">Odhlas se a znovu přihlas — aplikace tě provede nastavením.</span></div>'}
      <div class="row" style="margin-top:14px">
        <button class="btn" id="outAll" title="Odhlásí tě z počítače, telefonu i všech dalších zařízení">🚪 Odhlásit ze všech zařízení</button>
        <span class="small muted">Toto zařízení: ${trustedDevice() ? 'důvěryhodné (zůstává přihlášené)' : 'běžné (odhlásí se po zavření prohlížeče)'}</span>
      </div>
    </div></section>
    <form class="panel" id="pf"><div class="panel-h">📇 Kontakt do nabídek</div><div class="panel-b form">
      <div class="full muted small">Zobrazí se v PDF u „Vystavil“, když nabídku vystavíš ty. Přihlašovací e-mail: ${esc(me.email)}</div>
      <div><label for="pf-phone">Telefon</label><input id="pf-phone" name="phone" value="${esc(me.phone)}"></div>
      <div><label for="pf-email">E-mail</label><input id="pf-email" name="email" type="email" value="${esc(me.contact_email)}"></div>
      <div><button class="btn primary">Uložit</button></div>
    </div></form>
    ${me.role === 'admin' ? `<section class="panel"><div class="panel-h">👥 Uživatelé a zabezpečení <span class="sub">správa týmu</span></div><div class="panel-b" id="usersBox"><div class="sk" style="height:120px"></div></div></section>
    <section class="panel"><div class="panel-h">🛡️ Bezpečnostní deník <span class="sub">posledních 60 událostí</span></div><div class="panel-b" id="auditBox"><div class="sk" style="height:120px"></div></div></section>` : ''}
  </div>`);
  $('#pf').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    try { check(await sb.rpc('hub_update_my_contact', { p_phone: f.get('phone'), p_contact_email: f.get('email') })); await loadUsers(); toast('Uloženo ✓'); }
    catch (err) { toast(err.message, true); }
  };
  const pwNew = $('#pw-new');
  pwNew.oninput = () => {
    const probs = passwordProblems(pwNew.value, me);
    const score = Math.max(0, Math.min(4, Math.floor(pwNew.value.length / 4) - probs.length));
    $('#pwBar').style.width = (pwNew.value ? 20 + score * 20 : 0) + '%';
    $('#pwBar').dataset.s = probs.length ? 'bad' : score >= 4 ? 'ok' : 'warn';
    $('#pwHint').textContent = pwNew.value ? (probs.length ? 'Ještě: ' + probs.join(', ') + '.' : 'Silné heslo ✓') : $('#pwHint').textContent;
  };
  $('#pw').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    const oldPw = String(f.get('old')), newPw = String(f.get('new'));
    if (newPw !== f.get('new2')) return toast('Nová hesla se neshodují', true);
    if (newPw === oldPw) return toast('Nové heslo musí být jiné než současné', true);
    const probs = passwordProblems(newPw, me);
    if (probs.length) return toast('Heslo je slabé: ' + probs.join(', '), true);
    const btn = $('#pw .btn.primary'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Měním…';
    try {
      if (!(await verifyCurrentPassword(me.email, oldPw))) throw new Error('Současné heslo nesedí');
      const { error } = await sb.auth.updateUser({ password: newPw });
      if (error) throw new Error(/should be different/i.test(error.message) ? 'Nové heslo musí být jiné' : /weak|pwned|leaked/i.test(error.message) ? 'Toto heslo se objevilo v únicích dat, zvol jiné' : error.message);
      try { check(await sb.rpc('hub_password_changed')); } catch {}
      try { await sb.rpc('hub_log', { p_action: 'password_changed', p_detail: {} }); } catch {}
      await loadUsers();
      toast('Heslo změněno ✓'); e.target.reset();
      location.hash = '#/';
    } catch (err) { toast(err.message, true); }
    btn.disabled = false; btn.textContent = 'Změnit heslo';
  };
  $('#outAll').onclick = async () => {
    if (!(await confirmBox('Odhlásit ze všech zařízení?', 'Odhlásíš se všude, i tady. Pak se přihlásíš znovu heslem a kódem.', { ok: 'Odhlásit všude', danger: true }))) return;
    logout('Byl(a) jsi odhlášen(a) ze všech zařízení.', 'global');
  };
  if (me.role === 'admin') drawAdmin();
}
async function drawAdmin() {
  const me = S.me;
  let sec = [];
  try { sec = (await adminCall({ action: 'list' })).users || []; } catch (err) { $('#usersBox').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  const info = id => sec.find(x => x.id === id) || {};
  $('#usersBox').innerHTML = `<div class="ulist">${S.users.map(u => { const s = info(u.id); return `<div class="urow">
      <span class="av lg">${initials(u.id)}</span>
      <div class="grow" style="min-width:0"><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="tag blue">správce</span>' : ''}${u.active ? '' : ' <span class="tag grey">zablokovaný</span>'}
        <div class="muted small">${esc(u.email)} · ${s.last_sign_in_at ? 'naposledy ' + ago(s.last_sign_in_at) : 'zatím se nepřihlásil(a)'}</div>
        <div class="small" style="margin-top:3px">${s.mfa ? '<span class="mg ok">2FA zapnuto</span>' : '<span class="mg warn">2FA zatím nenastaveno</span>'}${u.must_change ? ' <span class="mg warn">čeká na změnu hesla</span>' : ''}</div></div>
      ${u.id !== me.id ? `<div class="uacts"><button class="btn sm" data-a="reset" data-id="${u.id}">Nové heslo</button><button class="btn sm" data-a="reset_mfa" data-id="${u.id}" ${s.mfa ? '' : 'disabled'}>Reset 2FA</button><button class="btn sm" data-a="signout" data-id="${u.id}">Odhlásit všude</button><button class="btn sm ${u.active ? 'danger' : ''}" data-a="active" data-v="${u.active ? '0' : '1'}" data-id="${u.id}">${u.active ? 'Zablokovat' : 'Povolit'}</button></div>` : '<span class="muted small">to jsi ty</span>'}
    </div>`; }).join('')}</div>
    <form id="addUser" class="form" style="margin-top:16px">
      <div><label for="au-name">Jméno a příjmení</label><input id="au-name" name="name" required placeholder="Pavel Hadraba"></div>
      <div><label for="au-email">Přihlašovací e-mail</label><input id="au-email" name="email" type="email" required placeholder="hadraba.p@vinylor.cz"></div>
      <div><button class="btn primary">＋ Přidat uživatele</button></div>
    </form>
    <div class="hint">Nový uživatel dostane dočasné heslo (ukáže se jen jednou). Při prvním přihlášení si nastaví vlastní heslo a 2FA.</div>`;
  $$('#usersBox [data-a]').forEach(b => b.onclick = async () => {
    const id = b.dataset.id, who = userName(id), a = b.dataset.a;
    const texts = {
      reset: ['Nové heslo', `Vygenerovat nové dočasné heslo pro ${who}? Staré přestane platit a ${who} se odhlásí ze všech zařízení.`, 'Vygenerovat', false],
      reset_mfa: ['Reset dvoufázového ověření', `${who} si při dalším přihlášení nastaví 2FA znovu (např. na novém telefonu). Odhlásí se ze všech zařízení.`, 'Resetovat 2FA', true],
      signout: ['Odhlásit ze všech zařízení', `${who} se odhlásí na všech zařízeních.`, 'Odhlásit', false],
      active: b.dataset.v === '1' ? ['Povolit přístup', `Povolit přístup pro ${who}?`, 'Povolit', false] : ['Zablokovat přístup', `${who} se už nepřihlásí a hned se odhlásí. Data zůstanou zachovaná.`, 'Zablokovat', true],
    }[a];
    if (!(await confirmBox(texts[0], texts[1], { ok: texts[2], danger: texts[3] }))) return;
    try {
      const r = await adminCall({ action: a, id, active: b.dataset.v === '1' });
      if (r.password) await passwordBox(who, r.password); else toast('Hotovo ✓');
      await loadUsers(); drawAdmin();
    } catch (err) { toast(err.message, true); }
  });
  $('#addUser').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    try {
      const r = await adminCall({ action: 'create', name: f.get('name'), email: f.get('email') });
      await passwordBox(f.get('name'), r.password); await loadUsers(); drawAdmin();
    } catch (err) { toast(err.message, true); }
  };
  // bezpečnostní deník
  const LOG = { login: 'přihlášení heslem', mfa_verified: 'ověřeno kódem 2FA', mfa_enrolled: 'nastavil(a) 2FA', logout: 'odhlášení', password_changed: 'změnil(a) heslo',
    user_created: 'založil(a) účet', password_reset: 'vygeneroval(a) nové heslo', mfa_reset: 'resetoval(a) 2FA', signed_out_everywhere: 'odhlásil(a) ze všech zařízení', user_blocked: 'zablokoval(a)', user_unblocked: 'povolil(a)' };
  try {
    const rows = check(await sb.from('hub_audit').select('*').order('at', { ascending: false }).limit(60));
    $('#auditBox').innerHTML = rows.length ? `<div class="timeline audit">${rows.map(r => `<div><b>${esc(userName(r.actor) || '—')}</b> ${esc(LOG[r.action] || r.action)}${r.target ? ` → <b>${esc(userName(r.target) || 'účet')}</b>` : ''}${r.detail?.scope === 'global' ? ' (všude)' : ''}<br>${czDateTime(r.at)}${r.detail?.ua ? ` · <span title="${esc(r.detail.ua)}">${esc(/iPhone|Android/i.test(r.detail.ua) ? 'telefon' : 'počítač')}</span>` : ''}</div>`).join('')}</div>` : '<div class="muted small">Zatím žádné události.</div>';
  } catch (err) { $('#auditBox').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// =====================================================================
// NASKLADNĚNÍ — příjemky od dodavatelů → naskladnění do Shoptetu
// =====================================================================
const STOCK_COLS = 'id,doc_no,supplier,date,currency,rate,transport_pct,items,note,total_czk,item_count,stocked_count,imported,created_by,last_edit_by,version,created_at,updated_at';
const SK = { receipts: [], q: '', filter: ls.get('vh_sk_filter') || '' };
const rcFromRow = r => ({
  id: r.id, docNo: r.doc_no || '', supplier: r.supplier || '', date: r.date, currency: r.currency, rate: Number(r.rate), transportPct: Number(r.transport_pct),
  items: r.items || [], note: r.note || '', imported: r.imported, createdBy: r.created_by, lastEditBy: r.last_edit_by, version: r.version,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
// cenu jde psát i jako výpočet: „5,8*4,2“, „12,46 + 1,2“
function evalPrice(v) {
  const t = String(v ?? '').replace(/\s/g, '').replace(/,/g, '.');
  if (!t || !/^[\d.+\-*/()]+$/.test(t)) return null;
  // jednoduchý výpočet + − × ÷ a závorky (bez eval)
  let i = 0;
  const num = () => { const m = t.slice(i).match(/^\d+(\.\d+)?|^\.\d+/); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); };
  const atom = () => { if (t[i] === '-') { i++; return -atom(); } if (t[i] === '(') { i++; const x = expr(); if (t[i++] !== ')') throw 0; return x; } return num(); };
  const term = () => { let x = atom(); while (t[i] === '*' || t[i] === '/') { const o = t[i++]; const y = atom(); x = o === '*' ? x * y : x / y; } return x; };
  const expr = () => { let x = term(); while (t[i] === '+' || t[i] === '-') { const o = t[i++]; const y = term(); x = o === '+' ? x + y : x - y; } return x; };
  try { const n = expr(); return i === t.length && Number.isFinite(n) ? Calc.r2(n * 10000) / 10000 : null; } catch { return null; }
}
const curSign = c => (c === 'CZK' ? 'Kč' : '€');
function stockLine(it, rc) {
  const vat = 21;
  const price = evalPrice(it.priceInput);
  const qty = toNum(it.qty);
  const rate = rc.currency === 'CZK' ? 1 : Number(rc.rate) || 0;
  const unitCost = price == null ? null : price * (1 + (Number(rc.transportPct) || 0) / 100) * rate; // Kč bez DPH
  const sellVat = it.sellPriceVat == null || it.sellPriceVat === '' ? null : toNum(it.sellPriceVat);
  const sellNet = sellVat == null ? null : sellVat / (1 + vat / 100);
  const margin = unitCost != null && sellNet ? sellNet - unitCost : null;
  const marginPct = margin != null && sellNet ? (margin / sellNet) * 100 : null;
  return { price, qty, unitCost, sellNet, margin, marginPct, totalCost: unitCost == null ? 0 : unitCost * qty, totalCur: price == null ? 0 : price * qty, totalSellNet: sellNet == null ? 0 : sellNet * qty };
}
function stockTotals(rc) {
  let cost = 0, cur = 0, sell = 0, stocked = 0, costForMargin = 0;
  const lines = rc.items.map(it => {
    const l = stockLine(it, rc);
    cost += l.totalCost; cur += l.totalCur;
    if (l.sellNet != null && l.unitCost != null) { sell += l.totalSellNet; costForMargin += l.totalCost; }
    if (it.stocked) stocked++;
    return l;
  });
  const margin = sell - costForMargin;
  return { lines, cost: Calc.r2(cost), cur: Calc.r2(cur), sell: Calc.r2(sell), margin: Calc.r2(margin), marginPct: sell ? (margin / sell) * 100 : null, stocked, count: rc.items.length };
}
const marginCls = p => { const st = S.settings?.data || {}; if (p == null) return 'na'; if (p < (Number(st.marginBad) || 15)) return 'bad'; if (p < (Number(st.marginWarn) || 25)) return 'warn'; return 'ok'; };
const pct = p => (p == null ? '—' : `${numStr(Math.round(p * 10) / 10)} %`);
const rcStatus = rc => { const n = rc.item_count ?? rc.items.length, d = rc.stocked_count ?? rc.items.filter(i => i.stocked).length; return !n ? 'empty' : d >= n ? 'done' : d ? 'part' : 'open'; };
const RC_STATUS = { empty: 'Prázdná', open: 'K naskladnění', part: 'Částečně', done: 'Naskladněno' };

// paměť nákupních cen z dřívějších příjemek
function lengthOf(s) { const m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*m\b(?!m)/i); return m ? toNum(m[1]) : null; }
const familyKey = (name, supplier) => fold(String(name || '').replace(/\(?\d+(?:[.,]\d+)?\s*m\)?(?!m)/gi, '').replace(/\s+/g, ' ').trim()) + '|' + fold(supplier);
function priceMemory(excludeId) {
  const byCode = new Map(), byFamily = new Map();
  const list = [...SK.receipts].filter(r => r.id !== excludeId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const rc of list) for (const it of rc.items) {
    if (!it.priceInput || evalPrice(it.priceInput) == null) continue;
    const rec = { priceInput: it.priceInput, price: evalPrice(it.priceInput), supplier: rc.supplier, currency: rc.currency, date: rc.date, doc: rc.docNo };
    if (it.code) byCode.set(it.code, rec);
    const f = String(it.priceInput).replace(/\s/g, '').match(/^(\d+(?:[.,]\d+)?)\*(\d+(?:[.,]\d+)?)$/);
    if (f) byFamily.set(familyKey(it.name, rc.supplier), { base: f[1], supplier: rc.supplier, currency: rc.currency });
  }
  return { byCode, byFamily };
}
function predictPrice(p, supplier, mem) {
  const c = mem.byCode.get(p.code);
  if (c) return { priceInput: c.priceInput, src: `naposledy ${czDate(c.date)}${c.doc ? ' · ' + c.doc : ''}` };
  const len = lengthOf(p.variant) || lengthOf(p.name);
  const fam = len && mem.byFamily.get(familyKey(p.name, supplier || p.supplier));
  if (fam) return { priceInput: `${fam.base}*${numStr(len)}`, src: `odhad: ${fam.base} €/m × ${numStr(len)} m` };
  return null;
}

// ---------- seznam příjemek ----------
async function loadReceipts() {
  const rows = await fetchAll(() => sb.from('stock_receipts').select(STOCK_COLS).eq('deleted', false).order('created_at', { ascending: false }));
  SK.receipts = rows.map(r => ({ ...rcFromRow(r), item_count: r.item_count, stocked_count: r.stocked_count, total_czk: Number(r.total_czk) }));
}
async function newReceipt(prefill = {}) {
  const st = cfg();
  const row = check(await sb.from('stock_receipts').insert({
    created_by: S.me.id, last_edit_by: S.me.id, currency: 'EUR', rate: Number(st.stockRate) || 24.2, transport_pct: Number(st.stockTransportPct) ?? 10,
    date: ymd(new Date()), ...prefill,
  }).select('id').single());
  location.hash = '#/s/' + row.id;
}
async function renderStock() {
  shell('stock', `<div class="topbar"><h1>Naskladnění</h1></div><div class="panel panel-b"><div class="sk" style="height:220px"></div></div>`);
  try { await Promise.all([loadReceipts(), loadSettings()]); } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const main = $('#main');
  main.innerHTML = `
  <div class="topbar">
    <h1>Naskladnění</h1>
    <button class="btn primary" id="newRc">＋ Nová příjemka</button>
    <div class="search grow" style="max-width:380px"><span class="ic">⌕</span><input id="rq" placeholder="Hledat doklad, dodavatele, kód produktu…" value="${esc(SK.q)}"></div>
  </div>
  <div id="skStats"></div>
  <div class="chips" style="margin-bottom:12px" id="rcf">
    ${[['', 'Vše'], ['todo', 'K naskladnění'], ['done', 'Naskladněno']].map(([k, l]) => `<button class="chip ${SK.filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}
  </div>
  <div id="rcList"></div>`;
  main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
  $('#newRc').onclick = async e => { const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spin"></span> Zakládám…'; try { await newReceipt(); } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = '＋ Nová příjemka'; } };
  $('#rq').oninput = e => { SK.q = e.target.value; drawReceipts(); };
  $$('#rcf .chip').forEach(c => c.onclick = () => { SK.filter = c.dataset.f; ls.set('vh_sk_filter', SK.filter); $$('#rcf .chip').forEach(x => x.classList.toggle('on', x === c)); drawReceipts(); });
  drawStockStats(); drawReceipts();
}
function drawStockStats() {
  const month = ymd(new Date()).slice(0, 7);
  const thisMonth = SK.receipts.filter(r => String(r.date).slice(0, 7) === month);
  const todo = SK.receipts.filter(r => ['open', 'part'].includes(rcStatus(r)));
  const todoItems = todo.reduce((a, r) => a + (r.item_count - r.stocked_count), 0);
  let sell = 0, cost = 0;
  for (const r of SK.receipts) { const t = stockTotals(r); sell += t.sell; cost += t.sell ? t.cost : 0; }
  $('#skStats').innerHTML = `<div class="stats">
    <div class="panel stat" style="--c:var(--s-postponed)"><div class="k">Čeká na naskladnění</div><div class="v">${todoItems}</div><div class="s">${todo.length} příjemek s nenaskladněnými položkami</div></div>
    <div class="panel stat" style="--c:var(--s-sent)"><div class="k">Nakoupeno tento měsíc</div><div class="v" data-n="${thisMonth.reduce((a, r) => a + r.total_czk, 0)}">0 Kč</div><div class="s">${thisMonth.length} příjemek, bez DPH</div></div>
    <div class="panel stat" style="--c:var(--brand)"><div class="k">Průměrná marže</div><div class="v">${pct(sell ? ((sell - cost) / sell) * 100 : null)}</div><div class="s">ze všech příjemek, bez DPH</div></div>
    <div class="panel stat" style="--c:var(--s-confirmed)"><div class="k">Příjemek celkem</div><div class="v">${SK.receipts.length}</div><div class="s">${SK.receipts.reduce((a, r) => a + r.item_count, 0)} položek</div></div>
  </div>`;
  $$('#skStats [data-n]').forEach(v => tween(v, Number(v.dataset.n), n => M(n).replace(/,\d\d$/, '') + ' Kč'));
}
function drawReceipts() {
  const q = fold(SK.q).trim();
  const list = SK.receipts.filter(r => {
    const s = rcStatus(r);
    if (SK.filter === 'todo' && !['open', 'part'].includes(s)) return false;
    if (SK.filter === 'done' && s !== 'done') return false;
    if (!q) return true;
    return fold([r.docNo, r.supplier, r.note, ...r.items.map(i => i.code + ' ' + i.name)].join(' ')).includes(q);
  });
  const el = $('#rcList');
  if (!SK.receipts.length) {
    el.innerHTML = `<div class="panel empty-big"><div class="ill">📦</div><h3>Zatím žádné příjemky</h3><p>Založ první příjemku — produkty se doplní z e-shopu, nákupní ceny z minula.</p><button class="btn primary lg" id="firstRc">＋ Nová příjemka</button></div>`;
    $('#firstRc').onclick = () => $('#newRc').click();
    return;
  }
  el.innerHTML = `<div class="panel" style="overflow-x:auto"><table class="list rc-list">
    <thead><tr><th>Doklad</th><th>Dodavatel</th><th>Datum</th><th>Naskladněno</th><th class="r">Náklad bez DPH</th><th class="r">Marže</th></tr></thead>
    <tbody>${list.map((r, i) => {
      const t = stockTotals(r); const s = rcStatus(r); const p = r.item_count ? Math.round(100 * r.stocked_count / r.item_count) : 0;
      return `<tr class="click" data-id="${r.id}" style="animation-delay:${Math.min(i, 20) * 15}ms">
        <td class="nowrap"><b>${highlight(r.docNo || 'bez čísla', SK.q)}</b>${r.imported ? ' <span class="tag grey" title="Importováno z Excelu">import</span>' : ''}</td>
        <td>${highlight(r.supplier || '—', SK.q)}<div class="muted small">${r.item_count} položek · ${r.currency}</div></td>
        <td class="nowrap">${czDate(r.date)}</td>
        <td class="nowrap"><div class="prog" data-st="${s}"><i style="width:${p}%"></i></div><span class="small muted">${r.stocked_count}/${r.item_count} · ${RC_STATUS[s]}</span></td>
        <td class="r nowrap num-t">${M(t.cost)} Kč</td>
        <td class="r nowrap"><span class="mg ${marginCls(t.marginPct)}">${pct(t.marginPct)}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Nic nenalezeno</td></tr>'}</tbody></table></div>`;
  $$('tr.click', el).forEach(r => r.onclick = () => { location.hash = '#/s/' + r.dataset.id; });
}

// ---------- editor příjemky ----------
async function renderReceipt(id) {
  shell('stock', editorSkeleton());
  let rc;
  try {
    const [row] = await Promise.all([
      sb.from('stock_receipts').select(STOCK_COLS).eq('id', id).eq('deleted', false).single().then(check),
      SK.receipts.length ? null : loadReceipts(),
      loadSettings(),
    ]);
    rc = rcFromRow(row);
  } catch (e) { $('#main').innerHTML = `<div class="panel empty-big"><div class="ill">🔍</div><h3>Příjemku se nepodařilo otevřít</h3><p>${esc(e.message)}</p><a class="btn" href="#/sklad">← Zpět</a></div>`; return; }
  loadProducts().catch(e => toast('Produkty: ' + e.message, true));
  const mem = priceMemory(rc.id);
  const E = { dirty: false, saving: null, timer: null };
  const suppliers = [...new Set([...SK.receipts.map(r => r.supplier), ...(S.products || []).map(p => p.supplier)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));

  $('#main').innerHTML = `
  <div class="ed-top" id="edTop"><div class="topbar">
    <a class="btn ghost" href="#/sklad" title="Zpět na příjemky">←</a>
    <h1>Příjemka <span id="rcTitle">${esc(rc.docNo || 'bez čísla')}</span></h1>
    <span id="rcBadge"></span>
    <span class="save" id="saveState">Uloženo</span>
    <span class="grow"></span>
    <button class="btn" id="pasteRows" title="Vložit řádky zkopírované z Excelu nebo faktury">📋 <span class="hide-xs">Vložit z tabulky</span></button>
    <button class="btn ghost danger" id="rcDel" title="Smazat příjemku">🗑</button>
  </div></div>
  <section class="panel">
    <div class="panel-h"><span class="step" id="rstep1">1</span>Doklad <span class="sub">— od koho a za jakých podmínek</span></div>
    <div class="panel-b rc-head">
      <div><label>Číslo dokladu</label><input data-r="docNo" value="${esc(rc.docNo)}" placeholder="např. AR00546325"></div>
      <div><label>Dodavatel</label><input data-r="supplier" list="supList" value="${esc(rc.supplier)}" placeholder="Gunreben, MEFO…"><datalist id="supList">${suppliers.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div><label>Datum</label><input type="date" data-r="date" value="${esc(rc.date)}"></div>
      <div><label>Měna nákupu</label><div class="seg" id="curSeg" style="width:100%"><button data-c="EUR" style="flex:1">EUR €</button><button data-c="CZK" style="flex:1">CZK Kč</button></div></div>
      <div id="rateBox"><label>Kurz EUR/CZK</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input data-r="rate" inputmode="decimal" value="${esc(numStr(rc.rate))}"><button class="btn sm" id="cnb" title="Načíst kurz ČNB ke dni dokladu">ČNB</button></div></div>
      <div><label>Doprava</label><div class="fld"><input data-r="transportPct" inputmode="decimal" value="${esc(numStr(rc.transportPct))}"><span class="suf">%</span></div></div>
      <div class="full"><label>Poznámka</label><input data-r="note" value="${esc(rc.note)}" placeholder="nepovinné"></div>
    </div>
  </section>

  <section class="panel" style="margin-top:18px">
    <div class="panel-h"><span class="step" id="rstep2">2</span>Položky <span class="sub">— začni psát kód nebo název, zbytek se doplní</span></div>
    <div class="panel-b">
      <div class="row">
        <div class="search big grow"><span class="ic">⌕</span><input id="sq" placeholder="Kód nebo název produktu, např. WPCG-09 nebo „light brown 4,8“" autocomplete="off"><div class="results" id="sr" hidden></div></div>
        <button class="btn" id="addFree" title="Položka, která není v e-shopu">＋ Mimo e-shop</button>
      </div>
      <div class="hint">Nákupní cenu jde napsat i jako výpočet, např. <kbd>5,8*4,2</kbd> (cena za metr × délka). <kbd>Enter</kbd> v počtu kusů = zpět na hledání.</div>
      <div id="rcItems"></div>
    </div>
  </section>`;
  const bar = document.createElement('div');
  bar.className = 'sumbar';
  bar.innerHTML = `
    <div class="m hide-m"><span>Hodnota <span id="sbCur">EUR</span></span><b id="sbVal" class="num-t">0</b></div>
    <div class="m"><span>Náklad bez DPH</span><b id="sbCost" class="num-t">0 Kč</b></div>
    <div class="m hide-m"><span>Prodej bez DPH</span><b id="sbSell" class="num-t">0 Kč</b></div>
    <div class="m tot"><span>Marže</span><b id="sbMargin" class="num-t">—</b></div>
    <span class="grow"></span>
    <div class="m hide-m"><span>Naskladněno</span><b id="sbStock">0/0</b></div>
    <button class="btn hide-m" id="exportCsv" title="Stáhnout CSV (kód; počet; nákupní cena)">⬇ <span class="hide-xs">CSV</span></button>
    <button class="btn primary" id="copyStock">📋 <span class="hide-xs">Kopírovat pro Shoptet</span></button>`;
  document.body.appendChild(bar);
  const onScroll = () => $('#edTop')?.classList.toggle('scrolled', scrollY > 4);
  addEventListener('scroll', onScroll, { passive: true });

  // --- hlavička dokladu ---
  function drawHead() {
    $$('#curSeg button').forEach(b => b.classList.toggle('on', b.dataset.c === rc.currency));
    $('#rateBox').style.visibility = rc.currency === 'EUR' ? '' : 'hidden';
    $('#rstep1').classList.toggle('done', !!(rc.docNo && rc.supplier)); $('#rstep1').textContent = rc.docNo && rc.supplier ? '✓' : '1';
    $('#rcTitle').textContent = rc.docNo || 'bez čísla';
  }
  $('#curSeg').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; rc.currency = b.dataset.c; if (rc.currency === 'CZK') rc.transportPct = 0; $('[data-r="transportPct"]').value = numStr(rc.transportPct); drawHead(); drawItems(); markDirty(); };
  $('#main').addEventListener('input', e => {
    const k = e.target.dataset.r; if (!k) return;
    rc[k] = ['rate', 'transportPct'].includes(k) ? toNum(e.target.value) : e.target.value;
    drawHead(); if (['rate', 'transportPct'].includes(k)) refreshAll(); markDirty();
  });
  async function loadCnb(silent) {
    const b = $('#cnb'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    try {
      const { data, error } = await sb.functions.invoke('hub-cnb-rate', { body: { currency: 'EUR', date: rc.date } });
      if (error || !data?.rate) throw new Error(data?.error || error?.message || 'kurz nenalezen');
      rc.rate = Calc.r2(data.rate * 1000) / 1000;
      const i = $('[data-r="rate"]'); i.value = numStr(rc.rate); i.classList.remove('filled'); void i.offsetWidth; i.classList.add('filled');
      refreshAll(); markDirty();
      if (!silent) toast(`Kurz ČNB ${numStr(rc.rate)} Kč/€ (platný ${czDate(data.validFor)})`);
    } catch (err) { if (!silent) toast('ČNB: ' + err.message, true); }
    b.disabled = false; b.textContent = 'ČNB';
  }
  $('#cnb').onclick = () => loadCnb(false);

  // --- položky ---
  const open = new Set();
  function itemRow(it, n, isNew) {
    const l = stockLine(it, rc);
    const sub = [it.code, it.variant].filter(Boolean).map(esc).join(' · ');
    const cs = curSign(rc.currency);
    return `<div class="si${isNew ? ' new' : ''}${it.stocked ? ' stocked' : ''}" data-id="${it.id}">
      <label class="si-chk" title="Naskladněno v Shoptetu"><input type="checkbox" data-k="stocked" ${it.stocked ? 'checked' : ''}><span></span></label>
      <div class="si-info">
        <div class="it-name"><span class="si-n">${n}.</span> ${esc(it.name) || '<span class="muted">Bez názvu</span>'}</div>
        <div class="it-sub">${sub}${it.priceSrc ? ` <span class="tag blue" title="Nákupní cena předvyplněna">${esc(it.priceSrc)}</span>` : ''}</div>
      </div>
      <div class="si-f" data-l="Nákup / ks bez DPH"><div class="fld"><input data-k="priceInput" inputmode="decimal" value="${esc(it.priceInput || '')}" placeholder="cena" class="${it.priceInput && l.price == null ? 'bad' : ''}"><span class="suf">${cs}</span></div>
        <small class="muted" data-o="calc">${it.priceInput && /[*/+]/.test(it.priceInput) && l.price != null ? '= ' + numStr(Calc.r2(l.price * 100) / 100) + ' ' + cs : ''}</small></div>
      <div class="si-f" data-l="Počet"><input data-k="qty" inputmode="decimal" value="${esc(numStr(it.qty))}" class="num"></div>
      <div class="si-f si-cost" data-l="Náklad / ks"><b data-o="unit">${l.unitCost == null ? '—' : M(l.unitCost) + ' Kč'}</b><small class="muted" data-o="tot">${l.unitCost == null ? '' : 'celkem ' + M(l.totalCost) + ' Kč'}</small></div>
      <div class="si-f" data-l="Prodej s DPH"><div class="fld"><input data-k="sellPriceVat" inputmode="decimal" value="${esc(it.sellPriceVat == null ? '' : numStr(it.sellPriceVat))}" placeholder="—"><span class="suf">Kč</span></div><small class="muted" data-o="eshop">${eshopNote(it)}</small></div>
      <div class="si-f si-m" data-l="Marže"><span class="mg ${marginCls(l.marginPct)}" data-o="mpct">${pct(l.marginPct)}</span><small class="muted" data-o="mk">${l.margin == null ? '' : M(l.margin) + ' Kč/ks'}</small></div>
      <button class="ib del" data-a="rm" title="Odebrat">✕</button>
    </div>`;
  }
  function eshopNote(it) {
    const p = S.products && it.code ? S.products.find(x => x.code === it.code) : null;
    if (!p) return it.code ? '' : 'mimo e-shop';
    return Math.abs(p.priceVat - toNum(it.sellPriceVat)) > 0.5 ? `<span class="warn-t">v e-shopu ${M(p.priceVat)}</span>` : 'jako v e-shopu';
  }
  function drawItems(newId) {
    $('#rcItems').innerHTML = rc.items.length
      ? `<div class="si-head"><span></span><span>Produkt</span><span>Nákup/ks</span><span>Počet</span><span>Náklad/ks</span><span>Prodej s DPH</span><span>Marže</span><span></span></div>
         <div class="items">${rc.items.map((it, i) => itemRow(it, i + 1, it.id === newId)).join('')}</div>
         <div class="items-foot"><button class="btn sm" id="allStocked">✓ Označit vše jako naskladněné</button><span class="small muted">Zaškrtni položku, až ji naskladníš v Shoptetu.</span></div>`
      : `<div class="items-empty" style="margin-top:12px"><b>Zatím žádné položky</b>Napiš kód nebo kus názvu do vyhledávání výše — název, varianta, prodejní cena i poslední nákupní cena se doplní samy.</div>`;
    const all = $('#allStocked');
    if (all) all.onclick = () => { const on = rc.items.some(i => !i.stocked); rc.items.forEach(i => { i.stocked = on; }); drawItems(); markDirty(); toast(on ? 'Vše označeno jako naskladněné ✓' : 'Označení zrušeno'); };
    drawTotals();
  }
  function updateRow(it) {
    const row = $(`.si[data-id="${it.id}"]`); if (!row) return;
    const l = stockLine(it, rc); const cs = curSign(rc.currency);
    $('[data-o="unit"]', row).textContent = l.unitCost == null ? '—' : M(l.unitCost) + ' Kč';
    $('[data-o="tot"]', row).textContent = l.unitCost == null ? '' : 'celkem ' + M(l.totalCost) + ' Kč';
    $('[data-o="calc"]', row).textContent = it.priceInput && /[*/+]/.test(it.priceInput) && l.price != null ? '= ' + numStr(Calc.r2(l.price * 100) / 100) + ' ' + cs : '';
    $('[data-k="priceInput"]', row).classList.toggle('bad', !!it.priceInput && l.price == null);
    const mp = $('[data-o="mpct"]', row); mp.textContent = pct(l.marginPct); mp.className = 'mg ' + marginCls(l.marginPct);
    $('[data-o="mk"]', row).textContent = l.margin == null ? '' : M(l.margin) + ' Kč/ks';
    $('[data-o="eshop"]', row).innerHTML = eshopNote(it);
    row.classList.toggle('stocked', !!it.stocked);
    drawTotals();
  }
  function refreshAll() { rc.items.forEach(updateRow); drawTotals(); }
  function drawTotals() {
    const t = stockTotals(rc);
    $('#sbCur').textContent = rc.currency;
    $('#sbVal').textContent = M(t.cur) + ' ' + curSign(rc.currency);
    tween($('#sbCost'), t.cost, n => M(n) + ' Kč');
    $('#sbSell').textContent = M(t.sell) + ' Kč';
    const mEl = $('#sbMargin'); mEl.textContent = t.marginPct == null ? '—' : `${pct(t.marginPct)} · ${M(t.margin).replace(/,\d\d$/, '')} Kč`;
    mEl.className = 'num-t mg-t ' + marginCls(t.marginPct);
    $('#sbStock').textContent = `${t.stocked}/${t.count}`;
    const s = !t.count ? 'empty' : t.stocked >= t.count ? 'done' : t.stocked ? 'part' : 'open';
    $('#rcBadge').innerHTML = `<span class="st" data-s="${{ empty: 'draft', open: 'postponed', part: 'sent', done: 'confirmed' }[s]}">${RC_STATUS[s]}</span>`;
    $('#rstep2').classList.toggle('done', t.count > 0); $('#rstep2').textContent = t.count ? '✓' : '2';
  }
  const numKeys = ['qty', 'sellPriceVat'];
  $('#rcItems').addEventListener('input', e => {
    const row = e.target.closest('.si'); const k = e.target.dataset.k; if (!row || !k) return;
    const it = rc.items.find(x => x.id === row.dataset.id);
    if (k === 'stocked') it.stocked = e.target.checked;
    else if (k === 'sellPriceVat') it.sellPriceVat = e.target.value.trim() === '' ? null : toNum(e.target.value);
    else it[k] = numKeys.includes(k) ? toNum(e.target.value) : e.target.value;
    if (k === 'priceInput') { it.price = evalPrice(it.priceInput); delete it.priceSrc; }
    updateRow(it); markDirty();
  });
  $('#rcItems').addEventListener('change', e => { if (e.target.dataset.k === 'stocked') { const it = rc.items.find(x => x.id === e.target.closest('.si').dataset.id); if (it.stocked) toast(`${it.code || it.name} naskladněno ✓`); } });
  $('#rcItems').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.k === 'qty') { e.preventDefault(); $('#sq').focus(); }
    if (e.key === 'Enter' && e.target.dataset.k === 'priceInput') { e.preventDefault(); $('[data-k="qty"]', e.target.closest('.si')).select(); }
  });
  $('#rcItems').addEventListener('click', e => {
    const b = e.target.closest('button[data-a="rm"]'); if (!b) return;
    const row = b.closest('.si'); const i = rc.items.findIndex(x => x.id === row.dataset.id); const it = rc.items[i];
    row.classList.add('out');
    setTimeout(() => {
      rc.items.splice(i, 1); drawItems(); markDirty();
      toast(`Odebráno: ${it.code || it.name}`, { action: { label: 'Vrátit', fn: () => { rc.items.splice(Math.min(i, rc.items.length), 0, it); drawItems(it.id); markDirty(); } } });
    }, 200);
  });
  const rid = () => crypto.randomUUID().slice(0, 12);
  function addProduct(p, qty) {
    const pred = p ? predictPrice(p, rc.supplier, mem) : null;
    const it = {
      id: rid(), code: p ? p.code : '', name: p ? p.name : '', variant: p ? p.variant : '',
      priceInput: pred ? pred.priceInput : '', priceSrc: pred ? pred.src : '', qty: qty ?? '', sellPriceVat: p ? p.priceVat : null, stocked: false,
    };
    it.price = evalPrice(it.priceInput);
    if (p && !rc.supplier && p.supplier) { rc.supplier = p.supplier; $('[data-r="supplier"]').value = p.supplier; drawHead(); }
    rc.items.push(it); drawItems(it.id); markDirty();
    return it;
  }
  $('#addFree').onclick = async () => {
    const name = await promptBox('Položka mimo e-shop', 'Název položky', '', { placeholder: 'např. Upevnění rýgle na zděný sloupek', ok: 'Přidat' });
    if (!name) return;
    const it = addProduct(null); it.name = name.trim(); drawItems(it.id);
    $(`.si[data-id="${it.id}"] [data-k="priceInput"]`).focus();
  };

  // našeptávač produktů — produkty zvoleného dodavatele první
  let found = [], sel = 0, timer = null;
  const sq = $('#sq'), sr = $('#sr');
  async function search() {
    const q = sq.value.trim();
    if (q.length < 2) { sr.hidden = true; return; }
    if (!S.products) { sr.hidden = false; sr.innerHTML = '<div class="empty">Načítám produkty…</div>'; await loadProducts(); }
    const sup = fold(rc.supplier);
    found = searchProducts(q, true).sort((a, b) => (sup ? (fold(b.supplier) === sup) - (fold(a.supplier) === sup) : 0) || (b.visible - a.visible)).slice(0, 30);
    sel = 0; draw();
  }
  function draw() {
    const q = sq.value;
    sr.hidden = false;
    sr.innerHTML = found.length ? found.map((p, i) => {
      const pred = predictPrice(p, rc.supplier, mem);
      return `<div class="res ${i === sel ? 'on' : ''}" data-i="${i}">
        <code>${highlight(p.code, q)}</code>
        <div>${highlight(p.name, q)}${p.visible ? '' : '<span class="tag grey">skrytý</span>'}${rc.items.some(x => x.code === p.code) ? '<span class="tag blue">v příjemce</span>' : ''}
          <div class="v">${[p.variant && highlight(p.variant, q), p.supplier && esc(p.supplier), pred && `nákup ${esc(pred.priceInput)} ${curSign(rc.currency)}`].filter(Boolean).join(' · ')}</div></div>
        <div class="p">${M(p.priceVat)} Kč</div></div>`;
    }).join('') : '<div class="empty">Nic nenalezeno — přidej položku „Mimo e-shop“</div>';
    $('.res.on', sr)?.scrollIntoView({ block: 'nearest' });
  }
  sq.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 120); });
  sq.addEventListener('keydown', e => {
    if (sr.hidden || !found.length) return;
    if (e.key === 'ArrowDown') { sel = Math.min(found.length - 1, sel + 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    if (e.key === 'Escape') sr.hidden = true;
  });
  sr.addEventListener('mousedown', e => { const r = e.target.closest('.res'); if (r) { e.preventDefault(); pick(Number(r.dataset.i)); } });
  sq.addEventListener('blur', () => setTimeout(() => { sr.hidden = true; }, 150));
  function pick(i) {
    const p = found[i]; if (!p) return;
    sr.hidden = true; sq.value = ''; found = [];
    const it = addProduct(p);
    const row = $(`.si[data-id="${it.id}"]`);
    const target = it.priceInput ? $('[data-k="qty"]', row) : $('[data-k="priceInput"]', row);
    target.focus(); target.select?.(); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // vložení řádků z Excelu / faktury: kód ⇥ počet ⇥ cena
  $('#pasteRows').onclick = async () => {
    const txt = await modal({
      title: 'Vložit řádky z tabulky',
      body: `<p>Zkopíruj z Excelu nebo faktury sloupce <b>kód</b>, <b>počet</b> a volitelně <b>nákupní cenu</b> (v tomto pořadí) a vlož je sem. Produkty se dohledají v e-shopu.</p><textarea class="pin" rows="8" placeholder="WPCG-09-2&#9;12&#9;5,8*3,6&#10;LV059-1&#9;6000&#9;0,3"></textarea>`,
      focus: '.pin', actions: [{ label: 'Zrušit', value: null }, { label: 'Přidat řádky', value: bd => $('.pin', bd).value, cls: 'primary' }],
    });
    if (!txt) return;
    if (!S.products) await loadProducts();
    let ok = 0, miss = [];
    for (const line of txt.split(/\r?\n/)) {
      const cols = line.split(/\t|;/).map(x => x.trim()).filter((x, i) => x || i < 3);
      if (!cols[0]) continue;
      const p = S.products.find(x => fold(x.code) === fold(cols[0]));
      const it = addProduct(p || null, cols[1] ? toNum(cols[1]) : '');
      if (!p) { it.code = cols[0]; it.name = cols[0]; miss.push(cols[0]); }
      if (cols[2]) { it.priceInput = cols[2]; it.price = evalPrice(cols[2]); delete it.priceSrc; }
      ok++;
    }
    drawItems(); markDirty();
    toast(`Přidáno ${ok} řádků${miss.length ? ` · ${miss.length} kódů není v e-shopu: ${miss.slice(0, 3).join(', ')}${miss.length > 3 ? '…' : ''}` : ''}`, miss.length ? { err: false } : {});
  };

  // --- ukládání ---
  function setSave(text, cls = '') { const el = $('#saveState'); if (el) { el.textContent = text; el.className = 'save ' + cls; } }
  function markDirty() { E.dirty = true; setSave('Neuloženo', 'dirty'); clearTimeout(E.timer); E.timer = setTimeout(save, 1000); }
  async function save() {
    clearTimeout(E.timer);
    if (E.saving) await E.saving;
    if (!E.dirty) return;
    E.dirty = false; setSave('Ukládám…', 'busy');
    E.saving = (async () => {
      const t = stockTotals(rc);
      const row = {
        doc_no: rc.docNo, supplier: rc.supplier, date: rc.date || null, currency: rc.currency, rate: rc.rate || 1, transport_pct: rc.transportPct || 0,
        items: rc.items, note: rc.note, total_czk: t.cost, item_count: t.count, stocked_count: t.stocked,
      };
      try {
        const r = check(await sb.from('stock_receipts').update(row).eq('id', rc.id).eq('version', rc.version).select('version').maybeSingle());
        if (!r) {
          const cur = check(await sb.from('stock_receipts').select('last_edit_by').eq('id', rc.id).single());
          const err = new Error(`Příjemku mezitím upravil(a) ${userName(cur.last_edit_by) || 'někdo jiný'}.`); err.conflict = true; throw err;
        }
        rc.version = r.version;
        const cached = SK.receipts.find(x => x.id === rc.id);
        if (cached) Object.assign(cached, rc, { item_count: t.count, stocked_count: t.stocked, total_czk: t.cost });
        setSave('Uloženo');
      } catch (err) {
        E.dirty = !err.conflict;
        setSave(err.conflict ? 'Konflikt' : 'Chyba ukládání', 'err');
        if (err.conflict) {
          if (await confirmBox('Příjemku upravil někdo jiný', err.message + ' Načíst aktuální verzi? Tvoje poslední změny se zahodí.', { ok: 'Načíst aktuální' })) { leaveGuard = null; cleanup(); renderReceipt(rc.id); }
        } else { toast('Neuloženo: ' + err.message, true); E.timer = setTimeout(save, 5000); }
      }
    })();
    await E.saving; E.saving = null;
  }
  leaveGuard = async () => { await save(); cleanup(); };
  const onBefore = e => { if (E.dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', onBefore);
  const ks = e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
  document.addEventListener('keydown', ks);
  function cleanup() { removeEventListener('beforeunload', onBefore); document.removeEventListener('keydown', ks); removeEventListener('scroll', onScroll); bar.remove(); }

  // --- export pro Shoptet ---
  const todo = () => rc.items.filter(i => i.code && !i.stocked && toNum(i.qty) > 0);
  $('#copyStock', bar).onclick = async () => {
    const list = todo().length ? todo() : rc.items.filter(i => i.code);
    if (!list.length) return toast('Žádné položky s kódem', true);
    const txt = list.map(i => `${i.code}\t${numStr(i.qty)}`).join('\n');
    try { await navigator.clipboard.writeText(txt); toast(`Zkopírováno ${list.length} řádků: kód ⇥ počet${todo().length ? ' (jen nenaskladněné)' : ''}`); }
    catch { modal({ title: 'Zkopíruj pro Shoptet', body: `<textarea rows="10" readonly>${esc(txt)}</textarea>` }); }
  };
  $('#exportCsv', bar).onclick = () => {
    const rows = [['code', 'name', 'variant', 'amount', 'purchasePriceCzkNoVat', 'purchasePrice' + rc.currency, 'priceVat', 'marginPct']];
    rc.items.forEach(it => { const l = stockLine(it, rc); rows.push([it.code, it.name, it.variant, numStr(it.qty), l.unitCost == null ? '' : numStr(Calc.r2(l.unitCost)), l.price == null ? '' : numStr(l.price), it.sellPriceVat == null ? '' : numStr(it.sellPriceVat), l.marginPct == null ? '' : numStr(Math.round(l.marginPct * 10) / 10)]); });
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Naskladneni_${(rc.docNo || 'prijemka').replace(/[^\w-]+/g, '_')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  $('#rcDel').onclick = async () => {
    if (!(await confirmBox(`Smazat příjemku ${rc.docNo || ''}?`, 'Příjemka zmizí ze seznamu.', { ok: 'Smazat', danger: true }))) return;
    try {
      E.dirty = false; clearTimeout(E.timer);
      check(await sb.from('stock_receipts').update({ deleted: true }).eq('id', rc.id));
      SK.receipts = SK.receipts.filter(x => x.id !== rc.id);
      leaveGuard = null; cleanup(); toast('Příjemka smazána'); location.hash = '#/sklad';
    } catch (err) { toast(err.message, true); }
  };

  drawHead(); drawItems();
  // nová prázdná příjemka v EUR → rovnou načti dnešní kurz ČNB
  if (!rc.items.length && rc.currency === 'EUR' && !rc.docNo) { loadCnb(true); $('[data-r="docNo"]').focus(); }
}

// =====================================================================
// NÁVŠTĚVNOST PRODEJNY — rychlý zápis návštěv + přehled (konverze, koňáci)
// =====================================================================
const VISIT_COLS = 'id,visit_date,visit_time,persons,purpose,interest,result,doc_ref,order_value,note,staff,imported,created_by,last_edit_by,created_at,updated_at';
const BOUGHT = 'Objednávka na místě';
const VS = { list: [], period: ls.get('vh_vs_period') || 'month', from: '', to: '', q: '' };
const visitCfg = () => {
  const d = cfg();
  return {
    purposes: d.visitPurposes || ['Konzultace / výběr', 'Kalkulace', 'Platba objednávky', 'Pouze prohlídka', 'Jiné'],
    interests: d.visitInterests || ['WPC terasy', 'Vinylové podlahy', 'Obklady a dlažby', 'Příslušenství', 'Žula', 'Plotovky', 'Jiné', 'Nezjištěno'],
    results: d.visitResults || ['Bez dalšího kontaktu', 'Vizitka', 'Vzorek', 'Kontakt předán', 'Nabídka', BOUGHT, 'Objednávka později', 'Opakovaná návštěva', 'Jiné'],
    staff: d.visitStaff || ['Olča', 'Pavlík', 'Týna', 'Markéta'],
  };
};
const RESULT_TONE = { [BOUGHT]: 'ok', 'Nabídka': 'blue', 'Objednávka později': 'blue', 'Opakovaná návštěva': 'blue', 'Vzorek': 'neutral', 'Vizitka': 'neutral', 'Kontakt předán': 'neutral', 'Bez dalšího kontaktu': 'muted', 'Jiné': 'muted' };
const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
async function loadVisits() {
  const rows = await fetchAll(() => sb.from('store_visits').select(VISIT_COLS).eq('deleted', false).order('visit_date', { ascending: false }).order('created_at', { ascending: false }));
  VS.list = rows.map(r => ({ ...r, order_value: r.order_value == null ? null : Number(r.order_value), staff: r.staff || [] }));
}
function periodRange() {
  const t = new Date(); const y = t.getFullYear(), m = t.getMonth();
  switch (VS.period) {
    case 'month': return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
    case 'prev': return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
    case '30': return [ymd(new Date(Date.now() - 29 * 864e5)), ymd(t)];
    case 'year': return [`${y}-01-01`, `${y}-12-31`];
    case 'custom': return [VS.from || '0000-01-01', VS.to || '9999-12-31'];
    default: return ['0000-01-01', '9999-12-31'];
  }
}
function visitStats(list) {
  const persons = list.reduce((a, v) => a + v.persons, 0);
  const boughtRows = list.filter(v => v.result === BOUGHT);
  const bought = boughtRows.reduce((a, v) => a + v.persons, 0);
  const value = boughtRows.reduce((a, v) => a + (v.order_value || 0), 0);
  const count = (key, vals) => vals.map(k => ({ k, n: list.filter(v => v[key] === k).length }));
  const staff = {};
  for (const v of list) for (const s of v.staff) staff[s] = (staff[s] || 0) + 1;
  return { visits: list.length, persons, bought, conv: persons ? bought / persons : null, orders: boughtRows.length, value, avg: boughtRows.length ? value / boughtRows.length : null, count, staff };
}

async function renderVisits() {
  shell('visits', `<div class="topbar"><h1>Návštěvnost</h1></div><div class="panel panel-b"><div class="sk" style="height:260px"></div></div>`);
  try { await Promise.all([loadVisits(), loadSettings()]); } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  if (!S.offers.length) refreshOffers(true).catch(() => {});
  const main = $('#main');
  main.innerHTML = `
  <div class="topbar">
    <h1>Návštěvnost</h1>
    <div class="chips" id="vsPeriod">
      ${[['month', 'Tento měsíc'], ['prev', 'Minulý měsíc'], ['30', '30 dní'], ['year', 'Letos'], ['all', 'Vše'], ['custom', 'Vlastní…']].map(([k, l]) => `<button class="chip ${VS.period === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}
    </div>
    <div class="row" id="vsCustom" ${VS.period === 'custom' ? '' : 'hidden'}><input type="date" id="vsFrom" value="${esc(VS.from)}" style="width:auto"> – <input type="date" id="vsTo" value="${esc(VS.to)}" style="width:auto"></div>
  </div>
  <section class="panel vs-form-panel" id="vsNew"></section>
  <div id="vsDash"></div>
  <section class="panel" style="margin-top:18px">
    <div class="panel-h">Zapsané návštěvy <span class="sub" id="vsCount"></span><span class="grow"></span>
      <div class="search" style="width:280px;max-width:100%"><span class="ic">⌕</span><input id="vsQ" placeholder="Hledat poznámku, číslo dokladu…" value="${esc(VS.q)}"></div></div>
    <div id="vsList" style="overflow-x:auto"></div>
  </section>`;
  main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
  $$('#vsPeriod .chip').forEach(c => c.onclick = () => {
    VS.period = c.dataset.p; ls.set('vh_vs_period', VS.period);
    $$('#vsPeriod .chip').forEach(x => x.classList.toggle('on', x === c));
    $('#vsCustom').hidden = VS.period !== 'custom';
    drawVisitDash(); drawVisitList();
  });
  const onCustom = () => { VS.from = $('#vsFrom').value; VS.to = $('#vsTo').value; drawVisitDash(); drawVisitList(); };
  $('#vsFrom').onchange = onCustom; $('#vsTo').onchange = onCustom;
  $('#vsQ').oninput = e => { VS.q = e.target.value; drawVisitList(); };
  visitForm($('#vsNew'), null, async row => {
    const r = check(await sb.from('store_visits').insert({ ...row, created_by: S.me.id, last_edit_by: S.me.id }).select(VISIT_COLS).single());
    VS.list.unshift({ ...r, order_value: r.order_value == null ? null : Number(r.order_value) });
    drawVisitDash(); drawVisitList(r.id);
    toast(`Návštěva zapsána · ${r.persons} ${r.persons === 1 ? 'osoba' : r.persons < 5 ? 'osoby' : 'osob'}`, { action: { label: 'Vrátit', fn: async () => {
      try { check(await sb.from('store_visits').update({ deleted: true }).eq('id', r.id)); VS.list = VS.list.filter(x => x.id !== r.id); drawVisitDash(); drawVisitList(); toast('Zápis zrušen'); } catch (err) { toast(err.message, true); }
    } } });
  });
  drawVisitDash(); drawVisitList();
}

// formulář návštěvy (nový zápis i úprava) — vše na ťuknutí
function visitForm(el, v, onSave, { compact = false, keepDate = '' } = {}) {
  const C = visitCfg();
  const lastStaff = (() => { try { return JSON.parse(ls.get('vh_vs_staff') || '[]'); } catch { return []; } })();
  const f = v ? { ...v, staff: [...v.staff] } : { visit_date: keepDate || ymd(new Date()), persons: 1, purpose: '', interest: '', result: '', doc_ref: '', order_value: null, note: '', staff: lastStaff.filter(s => C.staff.includes(s)) };
  const chips = (key, list, multi) => `<div class="chipset" data-key="${key}" ${multi ? 'data-multi="1"' : ''}>${list.map(x => {
    const on = multi ? f[key].includes(x) : f[key] === x;
    return `<button type="button" class="pick ${on ? 'on' : ''}" data-v="${esc(x)}" ${key === 'result' ? `data-tone="${RESULT_TONE[x] || 'neutral'}"` : ''}>${esc(x)}</button>`;
  }).join('')}</div>`;
  el.innerHTML = `
    ${compact ? '' : `<div class="panel-h"><span class="vs-ico">🚪</span>Zapsat návštěvu <span class="sub">— jedna návštěva nebo skupina = jeden zápis</span></div>`}
    <form class="vs-form ${compact ? '' : 'panel-b'}" autocomplete="off">
      <div class="vs-row vs-top">
        <div><label>Datum</label><input type="date" name="visit_date" value="${esc(f.visit_date)}" required></div>
        <div><label>Počet osob</label><div class="stepper vs-persons"><button type="button" data-a="minus" aria-label="Méně">−</button><input name="persons" inputmode="numeric" value="${f.persons}"><button type="button" data-a="plus" aria-label="Více">+</button></div></div>
        <div class="vs-staff"><label>Obsluhoval(a) <span class="muted">— koňák, lze víc</span></label>${chips('staff', C.staff, true)}</div>
      </div>
      <div class="vs-row"><label>Účel návštěvy</label>${chips('purpose', C.purposes)}</div>
      <div class="vs-row"><label>Sortiment / zájem</label>${chips('interest', C.interests)}</div>
      <div class="vs-row"><label>Výsledek</label>${chips('result', C.results)}</div>
      <div class="vs-row vs-bottom">
        <div><label>Č. nabídky / objednávky</label><input name="doc_ref" value="${esc(f.doc_ref)}" placeholder="např. 2026002692 nebo 26900003"><small class="muted" id="docHint"></small></div>
        <div><label>Hodnota objednávky</label><div class="fld"><input name="order_value" inputmode="decimal" value="${f.order_value == null ? '' : esc(numStr(f.order_value))}" placeholder="—"><span class="suf">Kč</span></div></div>
        <div class="vs-note"><label>Poznámka</label><input name="note" value="${esc(f.note)}" placeholder="co řešili, co si odnesli…"></div>
        <div class="vs-save"><button class="btn primary lg" type="submit">${v ? 'Uložit změny' : '＋ Zapsat návštěvu'}</button></div>
      </div>
    </form>`;
  const form = $('form', el);
  const highlightValue = () => { const want = f.result === BOUGHT || f.purpose === 'Platba objednávky'; $('[name="order_value"]', form).closest('div').classList.toggle('want', want && !toNum($('[name="order_value"]', form).value)); };
  form.addEventListener('click', e => {
    const b = e.target.closest('.pick');
    if (b) {
      const set = b.closest('.chipset'); const key = set.dataset.key; const val = b.dataset.v;
      if (set.dataset.multi) { f[key] = f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val]; b.classList.toggle('on'); }
      else { f[key] = f[key] === val ? '' : val; $$('.pick', set).forEach(x => x.classList.toggle('on', x.dataset.v === f[key])); }
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      highlightValue(); return;
    }
    const s = e.target.closest('[data-a]');
    if (s) { const i = $('[name="persons"]', form); i.value = Math.max(1, (parseInt(i.value, 10) || 1) + (s.dataset.a === 'plus' ? 1 : -1)); }
  });
  // číslo nabídky z Vinylor Hubu → doplní hodnotu
  $('[name="doc_ref"]', form).addEventListener('input', e => {
    const t = e.target.value.trim(); const o = t && S.offers.find(x => x.number === t);
    $('#docHint', form).textContent = o ? `nabídka ${o.number}: ${custLabel(o.customer)} · ${M(o.total)} Kč` : '';
    if (o && !toNum($('[name="order_value"]', form).value)) { const i = $('[name="order_value"]', form); i.value = numStr(o.total); i.classList.remove('filled'); void i.offsetWidth; i.classList.add('filled'); }
    highlightValue();
  });
  $('[name="order_value"]', form).addEventListener('input', highlightValue);
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const row = {
      visit_date: fd.get('visit_date'), persons: Math.max(1, parseInt(fd.get('persons'), 10) || 1),
      purpose: f.purpose, interest: f.interest, result: f.result, staff: f.staff,
      doc_ref: String(fd.get('doc_ref') || '').trim(), order_value: String(fd.get('order_value') || '').trim() === '' ? null : toNum(fd.get('order_value')),
      note: String(fd.get('note') || '').trim(),
    };
    if (!v) row.visit_time = new Date().toTimeString().slice(0, 8);
    if (!row.staff.length && !(await confirmBox('Kdo obsluhoval?', 'Není vybraný žádný koňák — návštěva se nikomu nezapočítá. Uložit i tak?', { ok: 'Uložit bez jména' }))) return;
    const btn = $('button[type="submit"]', form); btn.disabled = true; const label = btn.textContent; btn.innerHTML = '<span class="spin"></span> Ukládám…';
    try {
      await onSave(row);
      ls.set('vh_vs_staff', JSON.stringify(row.staff));
      if (!v) { // připravit další zápis: datum a obsluha zůstanou
        visitForm(el, null, onSave, { compact, keepDate: row.visit_date !== ymd(new Date()) ? row.visit_date : '' });
        el.classList.remove('saved'); void el.offsetWidth; el.classList.add('saved');
      }
    } catch (err) { toast(err.message, true); }
    btn.disabled = false; btn.textContent = label;
  });
  highlightValue();
}

function drawVisitDash() {
  const [from, to] = periodRange();
  const list = VS.list.filter(v => v.visit_date >= from && v.visit_date <= to);
  const st = visitStats(list);
  const C = visitCfg();
  const staffRank = Object.entries(st.staff).sort((a, b) => b[1] - a[1]);
  const maxStaff = staffRank[0]?.[1] || 1;
  const bars = (rows, total) => { const max = Math.max(1, ...rows.map(r => r.n)); return rows.filter(r => r.n).sort((a, b) => b.n - a.n).map(r => `
    <div class="hb"><span class="hb-l">${esc(r.k)}</span><span class="hb-t"><i style="width:${(r.n / max) * 100}%" ${r.tone ? `data-tone="${r.tone}"` : ''}></i></span><b>${r.n}</b><span class="hb-p">${total ? Math.round((r.n / total) * 100) : 0} %</span></div>`).join('') || '<div class="empty">Žádné návštěvy v období</div>'; };
  // měsíční konverze (všechny měsíce v období, kde něco je)
  const months = {};
  for (const v of list) { const k = v.visit_date.slice(0, 7); (months[k] = months[k] || { persons: 0, bought: 0 }); months[k].persons += v.persons; if (v.result === BOUGHT) months[k].bought += v.persons; }
  const mk = Object.keys(months).sort();
  const maxM = Math.max(1, ...mk.map(k => months[k].persons));
  $('#vsDash').innerHTML = `
  <div class="stats" style="margin-top:18px">
    <div class="panel stat" style="--c:var(--s-sent)"><div class="k">Návštěvníků</div><div class="v" data-n="${st.persons}">0</div><div class="s">${st.visits} zápisů v období</div></div>
    <div class="panel stat" style="--c:var(--brand)"><div class="k">Nakoupilo · konverze</div><div class="v">${st.bought} <span class="v-sub">${st.conv == null ? '—' : pct(st.conv * 100)}</span></div><div class="s">osob s objednávkou na místě</div></div>
    <div class="panel stat" style="--c:var(--s-confirmed)"><div class="k">Objednávky na místě</div><div class="v" data-n="${st.value}" data-k="kc">0 Kč</div><div class="s">${st.orders} objednávek</div></div>
    <div class="panel stat" style="--c:var(--s-postponed)"><div class="k">Průměrná objednávka</div><div class="v">${st.avg == null ? '—' : M(st.avg).replace(/,\d\d$/, '') + ' Kč'}</div><div class="s">hodnota / počet objednávek</div></div>
  </div>
  <div class="vs-grid">
    <section class="panel"><div class="panel-h">🏆 Nejlepší koňák <span class="sub">počet obsloužených návštěv</span></div><div class="panel-b">
      ${staffRank.length ? staffRank.map(([n, c], i) => `<div class="rank${i === 0 ? ' first' : ''}"><span class="rk">${i === 0 ? '🐎' : i + 1}</span><span class="rn">${esc(n)}</span><span class="hb-t"><i style="width:${(c / maxStaff) * 100}%"></i></span><b>${c}</b></div>`).join('') : '<div class="empty">Žádné návštěvy v období</div>'}
      <div class="hint">Společná obsluha se započítá každému uvedenému.</div>
    </div></section>
    <section class="panel"><div class="panel-h">📈 Měsíční konverze</div><div class="panel-b">
      ${mk.length ? `<div class="mchart">${mk.map(k => { const m = months[k]; const c = m.persons ? m.bought / m.persons : 0; return `
        <div class="mcol" title="${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}: ${m.persons} osob, nakoupilo ${m.bought}">
          <span class="mc-p">${Math.round(c * 100)} %</span>
          <div class="mc-bar" style="height:${(m.persons / maxM) * 100}%"><i style="height:${m.persons ? (m.bought / m.persons) * 100 : 0}%"></i></div>
          <span class="mc-n">${m.persons}</span><span class="mc-l">${MONTHS[Number(k.slice(5)) - 1].slice(0, 3)}</span>
        </div>`; }).join('')}</div>
        <div class="legend"><span><i class="lg-a"></i>návštěvníci</span><span><i class="lg-b"></i>nakoupilo na místě</span></div>` : '<div class="empty">Žádné návštěvy v období</div>'}
    </div></section>
  </div>
  <div class="vs-grid vs-grid3">
    <section class="panel"><div class="panel-h">Podle výsledku</div><div class="panel-b">${bars(C.results.map(k => ({ k, n: list.filter(v => v.result === k).length, tone: RESULT_TONE[k] })), st.visits)}</div></section>
    <section class="panel"><div class="panel-h">Podle účelu</div><div class="panel-b">${bars(C.purposes.map(k => ({ k, n: list.filter(v => v.purpose === k).length })), st.visits)}</div></section>
    <section class="panel"><div class="panel-h">Podle sortimentu</div><div class="panel-b">${bars(C.interests.map(k => ({ k, n: list.filter(v => v.interest === k).length })), st.visits)}</div></section>
  </div>`;
  $$('#vsDash [data-n]').forEach(v => tween(v, Number(v.dataset.n), v.dataset.k ? n => M(n).replace(/,\d\d$/, '') + ' Kč' : n => String(Math.round(n))));
}

function drawVisitList(newId) {
  const [from, to] = periodRange();
  const q = fold(VS.q).trim();
  const list = VS.list.filter(v => v.visit_date >= from && v.visit_date <= to && (!q || fold([v.note, v.doc_ref, v.purpose, v.interest, v.result, v.staff.join(' ')].join(' ')).includes(q)));
  $('#vsCount').textContent = `— ${list.length} v období`;
  const shown = list.slice(0, 300);
  $('#vsList').innerHTML = list.length ? `<table class="list vs-list"><thead><tr><th>Datum</th><th class="r">Osob</th><th>Účel</th><th>Sortiment</th><th>Výsledek</th><th class="r">Hodnota</th><th>Obsluha</th><th>Poznámka</th></tr></thead><tbody>
    ${shown.map(v => `<tr class="click${v.id === newId ? ' fresh' : ''}" data-id="${v.id}">
      <td class="nowrap">${czDate(v.visit_date)}${v.visit_time ? `<div class="muted small">${v.visit_time.slice(0, 5)}</div>` : ''}</td>
      <td class="r num-t"><b>${v.persons}</b></td>
      <td>${esc(v.purpose) || '<span class="muted">—</span>'}</td>
      <td>${esc(v.interest) || '<span class="muted">—</span>'}</td>
      <td>${v.result ? `<span class="res-tag" data-tone="${RESULT_TONE[v.result] || 'neutral'}">${esc(v.result)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="r nowrap num-t">${v.order_value ? M(v.order_value).replace(/,00$/, '') + ' Kč' : ''}${v.doc_ref ? `<div class="muted small">${highlight(v.doc_ref, VS.q)}</div>` : ''}</td>
      <td class="nowrap">${v.staff.map(s => `<span class="av" title="${esc(s)}">${esc(s.slice(0, 2))}</span>`).join(' ')}</td>
      <td class="vs-note-c">${highlight(v.note, VS.q)}</td>
    </tr>`).join('')}</tbody></table>${list.length > shown.length ? `<div class="empty">Zobrazeno prvních ${shown.length} z ${list.length} — zúžení období nebo hledání ukáže zbytek.</div>` : ''}`
    : '<div class="empty" style="padding:28px">V tomto období zatím žádné návštěvy.</div>';
  $$('#vsList tr.click').forEach(r => r.onclick = () => editVisit(r.dataset.id));
}

async function editVisit(id) {
  const v = VS.list.find(x => x.id === id); if (!v) return;
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `<div class="modal vs-modal" role="dialog" aria-modal="true"><div class="row" style="justify-content:space-between"><h3>Návštěva ${czDate(v.visit_date)}</h3><div class="row"><button class="btn ghost danger" data-del>🗑 Smazat</button><button class="btn ghost" data-close>✕</button></div></div><div class="vs-edit"></div>
    <div class="muted small" style="margin-top:8px">Zapsal(a) ${esc(userName(v.created_by) || '—')} · ${czDateTime(v.created_at)}${v.imported ? ' · importováno z Excelu' : ''}</div></div>`;
  document.body.appendChild(bd);
  const close = () => { bd.classList.add('out'); document.removeEventListener('keydown', key); setTimeout(() => bd.remove(), 150); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  bd.addEventListener('mousedown', e => { if (e.target === bd) close(); });
  $('[data-close]', bd).onclick = close;
  $('[data-del]', bd).onclick = async () => {
    if (!(await confirmBox('Smazat návštěvu?', 'Zápis zmizí z přehledu i ze statistik.', { ok: 'Smazat', danger: true }))) return;
    try { check(await sb.from('store_visits').update({ deleted: true }).eq('id', id)); VS.list = VS.list.filter(x => x.id !== id); close(); drawVisitDash(); drawVisitList(); toast('Návštěva smazána'); }
    catch (err) { toast(err.message, true); }
  };
  visitForm($('.vs-edit', bd), v, async row => {
    const r = check(await sb.from('store_visits').update(row).eq('id', id).select(VISIT_COLS).single());
    Object.assign(v, r, { order_value: r.order_value == null ? null : Number(r.order_value) });
    close(); drawVisitDash(); drawVisitList(id); toast('Uloženo ✓');
  }, { compact: true });
}

// =====================================================================
// NÁSTĚNKA — nástěnky → sloupce → karty (jako Trello), živě pro celý tým
// =====================================================================
const LABEL_COLORS = { green: '#4bab5e', yellow: '#e2b203', orange: '#f5872f', red: '#e2483d', purple: '#9f6fdb', blue: '#2f7dd8', sky: '#36a4c7', pink: '#e06aa8', gray: '#8a948d' };
const BOARD_COLORS = ['#1a7f45', '#0f5c3a', '#2f6fbf', '#6b4fbb', '#b4572e', '#a3324a', '#3f6e6e', '#5a5f5c'];
const COVERS = ['', 'green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'pink'];
const BD = { boards: [], board: null, lists: [], cards: [], comments: {}, q: '', mine: false, drag: null, busy: 0, pending: false };
const between = (a, b) => (a == null ? (b == null ? 1000 : b - 1000) : b == null ? a + 1000 : (a + b) / 2);
const dueInfo = c => {
  if (!c.due_date) return null;
  const today = ymd(new Date());
  const d = new Date(c.due_date + 'T00:00');
  const label = d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  if (c.done) return { cls: 'done', label, title: 'Hotovo' };
  if (c.due_date < today) return { cls: 'over', label, title: 'Po termínu' };
  if (c.due_date === today) return { cls: 'today', label: 'dnes', title: 'Termín je dnes' };
  return { cls: '', label, title: 'Termín' };
};
const labelOf = id => (BD.board?.labels || []).find(l => l.id === id);

// ---------- přehled nástěnek ----------
async function renderBoards() {
  shell('boards', `<div class="topbar"><h1>Nástěnka</h1></div><div class="board-tiles">${'<div class="sk" style="height:110px"></div>'.repeat(3)}</div>`);
  let boards, mine;
  try {
    [boards, mine] = await Promise.all([
      sb.from('board_boards').select('*').eq('archived', false).order('position').order('created_at').then(check),
      sb.from('board_cards').select('id,title,board_id,list_id,due_date,done,labels,assignees').eq('archived', false).contains('assignees', [S.me.id]).then(check),
    ]);
  } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  BD.boards = boards;
  const lists = mine.length ? check(await sb.from('board_lists').select('id,name').in('id', [...new Set(mine.map(c => c.list_id))])) : [];
  const counts = boards.length ? check(await sb.from('board_cards').select('board_id').eq('archived', false).in('board_id', boards.map(b => b.id))) : [];
  const main = $('#main');
  main.innerHTML = `
  <div class="topbar"><h1>Nástěnka</h1><span class="muted">sdílené úkoly a projekty týmu</span></div>
  <div class="board-tiles">
    ${boards.map((b, i) => `<a class="btile" href="#/b/${b.id}" style="--bc:${esc(b.color)};--i:${i}"><b>${esc(b.name)}</b><span>${counts.filter(c => c.board_id === b.id).length} karet</span></a>`).join('')}
    <button class="btile new" id="newBoard"><b>＋ Nová nástěnka</b><span>např. Prodejna, Marketing, Sklad…</span></button>
  </div>
  <section class="panel" style="margin-top:22px">
    <div class="panel-h">📌 Moje karty <span class="sub">přiřazené tobě, napříč nástěnkami</span></div>
    <div class="panel-b">${mine.length ? `<div class="mycards">${mine.sort((a, b) => (a.done - b.done) || String(a.due_date || '9').localeCompare(String(b.due_date || '9'))).map(c => {
      const due = dueInfo(c); const b = boards.find(x => x.id === c.board_id); const l = lists.find(x => x.id === c.list_id);
      return `<a class="mycard" href="#/b/${c.board_id}?c=${c.id}" data-card="${c.id}" data-board="${c.board_id}"><span class="dot" style="background:${esc(b?.color || '#999')}"></span><span class="t">${esc(c.title)}</span><span class="muted small">${esc(b?.name || '')} · ${esc(l?.name || '')}</span>${due ? `<span class="due ${due.cls}">📅 ${esc(due.label)}</span>` : ''}</a>`;
    }).join('')}</div>` : '<div class="empty">Nemáš přiřazené žádné karty. V detailu karty se přiřadíš kliknutím na své jméno.</div>'}</div>
  </section>`;
  main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
  $$('.mycard', main).forEach(a => a.onclick = e => { e.preventDefault(); BD.openCard = a.dataset.card; location.hash = '#/b/' + a.dataset.board; });
  $('#newBoard').onclick = async () => {
    const name = await promptBox('Nová nástěnka', 'Název nástěnky', '', { placeholder: 'např. Marketing, Prodejna Dobříš…', ok: 'Vytvořit' });
    if (!name || !name.trim()) return;
    try {
      const b = check(await sb.from('board_boards').insert({ name: name.trim(), color: BOARD_COLORS[boards.length % BOARD_COLORS.length], created_by: S.me.id, position: (boards.at(-1)?.position || 0) + 1000 }).select().single());
      check(await sb.from('board_lists').insert(['K řešení', 'Rozpracováno', 'Hotovo'].map((n, i) => ({ board_id: b.id, name: n, position: (i + 1) * 1000 }))));
      location.hash = '#/b/' + b.id;
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- jedna nástěnka ----------
async function loadBoard(id) {
  const [board, lists, cards, comments] = await Promise.all([
    sb.from('board_boards').select('*').eq('id', id).single().then(check),
    sb.from('board_lists').select('*').eq('board_id', id).eq('archived', false).order('position').then(check),
    fetchAll(() => sb.from('board_cards').select('*').eq('board_id', id).order('position')),
    fetchAll(() => sb.from('board_comments').select('id,card_id').eq('board_id', id)),
  ]);
  BD.board = board; BD.lists = lists; BD.cards = cards;
  BD.comments = {}; for (const c of comments) BD.comments[c.card_id] = (BD.comments[c.card_id] || 0) + 1;
}
async function renderBoard(id) {
  shell('boards', `<div class="topbar"><div class="sk" style="height:30px;width:260px"></div></div><div class="bcanvas">${'<div class="sk" style="width:280px;height:320px;flex:none"></div>'.repeat(4)}</div>`);
  try { await loadBoard(id); } catch (e) { $('#main').innerHTML = `<div class="panel empty-big"><div class="ill">🗂️</div><h3>Nástěnku se nepodařilo otevřít</h3><p>${esc(e.message)}</p><a class="btn" href="#/nastenka">← Zpět</a></div>`; return; }
  const main = $('#main');
  main.classList.add('main-board');
  main.innerHTML = `
  <div class="bhead" style="--bc:${esc(BD.board.color)}">
    <a class="btn ghost" href="#/nastenka" title="Všechny nástěnky">←</a>
    <h1 class="bname" id="bName" title="Klikni pro přejmenování">${esc(BD.board.name)}</h1>
    <span class="grow"></span>
    <div class="search" style="width:240px;max-width:100%"><span class="ic">⌕</span><input id="bQ" placeholder="Filtrovat karty…" value="${esc(BD.q)}"></div>
    <button class="chip ${BD.mine ? 'on' : ''}" id="bMine">Jen moje</button>
    <button class="btn" id="bMenu" title="Nastavení nástěnky">⋯</button>
  </div>
  <div class="bcanvas" id="bCanvas"></div>`;
  drawBoard();
  $('#bQ').oninput = e => { BD.q = e.target.value; drawBoard(); };
  $('#bMine').onclick = e => { BD.mine = !BD.mine; e.currentTarget.classList.toggle('on', BD.mine); drawBoard(); };
  $('#bName').onclick = () => renameBoard();
  $('#bMenu').onclick = async e => {
    const a = await popMenu(e.currentTarget, [
      { label: 'Přejmenovat nástěnku', value: 'rename' }, { label: 'Barva nástěnky', value: 'color' }, { label: 'Upravit názvy štítků', value: 'labels' },
      { label: 'Archivované karty', value: 'archive' }, { label: 'Archivovat nástěnku', value: 'del' },
    ]);
    if (a === 'rename') renameBoard();
    if (a === 'color') boardColor();
    if (a === 'labels') editLabels();
    if (a === 'archive') archivedCards();
    if (a === 'del' && await confirmBox('Archivovat nástěnku?', `Nástěnka „${BD.board.name}“ zmizí ze seznamu. Data zůstanou uložená.`, { ok: 'Archivovat', danger: true })) {
      check(await sb.from('board_boards').update({ archived: true }).eq('id', BD.board.id)); location.hash = '#/nastenka';
    }
  };
  // živé změny od ostatních
  let t = null;
  const refresh = () => { clearTimeout(t); t = setTimeout(async () => { if (BD.busy || BD.drag || $('.bl-composer textarea:focus, .bl-title-input')) { BD.pending = true; return; } try { await loadBoard(id); drawBoard(); refreshOpenCard(); } catch {} }, 450); };
  const ch = sb.channel('board-' + id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'board_cards', filter: `board_id=eq.${id}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'board_lists', filter: `board_id=eq.${id}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'board_comments', filter: `board_id=eq.${id}` }, refresh)
    .subscribe();
  BD.flushPending = () => { if (BD.pending) { BD.pending = false; refresh(); } };
  routeCleanup = () => { try { sb.removeChannel(ch); } catch {} clearTimeout(t); $('#main')?.classList.remove('main-board'); };
  const want = BD.openCard || new URLSearchParams(location.hash.split('?')[1] || '').get('c');
  BD.openCard = null;
  if (want && BD.cards.some(c => c.id === want)) openCard(want);
}
async function renameBoard() {
  const n = await promptBox('Přejmenovat nástěnku', 'Název', BD.board.name, { ok: 'Uložit' });
  if (!n || !n.trim()) return;
  BD.board.name = n.trim(); $('#bName').textContent = BD.board.name;
  try { check(await sb.from('board_boards').update({ name: BD.board.name }).eq('id', BD.board.id)); } catch (err) { toast(err.message, true); }
}
async function boardColor() {
  const c = await modal({ title: 'Barva nástěnky', body: `<div class="swatches">${BOARD_COLORS.map(x => `<button class="sw ${x === BD.board.color ? 'on' : ''}" data-c="${x}" style="background:${x}"></button>`).join('')}</div>`,
    actions: [{ label: 'Zavřít', value: null }] , focus: '.sw.on' });
  void c;
}
document.addEventListener('click', async e => {
  const sw = e.target.closest('.swatches .sw'); if (!sw || !BD.board) return;
  BD.board.color = sw.dataset.c; $$('.swatches .sw').forEach(x => x.classList.toggle('on', x === sw));
  $('.bhead')?.style.setProperty('--bc', BD.board.color);
  try { check(await sb.from('board_boards').update({ color: BD.board.color }).eq('id', BD.board.id)); } catch (err) { toast(err.message, true); }
});
async function editLabels() {
  const res = await modal({
    title: 'Štítky nástěnky',
    body: `<p>Pojmenuj barevné štítky, ať všichni vědí, co znamenají.</p><div class="lbl-edit">${BD.board.labels.map(l => `<div class="row"><span class="lbl" style="background:${LABEL_COLORS[l.color]}">&nbsp;</span><input data-l="${l.id}" value="${esc(l.name)}" placeholder="bez názvu"></div>`).join('')}</div>`,
    actions: [{ label: 'Zrušit', value: null }, { label: 'Uložit', value: bd => $$('[data-l]', bd).map(i => ({ id: i.dataset.l, name: i.value.trim() })), cls: 'primary' }],
  });
  if (!res) return;
  BD.board.labels = BD.board.labels.map(l => ({ ...l, name: (res.find(r => r.id === l.id) || {}).name ?? l.name }));
  try { check(await sb.from('board_boards').update({ labels: BD.board.labels }).eq('id', BD.board.id)); drawBoard(); toast('Štítky uloženy'); } catch (err) { toast(err.message, true); }
}
async function archivedCards() {
  const arch = BD.cards.filter(c => c.archived);
  const bdEl = document.createElement('div');
  const r = modal({ title: 'Archivované karty', body: arch.length ? `<div class="arch">${arch.map(c => `<div class="row"><span class="grow">${esc(c.title)}</span><button class="btn sm" data-restore="${c.id}">Obnovit</button></div>`).join('')}</div>` : '<p class="muted">Žádné archivované karty.</p>' });
  void bdEl;
  setTimeout(() => $$('[data-restore]').forEach(b => b.onclick = async () => { await patchCard(b.dataset.restore, { archived: false }); b.closest('.row').remove(); drawBoard(); toast('Karta obnovena'); }));
  await r;
}

function visibleCards(listId) {
  const q = fold(BD.q).trim();
  return BD.cards.filter(c => c.list_id === listId && !c.archived
    && (!BD.mine || c.assignees.includes(S.me.id))
    && (!q || fold([c.title, c.description, ...c.labels.map(id => labelOf(id)?.name || '')].join(' ')).includes(q)))
    .sort((a, b) => a.position - b.position);
}
function cardHtml(c) {
  const due = dueInfo(c);
  const cl = c.checklist || []; const clDone = cl.filter(x => x.done).length;
  const labels = c.labels.map(labelOf).filter(Boolean);
  return `<article class="bc${c.done ? ' is-done' : ''}" draggable="true" data-id="${c.id}">
    ${c.cover ? `<div class="bc-cover" style="background:${LABEL_COLORS[c.cover]}"></div>` : ''}
    ${labels.length ? `<div class="bc-labels">${labels.map(l => `<span class="lbl" style="background:${LABEL_COLORS[l.color]}" title="${esc(l.name)}">${esc(l.name)}</span>`).join('')}</div>` : ''}
    <div class="bc-title">${highlight(c.title, BD.q)}</div>
    ${due || cl.length || BD.comments[c.id] || c.description || c.assignees.length ? `<div class="bc-badges">
      ${due ? `<span class="due ${due.cls}" title="${esc(due.title)}">${c.done ? '✓' : '📅'} ${esc(due.label)}</span>` : ''}
      ${c.description ? '<span title="Má popis">≡</span>' : ''}
      ${BD.comments[c.id] ? `<span title="Komentáře">💬 ${BD.comments[c.id]}</span>` : ''}
      ${cl.length ? `<span class="${clDone === cl.length ? 'cl-done' : ''}" title="Checklist">☑ ${clDone}/${cl.length}</span>` : ''}
      <span class="grow"></span>
      ${c.assignees.map(u => `<span class="av" title="${esc(userName(u))}">${initials(u)}</span>`).join('')}
    </div>` : ''}
  </article>`;
}
function drawBoard() {
  const cv = $('#bCanvas'); if (!cv) return;
  const scroll = { x: cv.scrollLeft, lists: Object.fromEntries($$('.bl-cards', cv).map(x => [x.dataset.list, x.scrollTop])) };
  cv.innerHTML = BD.lists.map(l => {
    const cards = visibleCards(l.id);
    return `<section class="bl" data-list="${l.id}">
      <header class="bl-head" draggable="true"><h3 class="bl-title" data-list="${l.id}">${esc(l.name)}</h3><span class="bl-count">${cards.length}</span><button class="ib bl-menu" data-list="${l.id}" title="Možnosti sloupce">⋯</button></header>
      <div class="bl-cards" data-list="${l.id}">${cards.map(cardHtml).join('')}</div>
      <div class="bl-foot"><button class="bl-add" data-list="${l.id}">＋ Přidat kartu</button></div>
    </section>`;
  }).join('') + `<div class="bl bl-new"><button class="bl-add" id="addList">＋ Přidat sloupec</button></div>`;
  cv.scrollLeft = scroll.x;
  $$('.bl-cards', cv).forEach(x => { x.scrollTop = scroll.lists[x.dataset.list] || 0; });
  bindBoard(cv);
}
function bindBoard(cv) {
  // karty: otevření + přetahování
  $$('.bc', cv).forEach(el => {
    el.onclick = () => openCard(el.dataset.id);
    el.ondragstart = e => { BD.drag = { type: 'card', id: el.dataset.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.id); requestAnimationFrame(() => el.classList.add('dragging')); };
    el.ondragend = () => { el.classList.remove('dragging'); $$('.bc-ph').forEach(x => x.remove()); BD.drag = null; BD.flushPending?.(); };
  });
  const ph = document.createElement('div'); ph.className = 'bc-ph';
  $$('.bl-cards', cv).forEach(zone => {
    zone.ondragover = e => {
      if (BD.drag?.type !== 'card') return;
      e.preventDefault();
      const after = [...zone.querySelectorAll('.bc:not(.dragging)')].find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      const dragged = $(`.bc[data-id="${BD.drag.id}"]`); if (dragged) ph.style.height = dragged.offsetHeight + 'px';
      after ? zone.insertBefore(ph, after) : zone.appendChild(ph);
    };
    zone.ondrop = async e => {
      if (BD.drag?.type !== 'card') return;
      e.preventDefault();
      const ids = [...zone.children].filter(x => x.matches('.bc:not(.dragging), .bc-ph')).map(x => (x.classList.contains('bc-ph') ? '__ph' : x.dataset.id));
      const i = ids.indexOf('__ph');
      const pos = (id) => BD.cards.find(c => c.id === id)?.position;
      const prev = i > 0 ? pos(ids[i - 1]) : null, next = i < ids.length - 1 ? pos(ids[i + 1]) : null;
      ph.remove();
      await moveCard(BD.drag.id, zone.dataset.list, between(prev, next));
    };
  });
  // sloupce: přetahování za hlavičku
  $$('.bl-head', cv).forEach(h => {
    h.ondragstart = e => { if (e.target.closest('.bc')) return; BD.drag = { type: 'list', id: h.closest('.bl').dataset.list }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'list'); requestAnimationFrame(() => h.closest('.bl').classList.add('dragging')); };
    h.ondragend = () => { h.closest('.bl').classList.remove('dragging'); BD.drag = null; BD.flushPending?.(); };
  });
  cv.ondragover = e => {
    if (BD.drag?.type !== 'list') return;
    e.preventDefault();
    const dragged = $(`.bl[data-list="${BD.drag.id}"]`);
    const after = [...cv.querySelectorAll('.bl:not(.dragging):not(.bl-new)')].find(l => { const r = l.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
    cv.insertBefore(dragged, after || $('.bl-new', cv));
  };
  cv.ondrop = async e => {
    if (BD.drag?.type !== 'list') return;
    e.preventDefault();
    const order = $$('.bl:not(.bl-new)', cv).map(x => x.dataset.list);
    const i = order.indexOf(BD.drag.id);
    const pos = id => BD.lists.find(l => l.id === id)?.position;
    const p = between(i > 0 ? pos(order[i - 1]) : null, i < order.length - 1 ? pos(order[i + 1]) : null);
    const l = BD.lists.find(x => x.id === BD.drag.id); l.position = p; BD.lists.sort((a, b) => a.position - b.position);
    try { check(await sb.from('board_lists').update({ position: p }).eq('id', l.id)); } catch (err) { toast(err.message, true); }
  };
  // přejmenování sloupce
  $$('.bl-title', cv).forEach(t => t.onclick = () => {
    const l = BD.lists.find(x => x.id === t.dataset.list);
    const inp = document.createElement('input'); inp.className = 'bl-title-input'; inp.value = l.name;
    t.replaceWith(inp); inp.focus(); inp.select();
    const done = async ok => {
      const v = inp.value.trim();
      if (ok && v && v !== l.name) { l.name = v; try { check(await sb.from('board_lists').update({ name: v }).eq('id', l.id)); } catch (err) { toast(err.message, true); } }
      drawBoard(); BD.flushPending?.();
    };
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = l.name; inp.blur(); } };
    inp.onblur = () => done(true);
  });
  $$('.bl-menu', cv).forEach(b => b.onclick = async () => {
    const l = BD.lists.find(x => x.id === b.dataset.list);
    const a = await popMenu(b, [{ label: 'Přejmenovat', value: 'ren' }, { label: 'Přidat kartu', value: 'add' }, { label: 'Archivovat všechny karty ve sloupci', value: 'arch' }, { label: 'Smazat sloupec', value: 'del' }]);
    if (a === 'ren') $(`.bl-title[data-list="${l.id}"]`)?.click();
    if (a === 'add') $(`.bl-add[data-list="${l.id}"]`)?.click();
    if (a === 'arch') {
      const cs = BD.cards.filter(c => c.list_id === l.id && !c.archived);
      if (!cs.length || !(await confirmBox('Archivovat karty?', `${cs.length} karet ze sloupce „${l.name}“ se přesune do archivu.`, { ok: 'Archivovat' }))) return;
      cs.forEach(c => { c.archived = true; }); drawBoard();
      try { check(await sb.from('board_cards').update({ archived: true }).in('id', cs.map(c => c.id))); toast(`Archivováno ${cs.length} karet`); } catch (err) { toast(err.message, true); }
    }
    if (a === 'del') {
      const n = BD.cards.filter(c => c.list_id === l.id && !c.archived).length;
      if (!(await confirmBox('Smazat sloupec?', n ? `Sloupec „${l.name}“ obsahuje ${n} karet — smažou se také.` : `Smazat prázdný sloupec „${l.name}“?`, { ok: 'Smazat', danger: true }))) return;
      BD.lists = BD.lists.filter(x => x.id !== l.id); drawBoard();
      try { check(await sb.from('board_lists').delete().eq('id', l.id)); } catch (err) { toast(err.message, true); }
    }
  });
  // přidání karty (zůstane otevřené pro další)
  $$('.bl-add[data-list]', cv).forEach(b => b.onclick = () => openComposer(b.dataset.list));
  $('#addList').onclick = async () => {
    const name = await promptBox('Nový sloupec', 'Název sloupce', '', { placeholder: 'např. Čeká na dodavatele', ok: 'Přidat' });
    if (!name || !name.trim()) return;
    try {
      const l = check(await sb.from('board_lists').insert({ board_id: BD.board.id, name: name.trim(), position: between(BD.lists.at(-1)?.position ?? null, null) }).select().single());
      BD.lists.push(l); drawBoard(); $('#bCanvas').scrollLeft = 1e6;
    } catch (err) { toast(err.message, true); }
  };
}
function openComposer(listId) {
  const foot = $(`.bl-add[data-list="${listId}"]`)?.closest('.bl-foot'); if (!foot) return;
  foot.innerHTML = `<div class="bl-composer"><textarea rows="2" placeholder="Co je potřeba udělat? (Enter = přidat)"></textarea><div class="row"><button class="btn primary sm" data-go>Přidat kartu</button><button class="ib" data-x title="Zavřít">✕</button></div></div>`;
  const ta = $('textarea', foot); ta.focus();
  const close = () => { drawBoard(); BD.flushPending?.(); };
  const add = async () => {
    const title = ta.value.trim(); if (!title) return close();
    ta.value = '';
    const last = visibleCards(listId).at(-1);
    const tmp = { id: 'tmp' + Date.now(), board_id: BD.board.id, list_id: listId, title, description: '', position: between(last?.position ?? null, null), labels: [], assignees: [], due_date: null, done: false, checklist: [], cover: '', archived: false };
    BD.cards.push(tmp);
    const zone = $(`.bl-cards[data-list="${listId}"]`); zone.insertAdjacentHTML('beforeend', cardHtml(tmp)); zone.scrollTop = zone.scrollHeight;
    BD.busy++;
    try {
      const { id, ...row } = tmp;
      const c = check(await sb.from('board_cards').insert({ ...row, created_by: S.me.id, last_edit_by: S.me.id }).select().single());
      Object.assign(tmp, c);
      const el = $(`.bc[data-id="${id}"]`); if (el) { el.dataset.id = c.id; el.classList.add('fresh'); el.onclick = () => openCard(c.id); }
    } catch (err) { BD.cards = BD.cards.filter(x => x !== tmp); toast(err.message, true); }
    BD.busy--;
    ta.focus();
  };
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } if (e.key === 'Escape') close(); };
  $('[data-go]', foot).onclick = add;
  $('[data-x]', foot).onclick = close;
  ta.onblur = () => setTimeout(() => { if (document.activeElement !== ta && !foot.contains(document.activeElement) && !ta.value.trim()) close(); }, 150);
}
async function moveCard(id, listId, position) {
  const c = BD.cards.find(x => x.id === id); if (!c) return;
  const from = c.list_id;
  Object.assign(c, { list_id: listId, position });
  drawBoard();
  $(`.bc[data-id="${id}"]`)?.classList.add('moved-in');
  try {
    check(await sb.from('board_cards').update({ list_id: listId, position }).eq('id', id));
    if (from !== listId) { const l = BD.lists.find(x => x.id === listId); if (/hotovo|done/i.test(l?.name || '') && !c.done && c.due_date) patchCard(id, { done: true }); }
  } catch (err) { toast(err.message, true); }
}
const patchTimers = {};
async function patchCard(id, fields, { delay = 0 } = {}) {
  const c = BD.cards.find(x => x.id === id); if (!c) return;
  Object.assign(c, fields);
  const el = $(`.bc[data-id="${id}"]`); if (el) { el.outerHTML = cardHtml(c); bindBoard($('#bCanvas')); }
  const run = async () => { BD.busy++; try { check(await sb.from('board_cards').update(fields).eq('id', id)); } catch (err) { toast(err.message, true); } BD.busy--; };
  if (!delay) return run();
  const key = id + Object.keys(fields).join();
  clearTimeout(patchTimers[key]); patchTimers[key] = setTimeout(run, delay);
}

// ---------- detail karty ----------
let refreshOpenCard = () => {};
async function openCard(id) {
  const c = BD.cards.find(x => x.id === id); if (!c) return;
  $$('.backdrop').forEach(x => x.remove());
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `<div class="modal card-modal" role="dialog" aria-modal="true"></div>`;
  document.body.appendChild(bd);
  const m = $('.card-modal', bd);
  let comments = [];
  const close = () => { bd.classList.add('out'); document.removeEventListener('keydown', key); refreshOpenCard = () => {}; setTimeout(() => bd.remove(), 150); };
  const key = e => { if (e.key === 'Escape' && !e.target.closest('textarea, input')) close(); };
  document.addEventListener('keydown', key);
  bd.addEventListener('mousedown', e => { if (e.target === bd) close(); });

  function draw() {
    const due = dueInfo(c);
    const cl = c.checklist || []; const clDone = cl.filter(x => x.done).length;
    m.innerHTML = `
      ${c.cover ? `<div class="cm-cover" style="background:${LABEL_COLORS[c.cover]}"></div>` : ''}
      <div class="cm-head">
        <textarea class="cm-title" rows="1">${esc(c.title)}</textarea>
        <button class="ib" data-close title="Zavřít (Esc)">✕</button>
      </div>
      <div class="cm-where">ve sloupci <select class="cm-list">${BD.lists.map(l => `<option value="${l.id}" ${l.id === c.list_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="cm-body">
        <div class="cm-main">
          <div class="cm-meta">
            <div><label>Lidé</label><div class="cm-people">${S.users.filter(u => u.active !== false).map(u => `<button class="cm-person ${c.assignees.includes(u.id) ? 'on' : ''}" data-u="${u.id}" title="${esc(u.name)}"><span class="av">${initials(u.id)}</span>${esc(u.name.split(' ')[0])}</button>`).join('')}</div></div>
            <div><label>Termín</label><div class="row" style="flex-wrap:nowrap"><input type="date" class="cm-due" value="${esc(c.due_date || '')}" style="width:auto">
              <label class="cm-done"><input type="checkbox" ${c.done ? 'checked' : ''}> hotovo</label>${due ? `<span class="due ${due.cls}">${esc(due.title)}</span>` : ''}</div></div>
          </div>
          <div><label>Štítky</label><div class="cm-labels">${BD.board.labels.map(l => `<button class="lbl big ${c.labels.includes(l.id) ? 'on' : ''}" data-l="${l.id}" style="--lc:${LABEL_COLORS[l.color]}">${esc(l.name || ' ')}</button>`).join('')}<button class="ib" data-editlabels title="Pojmenovat štítky">✎</button></div></div>
          <div><label>Popis</label><textarea class="cm-desc" rows="4" placeholder="Podrobnosti, odkazy, kontakty…">${esc(c.description)}</textarea></div>
          <div>
            <label>Checklist ${cl.length ? `<span class="muted">${clDone}/${cl.length}</span>` : ''}</label>
            ${cl.length ? `<div class="prog cm-prog" data-st="${clDone === cl.length ? 'done' : 'part'}"><i style="width:${(clDone / cl.length) * 100}%"></i></div>` : ''}
            <div class="cm-cl">${cl.map(x => `<div class="cm-cli ${x.done ? 'on' : ''}" data-i="${x.id}"><label class="si-chk"><input type="checkbox" ${x.done ? 'checked' : ''}><span></span></label><input class="cm-clt" value="${esc(x.text)}"><button class="ib del" data-rm title="Odebrat">✕</button></div>`).join('')}</div>
            <input class="cm-cladd" placeholder="＋ Přidat položku (Enter)">
          </div>
          <div class="cm-comments">
            <label>Komentáře</label>
            <div class="compose"><textarea id="cmNew" rows="1" placeholder="Napiš komentář…"></textarea><button class="btn primary" id="cmPost" title="Odeslat (Ctrl+Enter)">➤</button></div>
            <div id="cmList">${comments.map(x => `<div class="cm ${x.author === S.me.id ? 'mine' : ''}"><span class="av">${initials(x.author)}</span><div class="bub"><div class="h"><b>${esc(userName(x.author))}</b><span title="${esc(czDateTime(x.created_at))}">${ago(x.created_at)}</span>${x.author === S.me.id || S.me.role === 'admin' ? `<button class="x" data-cdel="${x.id}">✕</button>` : ''}</div><p>${esc(x.text)}</p></div></div>`).join('') || '<div class="muted small">Zatím bez komentářů.</div>'}</div>
          </div>
        </div>
        <div class="cm-side">
          <label>Obálka</label>
          <div class="swatches small">${COVERS.map(x => `<button class="sw2 ${c.cover === x ? 'on' : ''}" data-cover="${x}" style="background:${x ? LABEL_COLORS[x] : 'repeating-linear-gradient(45deg,#eef0ec 0 4px,#fff 4px 8px)'}" title="${x || 'bez obálky'}"></button>`).join('')}</div>
          <label style="margin-top:14px">Akce</label>
          <button class="btn sm" data-arch>${c.archived ? '↩ Obnovit z archivu' : '🗄 Archivovat'}</button>
          <button class="btn sm danger" data-del>🗑 Smazat kartu</button>
          <div class="muted small" style="margin-top:12px">Vytvořil(a) ${esc(userName(c.created_by) || '—')}<br>${c.created_at ? czDateTime(c.created_at) : ''}</div>
        </div>
      </div>`;
    const title = $('.cm-title', m); const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
    grow(title); grow($('.cm-desc', m));
    title.oninput = () => { grow(title); patchCard(c.id, { title: title.value }, { delay: 600 }); };
    title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } };
    $('[data-close]', m).onclick = close;
    $('.cm-list', m).onchange = e => { const last = visibleCards(e.target.value).at(-1); moveCard(c.id, e.target.value, between(last?.position ?? null, null)); toast('Karta přesunuta do „' + BD.lists.find(l => l.id === e.target.value).name + '“'); };
    $$('[data-u]', m).forEach(b => b.onclick = () => { const u = b.dataset.u; patchCard(c.id, { assignees: c.assignees.includes(u) ? c.assignees.filter(x => x !== u) : [...c.assignees, u] }); b.classList.toggle('on'); });
    $('.cm-due', m).onchange = e => { patchCard(c.id, { due_date: e.target.value || null }); draw(); };
    $('.cm-done input', m).onchange = e => { patchCard(c.id, { done: e.target.checked }); draw(); };
    $$('[data-l]', m).forEach(b => b.onclick = () => { const l = b.dataset.l; patchCard(c.id, { labels: c.labels.includes(l) ? c.labels.filter(x => x !== l) : [...c.labels, l] }); b.classList.toggle('on'); });
    $('[data-editlabels]', m).onclick = async () => { await editLabels(); openCard(c.id); };
    const desc = $('.cm-desc', m); desc.oninput = () => { grow(desc); patchCard(c.id, { description: desc.value }, { delay: 700 }); };
    // checklist
    const saveCl = () => patchCard(c.id, { checklist: c.checklist });
    $$('.cm-cli', m).forEach(row => {
      const it = c.checklist.find(x => x.id === row.dataset.i);
      $('input[type="checkbox"]', row).onchange = e => { it.done = e.target.checked; saveCl(); draw(); };
      $('.cm-clt', row).oninput = e => { it.text = e.target.value; patchCard(c.id, { checklist: c.checklist }, { delay: 700 }); };
      $('[data-rm]', row).onclick = () => { c.checklist = c.checklist.filter(x => x !== it); saveCl(); draw(); };
    });
    const add = $('.cm-cladd', m);
    add.onkeydown = e => { if (e.key === 'Enter' && add.value.trim()) { c.checklist = [...(c.checklist || []), { id: crypto.randomUUID().slice(0, 8), text: add.value.trim(), done: false }]; saveCl(); draw(); $('.cm-cladd', m).focus(); } };
    // obálka, archiv, smazání
    $$('[data-cover]', m).forEach(b => b.onclick = () => { patchCard(c.id, { cover: b.dataset.cover }); draw(); });
    $('[data-arch]', m).onclick = () => { const a = !c.archived; patchCard(c.id, { archived: a }); drawBoard(); if (a) { close(); toast('Karta archivována', { action: { label: 'Vrátit', fn: () => { patchCard(c.id, { archived: false }); drawBoard(); } } }); } else draw(); };
    $('[data-del]', m).onclick = async () => {
      if (!(await confirmBox('Smazat kartu?', `„${c.title}“ se smaže i s komentáři. Tip: archivace jde vrátit, smazání ne.`, { ok: 'Smazat', danger: true }))) return;
      try { check(await sb.from('board_cards').delete().eq('id', c.id)); BD.cards = BD.cards.filter(x => x.id !== c.id); drawBoard(); close(); toast('Karta smazána'); } catch (err) { toast(err.message, true); }
    };
    // komentáře
    const ta = $('#cmNew', m);
    ta.oninput = () => grow(ta);
    const post = async () => {
      const text = ta.value.trim(); if (!text) return;
      try {
        const x = check(await sb.from('board_comments').insert({ card_id: c.id, board_id: c.board_id, author: S.me.id, text }).select().single());
        comments.unshift(x); BD.comments[c.id] = (BD.comments[c.id] || 0) + 1; patchCardFace(); draw(); $('#cmNew', m).focus();
      } catch (err) { toast(err.message, true); }
    };
    $('#cmPost', m).onclick = post;
    ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(); };
    $$('[data-cdel]', m).forEach(b => b.onclick = async () => {
      if (!(await confirmBox('Smazat komentář?', 'Komentář se nevratně odstraní.', { ok: 'Smazat', danger: true }))) return;
      try { check(await sb.from('board_comments').delete().eq('id', b.dataset.cdel)); comments = comments.filter(x => x.id !== b.dataset.cdel); BD.comments[c.id]--; patchCardFace(); draw(); } catch (err) { toast(err.message, true); }
    });
  }
  const patchCardFace = () => { const el = $(`.bc[data-id="${c.id}"]`); if (el) { el.outerHTML = cardHtml(c); bindBoard($('#bCanvas')); } };
  const loadComments = async () => { comments = check(await sb.from('board_comments').select('*').eq('card_id', c.id).order('created_at', { ascending: false })); };
  draw();
  try { await loadComments(); if (!(m.contains(document.activeElement) && document.activeElement.matches('textarea, input'))) draw(); } catch {}
  refreshOpenCard = async () => {
    const i = BD.cards.findIndex(x => x.id === c.id);
    if (i < 0) { close(); return; }
    Object.assign(c, BD.cards[i]); BD.cards[i] = c; // detail i nástěnka sdílí stejný objekt
    if (m.contains(document.activeElement) && document.activeElement.matches('textarea, input:not([type="checkbox"])')) return; // nepřepisovat rozepsané
    try { await loadComments(); } catch {}
    draw();
  };
}
