// Vinylor Hub — verze aplikace. Při KAŽDÉM vydání: zvýšit číslo, přidat záznam do CHANGELOG
// a stejné číslo dát do ?v=… v index.html (kvůli mezipaměti prohlížeče).
// Číslování: 0.x = beta (před ostrým provozem s Shoptetem). Až bude vše napojené a ověřené, vyjde 1.0.0.
export const APP_VERSION = '0.9.2';
export const APP_CHANNEL = 'beta';       // 'beta' | 'rc' | '' (ostrá verze)
export const APP_BUILD = '2026-10-23';
export const CHANGELOG = [
  { v: '0.9.2', d: '2026-10-23', t: ['PDF a náhled nabídky: při výpadku sítě se knihovna načte znovu místo trvalé chyby „Nepodařilo se načíst pdfmake“'] },
  { v: '0.9.1', d: '2026-10-20', t: ['Objednávka ve Shoptetu dostane interní poznámku „Vytvořeno z nabídky č. … ve Vinylor Hubu“ (kdo vystavil a kdo překlopil)'] },
  { v: '0.9.0', d: '2026-10-20', t: ['Nabídky: tlačítko „Překlopit do Shoptetu“ — z nabídky se jedním krokem založí objednávka ve Shoptetu (slevy a ceny přesně podle nabídky, ochrana proti dvojímu založení)'] },
  { v: '0.8.0', d: '2026-10-20', t: ['Propojení se Shoptetem (API): test spojení a výběr skladu v Nastavení', 'Naskladnění: tlačítko „Naskladnit do Shoptetu“ u příjemek (jen přírůstek, ochrana proti dvojímu odeslání)'] },
  { v: '0.7.0', d: '2026-10-20', t: ['Nový vzhled ve stylu SmartJoi, světlý i tmavý režim', 'Zobrazení verze aplikace a upozornění na novou verzi'] },
  { v: '0.6.0', d: '2026-10-20', t: ['Povinné dvoufázové ověření (2FA)', 'Správa týmu: reset 2FA, odhlášení ze všech zařízení, bezpečnostní deník', 'Zpřísněná hesla, ochrana proti vložení do cizí stránky'] },
  { v: '0.5.0', d: '2026-10-20', t: ['Nová aplikace Nástěnka (karty a sloupce jako v Trellu, živé změny)'] },
  { v: '0.4.0', d: '2026-10-17', t: ['Nová aplikace Návštěvnost prodejny (rychlý zápis, přehled, import z Excelu)'] },
  { v: '0.3.0', d: '2026-10-17', t: ['Nová aplikace Naskladnění (příjemky, kurz ČNB, předvyplnění nákupních cen, marže, import z Excelu)'] },
  { v: '0.2.0', d: '2026-10-15', t: ['Nabídky: doplnění firmy z ARES podle IČ, nový vzhled PDF, číslování jen z číslic', 'Online provoz: GitHub Pages + Supabase'] },
  { v: '0.1.0', d: '2026-10-14', t: ['První verze: nabídkový systém s PDF, stavy nabídek a interními komentáři'] },
];
