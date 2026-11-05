// Vinylor Hub — verze aplikace. Při KAŽDÉM vydání: zvýšit číslo, přidat záznam do CHANGELOG
// a stejné číslo dát do ?v=… v index.html (kvůli mezipaměti prohlížeče).
// Číslování: 0.x = beta (před ostrým provozem s Shoptetem). Až bude vše napojené a ověřené, vyjde 1.0.0.
export const APP_VERSION = '0.20.2';
export const APP_CHANNEL = 'beta';       // 'beta' | 'rc' | '' (ostrá verze)
export const APP_BUILD = '2026-11-03';
export const CHANGELOG = [
  { v: '0.20.2', d: '2026-11-05', t: ['Kontejnery odemčeny pro všechny uživatele, nahoře štítek „Testovací verze“'] },
  { v: '0.20.1', d: '2026-11-04', t: ['Nabídky: kompaktnější přehled nahoře, nabídky na nástěnce jsou výš a méně se scrolluje'] },
  { v: '0.20.0', d: '2026-11-04', t: ['Nabídky: nový vzhled podle zásad Apple (velký nadpis, skleněná lišta, hero s přehledem rozjednaných nabídek a poměrem stavů, widgety s kroužkem úspěšnosti, segmentový přepínač s pohyblivým jezdcem, hlubší karty s pružným pohybem)', 'Archivované nabídky se nepočítají do statistik', 'Systémové písmo (SF na Apple zařízeních), plynulejší tlačítka a zvýrazněný fokus'] },
  { v: '0.19.0', d: '2026-11-04', t: ['Nabídky: archiv (tlačítko 📦 na kartě, v editoru a „Archivovat vše“ u sloupců Překlopena / Zamítnuta; záložka Archiv, nabídku jde vrátit)', 'Nástěnka: sloupec ukáže nejvýš 6 karet, další se rolují uvnitř sloupce'] },
  { v: '0.18.0', d: '2026-11-04', t: ['Nabídky → Shoptet: když na skladě není dost zboží, systém na to upozorní a po potvrzení objednávku i tak založí a sklad stáhne do mínusu'] },
  { v: '0.17.1', d: '2026-11-04', t: ['Kontejnery: oprava načítání mapy plavby u kontejnerů, které už Terminal49 sledoval (tlačítko „Obnovit teď“ se zobrazí vždy a při každém obnovení se zkusí načíst trasa)'] },
  { v: '0.17.0', d: '2026-11-04', t: ['Kontejnery: mapa plavby přímo v detailu (trasa a poloha lodi z Terminal49), odkaz „Otevřít v Terminal49“ místo cizích webů', 'Oprava vzhledu panelu sledování, přístavy (odkud → kam) a události se berou ze správných polí Terminal49'] },
  { v: '0.16.0', d: '2026-11-03', t: ['Kontejnery: nový přehled v přístavním stylu — animované moře s plující lodí plnou kontejnerů, stavové karty s počítadly, kontejnery jako karty s „plavbou“ (loď na trase podle ETD/ETA) a odpočtem, přepínač Karty / Tabulka'] },
  { v: '0.15.0', d: '2026-11-03', t: ['Kontejnery: sledování v reálném čase přes Terminal49 (stav, loď, ETA, události, poloha lodi a vzdálenost do přístavu), tlačítko „Spustit sledování“ a automatická obnova každé 3 hodiny'] },
  { v: '0.14.0', d: '2026-11-03', t: ['Kontejnery: přehlednější detail (průběh v krocích, souhrn, informace, obsah, faktury)', 'Tlačítko „Naskladnit“ v náhledu: příjem položek (dorazilo OK / méně / více / poškozeno / nedorazilo, poznámky, poznámka k doručení), výběr řádků, úprava množství a naskladnění celého kontejneru nebo jen jeho části ve 4 krocích'] },
  { v: '0.13.1', d: '2026-11-03', t: ['Kontejnery: možnost přidat produkt, který není v Shoptetu (eviduje se a hledá se, nenaskladňuje se)', 'Hledání produktů (i v nabídkách) bere i EAN, MPN, výrobce a další identifikátory z exportu Shoptetu'] },
  { v: '0.13.0', d: '2026-11-03', t: ['Kontejnery: detail je jen náhled, úpravy se zapnou tlačítkem „Upravit“ (nový kontejner se otevře rovnou k vyplnění)', 'Faktury ke kontejneru (číslo, částka, PDF) a hledání podle nich', 'Naskladnění kontejneru do Shoptetu ve dvou krocích: kontrola + schválení opsáním čísla kontejneru, sloupec „Dorazilo“, ochrana proti dvojímu odeslání'] },
  { v: '0.12.0', d: '2026-11-02', t: ['Nová aplikace Kontejnery (zatím jen pro Filipa, ostatní ji vidí zamčenou): čísla kontejnerů, loď, ETA, položky z e-shopu, hledání „kdy k nám přijde …“', 'Přístup k aplikacím po uživatelích (hlídá i databáze)'] },
  { v: '0.11.2', d: '2026-10-29', t: ['Naskladnění: doručené a naskladněné svozy z OrderJoi se zobrazují i v hlavním seznamu příjemek (označené „svoz“)'] },
  { v: '0.11.1', d: '2026-10-29', t: ['OrderJoi: upozornění na doručený svoz čekající na naskladnění a tlačítko „Naskladnit“ v seznamu svozů i v detailu objednávky'] },
  { v: '0.11.0', d: '2026-10-29', t: ['OrderJoi přepracován podle SmartJoi: objednávky → e-mail dodavateli s referencí → AUF (číslo a částka v EUR) → svoz → naskladnění', 'Stavové karty (Reklamace, Objednat, Čeká na AUF, Bez svozu, Na cestě, Doručeno), záložky AUFy · Svozy · Produkty · Dodavatelé', 'Svoz SV-2026-001 přenesen ze SmartJoi včetně všech AUF a produktových údajů'] },
  { v: '0.10.0', d: '2026-10-29', t: ['Naskladnění → Svozy (OrderJoi): objednávky ze Shoptetu ve stavu „Potřeba objednat“ se načtou, přiřadí se dodavatel (Mefo, Gunreben…) a z vybraných položek vznikne svoz', 'Svoz má stavy Připravuje se → Objednáno → Na cestě → Dorazil → Naskladněno, e-mail dodavateli a po příjezdu naskladnění všeho do Shoptetu jedním klikem'] },
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
