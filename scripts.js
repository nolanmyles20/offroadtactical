// ================= CONFIG =================
const SHOPIFY    = { shop: 'tacticaloffroad.myshopify.com' };
const CART       = `https://${SHOPIFY.shop}/cart`;
const CART_JS    = `https://${SHOPIFY.shop}/cart.js`;
const CART_ADD   = `https://${SHOPIFY.shop}/cart/add`;
const CART_NAME  = 'SHOPIFY_CART';

// (Kept for future use; not used for badge now)
const SF_ENDPOINT = `https://${SHOPIFY.shop}/api/2025-01/graphql.json`;
const SF_TOKEN    = '7f1d57625124831f8f9c47a088e48fb8';

const DEBUG = false;

// Pending scroll target if hotspot clicked before products render
let __pendingScrollSel = null;

// Shadow (legacy helper kept for back-compat; not needed when using local cart)
function getShadowQty() {
  return Number(localStorage.getItem('shadowCartQty') || 0) || 0;
}
function setShadowQty(n) {
  localStorage.setItem('shadowCartQty', String(Math.max(0, n|0)));
}
function bumpShadow(q) {
  setShadowQty(getShadowQty() + Math.max(1, Number(q) || 1));
}

// ============== IMAGE HELPERS ==============
function primaryImage(p) {
  if (Array.isArray(p.images) && p.images.length) return p.images[0];
  return p.image || 'assets/placeholder.png';
}
function allImages(p) {
  if (Array.isArray(p.images) && p.images.length) return p.images.slice();
  return p.image ? [p.image] : ['assets/placeholder.png'];
}

// ============== SIMPLE VARIANT HELPER ==============
function defaultSimpleVariantId(p) {
  const idFromMap = p?.variant_ids?.Solo?.Default;
  if (idFromMap != null) return String(idFromMap);
  if (p?.variant_id != null) return String(p.variant_id);
  if (typeof p?.variant_ids === 'string' || typeof p?.variant_ids === 'number') {
    return String(p.variant_ids);
  }
  return null;
}

// ============== VARIANT NODE HELPERS (NEW) ==============
function isTerminalVariantNode(node) {
  // string id OR object holding id/variant/price_cents only
  if (typeof node === 'string') return true;
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    const nonMeta = keys.filter(k => !['id','variant','price_cents'].includes(k));
    return nonMeta.length === 0;
  }
  return false;
}
function getVariantIdFromNode(node) {
  if (typeof node === 'string') return String(node);
  if (node && typeof node === 'object') return String(node.id || node.variant || '');
  return '';
}
function getVariantPriceFromNode(p, node, fallbackCents) {
  // try inline price_cents on node, else variant_price_cents map, else fallback
  if (node && typeof node === 'object' && Number.isFinite(node.price_cents)) {
    return node.price_cents | 0;
  }
  const vid = getVariantIdFromNode(node);
  if (vid && p.variant_price_cents && p.variant_price_cents[vid] != null) {
    return (p.variant_price_cents[vid] | 0);
  }
  return fallbackCents | 0;
}

// ============== LOCAL CART (source of truth) ==============
const LS_CART_KEY = 'headless_cart_v1';

function readCart() {
  try { return JSON.parse(localStorage.getItem(LS_CART_KEY)) || { lines: [] }; }
  catch { return { lines: [] }; }
}
function writeCart(cart) {
  localStorage.setItem(LS_CART_KEY, JSON.stringify(cart));
  // notify other tabs
  try { localStorage.setItem('__cart_ping__', String(Date.now())); } catch {}
}
function cartCount() {
  const c = readCart();
  return c.lines.reduce((n, l) => n + (l.qty|0), 0);
}
function cartSubtotalCents() {
  const c = readCart();
  return c.lines.reduce((sum, l) => sum + (l.price_cents || 0) * (l.qty|0), 0);
}
function setBadgeFromLocal() {
  setBadge(cartCount());
}
function addToLocalCart({ variantId, qty = 1, title, image, price_cents = 0, productId }) {
  const c = readCart();
  const key = String(variantId);
  const line = c.lines.find(l => l.variantId === key);
  if (line) {
    line.qty = Math.max(1, (line.qty|0) + (qty|0));
    line.title = title ?? line.title;
    line.image = image ?? line.image;
    line.price_cents = (price_cents ?? line.price_cents) | 0;
    line.productId = productId ?? line.productId;
  } else {
    c.lines.push({ variantId: key, qty: Math.max(1, qty|0), title, image, price_cents, productId });
  }
  writeCart(c);
  setBadgeFromLocal();
  return c;
}
function setLineQty(variantId, qty) {
  const c = readCart();
  const line = c.lines.find(l => l.variantId === String(variantId));
  if (!line) return c;
  if (qty <= 0) c.lines = c.lines.filter(l => l !== line);
  else line.qty = qty|0;
  writeCart(c);
  setBadgeFromLocal();
  return c;
}
function removeLine(variantId) {
  const c = readCart();
  c.lines = c.lines.filter(l => l.variantId !== String(variantId));
  writeCart(c);
  setBadgeFromLocal();
  return c;
}
function clearLocalCart() {
  writeCart({ lines: [] });
  setBadgeFromLocal();
}
function formatMoney(cents) {
  return `$${(Number(cents||0)/100).toFixed(2)}`;
}

// ============== TOAST (Item Added ✓) ==============
let __toastTimer = null;
function ensureToastHost() {
  if (document.getElementById('toast-host')) return;
  const host = document.createElement('div');
  host.id = 'toast-host';
  host.innerHTML = `<div id="toast" role="status" aria-live="polite" aria-atomic="true"></div>`;
  document.body.appendChild(host);
}
function showToast(msg = 'Item Added To Cart ✓', ms = 1100) {
  ensureToastHost();
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ================= BADGE =================
function setBadge(n) {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = String(n ?? 0);
}

// NOTE: We no longer let Shopify numbers override the badge,
// to avoid “16 items” ghost counts from cookies. Local cart is the truth.
async function refreshBadge() {
  setBadgeFromLocal();
}

// ================= OPTIONAL (kept for compatibility; not used for badge) =================
async function sfFetch(query, variables = {}) {
  const r = await fetch(SF_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SF_TOKEN
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
    mode: 'cors'
  });
  const j = await r.json();
  if (j.errors) { if (DEBUG) console.warn('SF errors', j.errors); throw j.errors; }
  return j.data;
}
async function ensureCart() {
  // Not required for local cart or permalink checkout; kept for future use.
  let id = localStorage.getItem('sf_cartId');
  if (id) return id;
  const data = await sfFetch(`mutation CreateCart { cartCreate { cart { id } } }`).catch(() => null);
  id = data?.cartCreate?.cart?.id || '';
  if (id) localStorage.setItem('sf_cartId', id);
  return id;
}

// ================= ONE NAMED SHOPIFY TAB (checkout only) =================
function focusCartTab() {
  let w = null;
  try { w = window.open('', CART_NAME); } catch {}
  try { if (w) w.focus(); } catch {}
  return w;
}
function openInCartTab(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = CART_NAME;
  a.rel = 'noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ============== CART PAGE RENDER + CHECKOUT (your page) ==============
function renderCart() {
  const root = document.getElementById('cart-root');
  if (!root) return;

  const c = readCart();
  if (!c.lines.length) {
    root.innerHTML = `
      <p>Your cart is empty.</p>
      <div class="cart-actions">
        <a href="/" class="btn outline">Continue shopping</a>
      </div>`;
    return;
  }

  const rows = c.lines.map(l => `
    <div class="cart-row" data-vid="${l.variantId}">
      <img class="cart-thumb" src="${l.image || 'assets/placeholder.png'}" alt="">
      <div class="cart-info">
        <div class="cart-title">${l.title || 'Item'}</div>
        <div class="cart-variant">Variant ID: ${l.variantId}</div>
      </div>
      <div class="cart-qty">
        <button class="qty-btn minus" aria-label="Decrease">−</button>
        <input class="qty-input" type="number" min="1" value="${l.qty}">
        <button class="qty-btn plus" aria-label="Increase">+</button>
      </div>
      <div class="cart-price">${formatMoney((l.price_cents||0)*(l.qty||1))}</div>
      <button class="cart-remove" aria-label="Remove">✕</button>
    </div>
  `).join('');

  const subtotal = cartSubtotalCents();
  root.innerHTML = `
    <div class="cart-table">${rows}</div>
    <div class="cart-summary">
      <div class="row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      <p class="muted">Taxes and shipping calculated at checkout.</p>
      <div class="cart-actions">
        <a href="/" class="btn outline" id="continue-shopping">Continue shopping</a>
        <button id="cart-clear" class="btn outline">Clear Cart</button>
        <button id="cart-checkout" class="btn primary">Checkout with Shopify</button>
      </div>
    </div>
  `;

  root.querySelectorAll('.cart-row').forEach(row => {
    const vid = row.getAttribute('data-vid');
    const input = row.querySelector('.qty-input');
    row.querySelector('.qty-btn.minus').addEventListener('click', () => {
      const n = Math.max(1, (parseInt(input.value,10)||1) - 1);
      input.value = n; setLineQty(vid, n); renderCart();
    });
    row.querySelector('.qty-btn.plus').addEventListener('click', () => {
      const n = Math.max(1, (parseInt(input.value,10)||1) + 1);
      input.value = n; setLineQty(vid, n); renderCart();
    });
    input.addEventListener('change', () => {
      const n = Math.max(1, parseInt(input.value,10)||1);
      setLineQty(vid, n); renderCart();
    });
    row.querySelector('.cart-remove').addEventListener('click', () => {
      removeLine(vid); renderCart();
    });
  });

  document.getElementById('cart-clear').addEventListener('click', () => { clearLocalCart(); renderCart(); });
  document.getElementById('cart-checkout').addEventListener('click', () => { sendToShopifyAndCheckout(); });
}

function sendToShopifyAndCheckout() {
  const c = readCart();
  if (!c.lines.length) return;

  // Build /cart permalink with numeric variant IDs (local is source of truth)
  const parts = c.lines.map(l => `${encodeURIComponent(l.variantId)}:${encodeURIComponent(l.qty)}`).join(',');
  const url = `https://${SHOPIFY.shop}/cart/${parts}`;

  // Open Shopify cart then push to checkout; both in the same named tab
  focusCartTab();
  openInCartTab(url);
  setTimeout(() => openInCartTab(`https://${SHOPIFY.shop}/checkout`), 800);
  // Keep local cart (safer for “back” behavior); you can clear after success if desired.
}

// ================= MOBILE NAV & SCROLL =================
function setNavHeightVar() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const h = Math.ceil(nav.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--nav-h', `${h}px`);
}
function openMobileMenu(toggle, menu) {
  if (!toggle || !menu) return;
  setNavHeightVar();
  menu.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('no-scroll');
}
function closeMobileMenu(toggle, menu) {
  if (!toggle || !menu) return;
  menu.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('no-scroll');
}
function scrollToEl(el) {
  if (!el) return;
  const navHVar = getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim();
  const navH = parseInt(navHVar || '0', 10) || 0;
  const extra = 20;
  const top = el.getBoundingClientRect().top + window.pageYOffset - (navH + extra);
  window.scrollTo({ top, behavior: 'smooth' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// ================= BOOT =================
document.addEventListener('DOMContentLoaded', () => {
  // Header cart links → go to YOUR cart page (local cart UI). No auto-open anywhere.
  [...document.querySelectorAll('[data-cart-link], #cart-link')].forEach(el => {
    el.setAttribute('href', '/cart.html');
    el.removeAttribute('target');
    el.removeAttribute('rel');
  });

  // Mobile menu wiring (click, outside, Esc, desktop MQ)
  const toggle = document.querySelector('.nav-toggle');
  const menu   = document.getElementById('main-menu');

  setNavHeightVar();
  window.addEventListener('resize', setNavHeightVar);
  window.addEventListener('orientationchange', setNavHeightVar);

  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.contains('is-open') ? closeMobileMenu(toggle, menu) : openMobileMenu(toggle, menu);
    });
    // close when a link inside the menu is tapped
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeMobileMenu(toggle, menu);
    });
    // click outside to close
    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('is-open')) return;
      const inMenu = e.target.closest('#main-menu');
      const onTgl  = e.target.closest('.nav-toggle');
      if (!inMenu && !onTgl) closeMobileMenu(toggle, menu);
    });
    // Esc to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) closeMobileMenu(toggle, menu);
    });
    // Desktop transition closes mobile menu
    const mq = window.matchMedia('(min-width: 801px)');
    if (mq.addEventListener) mq.addEventListener('change', (m) => { if (m.matches) closeMobileMenu(toggle, menu); });
    else if (mq.addListener) mq.addListener((m) => { if (m.matches) closeMobileMenu(toggle, menu); });
  }

  // Badge lifecycle — local cart is the truth
  setBadgeFromLocal();
  setInterval(refreshBadge, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshBadge();
  });
  // Update badge if another tab changes localStorage
  window.addEventListener('storage', (e) => {
    if (e.key === LS_CART_KEY || e.key === '__cart_ping__') setBadgeFromLocal();
  });

  // Filters + products
  try { initFilters(); } catch (e) { if (DEBUG) console.warn('initFilters error', e); }
  loadProducts().catch(err => console.error('loadProducts failed:', err));

  // If on cart.html, render the cart UI
  renderCart();
});

// ================= DATA LOAD =================
async function loadProducts() {
  const res = await fetch('assets/products.json', { cache: 'no-store' });
  if (!res.ok) { console.error('products.json fetch failed:', res.status, res.statusText); return; }
  const items = await res.json();

  // Category pages
  document.querySelectorAll('#product-grid').forEach(grid => {
    const cat = grid.getAttribute('data-category');
    const activeTags = getActiveTags();
    const subset = items
      .filter(p => p.platforms.includes(cat))
      .filter(p => activeTags.length === 0 || activeTags.every(t => p.tags.includes(t)));
    grid.innerHTML = subset.map(p => productCard(p)).join('') || '<p>No products match those filters.</p>';
  });

  // Featured (home)
  const fg = document.getElementById('featured-grid');
  if (fg) {
    const platforms = ['Humvee', 'Jeep', 'AR-15', 'Cross-Karts'];
    const picks = platforms.map(pl => items.find(p => p.platforms.includes(pl))).filter(Boolean);
    fg.innerHTML = picks.map(p => productCard(p)).join('');
  }

  wireCards(items);

  // Finish any pending scroll (hotspot clicked before cards rendered)
  if (__pendingScrollSel) {
    const el = document.querySelector(__pendingScrollSel);
    if (el) scrollToEl(el);
    __pendingScrollSel = null;
  }
}

// ================= RENDER =================
function productCard(p) {
  const imgs = allImages(p);

  // SIMPLE PRODUCT (no option selectors; show price)
  if (p.simple) {
    return `
    <div class="card" data-id="${p.id}" id="product-${p.id}">
      <img class="product-img" src="${imgs[0]}" alt="${p.title}">
      ${imgs.length > 1 ? `
        <div class="thumbs">
          ${imgs.map((src,i)=>`<button class="thumb" type="button" data-src="${src}" aria-pressed="${i===0}">
            <img src="${src}" alt="">
          </button>`).join('')}
        </div>` : ``}
      <div class="content">
        <div class="badge">${p.platforms.join(' • ')}</div>
        <h3>${p.title}</h3>
        <p>${p.desc}</p>
        <p class="price dyn-price">$${(p.basePrice||0).toFixed(2)}</p>
        <div class="controls">
          <div>
            <label>Qty</label>
            <input type="number" class="qty" min="1" value="1"/>
          </div>
        </div>
        <button class="btn add">ADD TO CART</button>
      </div>
    </div>`;
  }

  // CONFIGURABLE PRODUCT (2–3 level variant map)
  const labels = p.option_labels || {};
  const vmap   = p.variant_ids || {};
  const opt1   = Object.keys(vmap);
  const firstKey = opt1[0] || '';

  // Determine if there is a real second option (exclude terminal nodes)
  const nodeForFirst = firstKey ? vmap[firstKey] : null;
  const opt2Keys  = (nodeForFirst && typeof nodeForFirst === 'object' && !isTerminalVariantNode(nodeForFirst))
    ? Object.keys(nodeForFirst) : [];

  return `
  <div class="card" data-id="${p.id}" id="product-${p.id}">
    <img class="product-img" src="${imgs[0]}" alt="${p.title}">
    ${imgs.length > 1 ? `
      <div class="thumbs">
        ${imgs.map((src,i)=>`<button class="thumb" type="button" data-src="${src}" aria-pressed="${i===0}">
          <img src="${src}" alt="">
        </button>`).join('')}
      </div>` : ``}
    <div class="content">
      <div class="badge">${p.platforms.join(' • ')}</div>
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
      <p class="price dyn-price">$${(p.basePrice||0).toFixed(2)}</p>
      <div class="controls">
        <div ${opt1.length<=1 ? 'style="display:none"' : ''}>
          <label>${labels.first || 'Option 1'}</label>
          <select class="select opt1">${opt1.map(v=>`<option value="${v}">${v}</option>`).join('')}</select>
        </div>
        <div class="opt2-wrap" ${opt2Keys.length<=1 ? 'style="display:none"' : ''}>
          <label>${labels.second || 'Option 2'}</label>
          <select class="select opt2">${opt2Keys.map(v=>`<option value="${v}">${v}</option>`).join('')}</select>
        </div>
        <div class="opt3-wrap" style="display:none">
          <label>${labels.third || 'Option 3'}</label>
          <select class="select opt3"></select>
        </div>
        <div>
          <label>Qty</label>
          <input type="number" class="qty" min="1" value="1"/>
        </div>
        <label class="checkbox" ${p.powdercoat_variant_id ? '' : 'style="display:none"'}><input type="checkbox" class="powder"/> Powdercoat Black +$${p.powdercoat_price || 50}</label>
      </div>
      <button class="btn add">ADD TO CART</button>
    </div>
  </div>`;
}

// ================= WIRING =================
function wireCards(items) {
  document.querySelectorAll('.card').forEach(card => {
    const product = items.find(x => x.id === card.dataset.id);
    const btn  = card.querySelector('.add');
    const qty  = card.querySelector('.qty');
    const coat = card.querySelector('.powder');
    const priceEl = card.querySelector('.dyn-price');

    // Image thumb switcher
    const mainImg = card.querySelector('.product-img');
    card.querySelectorAll('.thumb').forEach(btnThumb => {
      btnThumb.addEventListener('click', () => {
        const src = btnThumb.getAttribute('data-src');
        if (mainImg && src) mainImg.src = src;
        card.querySelectorAll('.thumb').forEach(b => b.setAttribute('aria-pressed','false'));
        btnThumb.setAttribute('aria-pressed','true');
      });
    });

    // SIMPLE
    if (product.simple) {
      btn.addEventListener('click', () => {
        const q = Math.max(1, parseInt(qty?.value, 10) || 1);
        const variantId = defaultSimpleVariantId(product);
        if (!variantId) { showToast('Variant not found'); return; }

        const priceCents = Math.round((product.basePrice || 0) * 100);
        addToLocalCart({
          variantId, qty: q,
          title: product.title, image: primaryImage(product),
          price_cents: priceCents, productId: product.id
        });

        if (coat && coat.checked && product.powdercoat_variant_id) {
          addToLocalCart({
            variantId: product.powdercoat_variant_id, qty: 1,
            title: 'Powdercoat Black', image: primaryImage(product),
            price_cents: Math.round((product.powdercoat_price || 50) * 100),
            productId: product.id
          });
        }

        showToast('Item Added To Cart ✓');
      });
      return;
    }

    // CONFIGURABLE
    const vmap = product.variant_ids || {};
    const o1Sel = card.querySelector('.opt1');
    const o2Sel = card.querySelector('.opt2');
    const o3Sel = card.querySelector('.opt3');
    const opt2Wrap = card.querySelector('.opt2-wrap');
    const opt3Wrap = card.querySelector('.opt3-wrap');

    function setPrice(cents) {
      if (!priceEl) return;
      priceEl.textContent = `$${(Number(cents||0)/100).toFixed(2)}`;
    }

    function rebuildDownstream() {
      const baseCents = Math.round((product.basePrice || 0) * 100);
      const o1 = (o1Sel?.value || '').trim();
      let node1 = vmap[o1];

      // If first-level is terminal → hide opt2/opt3
      if (isTerminalVariantNode(node1)) {
        if (opt2Wrap) opt2Wrap.style.display = 'none';
        if (opt3Wrap) opt3Wrap.style.display = 'none';
        const priceCents = getVariantPriceFromNode(product, node1, baseCents);
        setPrice(priceCents);
        return;
      }

      // Otherwise, build Option 2
      const o2Keys = Object.keys(node1 || {});
      if (o2Sel) o2Sel.innerHTML = o2Keys.map(v => `<option value="${v}">${v}</option>`).join('');
      if (opt2Wrap) opt2Wrap.style.display = (o2Keys.length > 1 ? '' : 'none');

      const o2 = (o2Sel?.value || o2Keys[0] || '').trim();
      const node2 = node1 ? node1[o2] : null;

      // If second-level is terminal → hide opt3
      if (isTerminalVariantNode(node2)) {
        if (opt3Wrap) opt3Wrap.style.display = 'none';
        const priceCents = getVariantPriceFromNode(product, node2, baseCents);
        setPrice(priceCents);
        return;
      }

      // Else build Option 3
      const o3Keys = Object.keys(node2 || {});
      if (o3Sel) o3Sel.innerHTML = o3Keys.map(v => `<option value="${v}">${v}</option>`).join('');
      if (opt3Wrap) opt3Wrap.style.display = (o3Keys.length > 1 ? '' : 'none');

      const o3 = (o3Sel?.value || o3Keys[0] || '').trim();
      const node3 = node2 ? node2[o3] : null;

      const priceCents = getVariantPriceFromNode(product, node3, baseCents);
      setPrice(priceCents);
    }

    function resolveVariantIdCurrent() {
      const o1 = (o1Sel?.value || '').trim();
      const node1 = vmap[o1];

      if (isTerminalVariantNode(node1)) return getVariantIdFromNode(node1);

      const o2 = (o2Sel?.value || '').trim();
      const node2 = node1 ? node1[o2] : null;

      if (isTerminalVariantNode(node2)) return getVariantIdFromNode(node2);

      const o3 = (o3Sel?.value || '').trim();
      const node3 = node2 ? node2[o3] : null;

      return getVariantIdFromNode(node3);
    }

    // initial downstream + price
    rebuildDownstream();

    o1Sel?.addEventListener('change', rebuildDownstream);
    o2Sel?.addEventListener('change', rebuildDownstream);
    o3Sel?.addEventListener('change', rebuildDownstream);

    btn.addEventListener('click', () => {
      const q = Math.max(1, parseInt(qty?.value, 10) || 1);
      const variantId = resolveVariantIdCurrent();
      if (!variantId) { showToast('Please select a valid option'); return; }

      // compute price again for the exact selected node
      const baseCents = Math.round((product.basePrice || 0) * 100);
      let node = vmap[(o1Sel?.value || '').trim()];
      if (!isTerminalVariantNode(node)) {
        node = node ? node[(o2Sel?.value || '').trim()] : null;
        if (!isTerminalVariantNode(node)) {
          node = node ? node[(o3Sel?.value || '').trim()] : null;
        }
      }
      const cents = getVariantPriceFromNode(product, node, baseCents);

      addToLocalCart({
        variantId, qty: q,
        title: product.title, image: primaryImage(product),
        price_cents: cents, productId: product.id
      });

      if (coat && coat.checked && product.powdercoat_variant_id) {
        addToLocalCart({
          variantId: product.powdercoat_variant_id, qty: 1,
          title: 'Powdercoat Black', image: primaryImage(product),
          price_cents: Math.round((product.powdercoat_price || 50) * 100),
          productId: product.id
        });
      }

      showToast('Item Added To Cart ✓');
    });
  });
}

// ================= FILTERS =================
function initFilters() {
  document.querySelectorAll('.toggle').forEach(t => {
    t.addEventListener('click', () => {
      t.classList.toggle('active');
      updateUrlFromFilters();
      loadProducts();
    });
  });
  const params = new URLSearchParams(window.location.search);
  const tags = params.getAll('tag');
  if (tags.length) {
    document.querySelectorAll('.toggle').forEach(t => {
      if (tags.includes(t.dataset.tag)) t.classList.add('active');
    });
  }
}
function getActiveTags() {
  return Array.from(document.querySelectorAll('.toggle.active')).map(el => el.dataset.tag);
}
function updateUrlFromFilters() {
  const tags = getActiveTags();
  const params = new URLSearchParams();
  tags.forEach(t => params.append('tag', t));
  const newUrl = window.location.pathname + (tags.length ? ('?' + params.toString()) : '');
  history.replaceState({}, '', newUrl);
}

// ================= HOTSPOTS (Humvee + Jeep) =================
document.addEventListener('click', (e) => {
  const spot = e.target.closest('.hotspot');
  if (!spot) return;
  const sel = spot.getAttribute('data-target');
  if (!sel) return;
  const target = document.querySelector(sel);
  if (target) {
    scrollToEl(target);
    target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
  } else {
    __pendingScrollSel = sel; // scroll after products/cards render
  }
});
