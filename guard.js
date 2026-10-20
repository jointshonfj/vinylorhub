// Vinylor Hub — ochrana proti vložení do cizí stránky (clickjacking). GitHub Pages neumí poslat hlavičku X-Frame-Options.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location = window.self.location.href; } catch (e) { /* cizí rám: stránka zůstane skrytá */ }
}
