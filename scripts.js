// ================= CONFIG =================
const DEBUG = false;
const PRODUCTS_JSON_PATH = window.PRODUCTS_JSON_PATH || 'assets/products.json';
const FEATURED_PRODUCTS_JSON_PATHS = window.FEATURED_PRODUCTS_JSON_PATHS || [
  'assets/products_humvee.json',
  'assets/products_jeep.json',
  'assets/products_apparel.json',
  'assets/products_edc.json'
];

let __pendingScrollSel = null;

// ================= SHIPPING HELPERS =================
const DEFAULT_PRODUCT_WEIGHT_OZ = 8;
const FREE_SHIPPING_THRESHOLD_CENTS = 25000;
const DEFAULT_SHIPPING_CENTS = 895;

function cartTotalWeightOz(cart = readCart()) {
  return (cart.lines || []).reduce((sum, line) => {
    const qty = Math.max(1, Number(line.qty || 1));
    const weightOz = Math.max(0, Number(line.weightOz || DEFAULT_PRODUCT_WEIGHT_OZ));
    return sum + (weightOz * qty);
  }, 0);
}

function calculateShippingCents(cart = readCart()) {
  const subtotal = (cart.lines || []).reduce((sum, line) => {
    return sum + ((Number(line.price_cents || 0) || 0) * Math.max(1, Number(line.qty || 1)));
  }, 0);

  if (subtotal >= FREE_SHIPPING_THRESHOLD_CENTS) return 0;

  const oz = cartTotalWeightOz(cart);
  if (oz <= 0) return 0;

  // Default shipping starts at $8.95. Keep the higher tiers for heavier carts.
  const lb = oz / 16;
  if (lb <= 1) return DEFAULT_SHIPPING_CENTS;
  if (lb <= 2) return 1295;
  if (lb <=3) return 1995;
  if (lb <=4) return 2795;
  if (lb <= 5) return 3495;
  return 4995;
}

function buildCheckoutCart(cart = readCart()) {
  const shippingCents = calculateShippingCents(cart);
  return {
    ...cart,
    shipping_cents: shippingCents,
    shipping_title: 'Shipping'
  };
}


// ================= SHADOW CART HELPERS =================
function getShadowQty() {
  return Number(localStorage.getItem('shadowCartQty') || 0) || 0;
}
function setShadowQty(n) {
  localStorage.setItem('shadowCartQty', String(Math.max(0, n | 0)));
}
function bumpShadow(q) {
  setShadowQty(getShadowQty() + Math.max(1, Number(q) || 1));
}

// ================= IMAGE HELPERS =================
function primaryImage(p) {
  if (Array.isArray(p.images) && p.images.length) return p.images[0];
  return p.image || 'assets/placeholder.png';
}
function allImages(p) {
  if (Array.isArray(p.images) && p.images.length) return p.images.slice();
  return p.image ? [p.image] : ['assets/placeholder.png'];
}

// ================= SIMPLE VARIANT HELPERS =================
function defaultSimpleVariantId(p) {
  const idFromMap = p?.variant_ids?.Solo?.Default;
  if (idFromMap != null) return String(idFromMap);
  if (p?.variant_id != null) return String(p.variant_id);
  if (typeof p?.variant_ids === 'string' || typeof p?.variant_ids === 'number') {
    return String(p.variant_ids);
  }
  return null;
}

// ================= VARIANT NODE HELPERS =================
function isTerminalVariantNode(node) {
  if (typeof node === 'string' || typeof node === 'number') return true;

  if (node && typeof node === 'object') {
    if ('Default' in node && (typeof node.Default === 'string' || typeof node.Default === 'number')) {
      return true;
    }

    const keys = Object.keys(node);
    const nonMeta = keys.filter(k => !['id', 'variant', 'price_cents', 'Default'].includes(k));
    return nonMeta.length === 0;
  }

  return false;
}

function getVariantIdFromNode(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);

  if (node && typeof node === 'object') {
    if (node.Default != null) return String(node.Default);
    if (node.id != null) return String(node.id);
    if (node.variant != null) return String(node.variant);
  }

  return '';
}

function getVariantPriceFromNode(p, node, fallbackCents) {
  if (node && typeof node === 'object' && Number.isFinite(node.price_cents)) {
    return node.price_cents | 0;
  }

  const vid = getVariantIdFromNode(node);
  if (vid && p.variant_price_cents && p.variant_price_cents[vid] != null) {
    return p.variant_price_cents[vid] | 0;
  }

  return fallbackCents | 0;
}

function getVisibleNonMetaKeys(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.keys(node).filter(k => !['id', 'variant', 'price_cents', 'Default'].includes(k));
}

function getFirstLeafNode(node) {
  if (!node) return null;
  if (isTerminalVariantNode(node)) return node;

  const keys = getVisibleNonMetaKeys(node);
  if (!keys.length) return null;

  return getFirstLeafNode(node[keys[0]]);
}

function walkVariantNode(vmap, selections) {
  let node = vmap;

  for (const sel of selections) {
    if (!node || isTerminalVariantNode(node)) break;
    node = node[sel];
  }

  return node;
}

// ================= LOCAL CART =================
const LS_CART_KEY = 'headless_cart_v1';

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(LS_CART_KEY)) || { lines: [] };
  } catch {
    return { lines: [] };
  }
}
function writeCart(cart) {
  localStorage.setItem(LS_CART_KEY, JSON.stringify(cart));
  try {
    localStorage.setItem('__cart_ping__', String(Date.now()));
  } catch {}
}
function cartCount() {
  const c = readCart();
  return c.lines.reduce((n, l) => n + (l.qty | 0), 0);
}
function cartSubtotalCents() {
  const c = readCart();
  return c.lines.reduce((sum, l) => sum + (l.price_cents || 0) * (l.qty | 0), 0);
}
function setBadgeFromLocal() {
  setBadge(cartCount());
}
function addToLocalCart({ variantId, qty = 1, title, image, price_cents = 0, productId, weightOz = DEFAULT_PRODUCT_WEIGHT_OZ }) {
  const c = readCart();
  const key = String(variantId);
  const line = c.lines.find(l => l.variantId === key);
  if (line) {
    line.qty = Math.max(1, (line.qty | 0) + (qty | 0));
    line.title = title ?? line.title;
    line.image = image ?? line.image;
    line.price_cents = (price_cents ?? line.price_cents) | 0;
    line.productId = productId ?? line.productId;
    line.weightOz = weightOz ?? line.weightOz ?? DEFAULT_PRODUCT_WEIGHT_OZ;
  } else {
    c.lines.push({
      variantId: key,
      qty: Math.max(1, qty | 0),
      title,
      image,
      price_cents,
      productId,
      weightOz: weightOz || DEFAULT_PRODUCT_WEIGHT_OZ
    });
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
  else line.qty = qty | 0;
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
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

// ================= GENERAL HELPERS =================
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[s]));
}

async function fetchJsonArray(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('Product JSON fetch failed:', res.status, res.statusText, path);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Product JSON load error:', path, err);
    return [];
  }
}

function dedupeProductsById(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item?.id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ================= SQUARE CHECKOUT =================
async function startSquareCheckout() {
  const cart = readCart();

  if (!cart.lines || !cart.lines.length) {
    showToast('Your cart is empty');
    return;
  }

  // SECURITY: only send product id / variant id / qty to Netlify.
  // Do not send browser-controlled prices or shipping to Square checkout.
  const payload = {
    lines: (cart.lines || []).map(line => ({
      id: line.productId || line.id || '',
      variantId: line.variantId || '',
      qty: Math.max(1, Number(line.qty || 1))
    }))
  };

  const shippingCents = calculateShippingCents(cart);

  try {
    const res = await fetch('https://cart.offroadtactical.com/.netlify/functions/create-square-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.url) {
      console.error('Square checkout error:', data);
      alert(data.error || data.message || 'Checkout could not be started.');
      return;
    }

    // Save local receipt preview before redirect. Payment totals are still controlled by Netlify/Square.
    try {
      localStorage.setItem('last_order', JSON.stringify({
        orderID: 'Square Checkout',
        transactionID: 'Square Payment',
        provider: 'Square',
        payer: '',
        email: '',
        amount: ((cartSubtotalCents() + shippingCents) / 100).toFixed(2),
        shipping_cents: shippingCents,
        date: new Date().toISOString(),
        items: (cart.lines || []).map(line => ({
          title: line.title || 'Item',
          variantId: line.variantId || '',
          productId: line.productId || '',
          qty: line.qty || 1,
          price_cents: line.price_cents || 0
        }))
      }));
    } catch (e) {
      console.warn('Receipt save failed:', e);
    }

    window.location.href = data.url;
  } catch (err) {
    console.error('Square checkout failed:', err);
    alert(err.message || 'Checkout could not be started.');
  }
}

function wireSquareCheckoutButton() {
  const btn = document.getElementById('square-checkout-btn');
  if (!btn) return;
  btn.addEventListener('click', startSquareCheckout);
}

// ================= TOAST =================
let __toastTimer = null;
function ensureToastHost() {
  if (document.getElementById('toast-host')) return;
  const host = document.createElement('div');
  host.id = 'toast-host';
  host.innerHTML = `<div id="toast" role="status" aria-live="polite" aria-atomic="true"></div>`;
  document.body.appendChild(host);
}
function showToast(msg = 'Item Added To Cart!', ms = 1100) {
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

  const el2 = document.getElementById('cartCount');
  if (el2) el2.textContent = String(n ?? 0);
}
async function refreshBadge() {
  setBadgeFromLocal();
}

// ================= CART PAGE =================
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
    <div class="cart-row" data-vid="${escapeHtml(l.variantId)}">
      <img class="cart-thumb" src="${escapeHtml(l.image || 'assets/placeholder.png')}" alt="">
      <div class="cart-info">
        <div class="cart-title">${escapeHtml(l.title || 'Item')}</div>
        <div class="cart-variant">Variant ID: ${escapeHtml(l.variantId)}</div>
      </div>
      <div class="cart-qty">
        <button class="qty-btn minus" aria-label="Decrease">-</button>
        <input class="qty-input" type="number" min="1" value="${l.qty}">
        <button class="qty-btn plus" aria-label="Increase">+</button>
      </div>
      <div class="cart-price">${formatMoney((l.price_cents || 0) * (l.qty || 1))}</div>
      <button class="cart-remove" aria-label="Remove">X</button>
    </div>
  `).join('');

  const subtotal = cartSubtotalCents();
  const shipping = calculateShippingCents(c);
  const total = subtotal + shipping;
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotal);
  const freeShippingBanner = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS
    ? `<div class="free-shipping-banner qualified">FREE SHIPPING APPLIED</div>`
    : `<div class="free-shipping-banner">ADD ${formatMoney(remainingForFreeShipping)} MORE TO UNLOCK FREE SHIPPING</div>`;
  const shippingText = shipping > 0 ? formatMoney(shipping) : 'FREE SHIPPING APPLIED';

  root.innerHTML = `
    ${freeShippingBanner}
    <div class="cart-table">${rows}</div>
    <div class="cart-summary">
      <div class="row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      <div class="row"><span>Shipping</span><span>${shippingText}</span></div>
      <div class="row cart-total"><span>Total</span><span>${formatMoney(total)}</span></div>
      <p class="muted">Taxes calculated at checkout.</p>
      <div class="cart-actions">
        <a href="/" class="btn outline" id="continue-shopping">Continue shopping</a>
        <button id="cart-clear" class="btn outline">Clear Cart</button>
      </div>
      <div class="cart-actions square-actions" style="margin-top:10px;">
        <button id="square-checkout-btn" class="btn" style="width:100%; max-width:320px;">
          CHECKOUT
        </button>
      </div>
    </div>
  `;

  root.querySelectorAll('.cart-row').forEach(row => {
    const vid = row.getAttribute('data-vid');
    const input = row.querySelector('.qty-input');

    row.querySelector('.qty-btn.minus').addEventListener('click', () => {
      const n = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
      input.value = n;
      setLineQty(vid, n);
      renderCart();
    });

    row.querySelector('.qty-btn.plus').addEventListener('click', () => {
      const n = Math.max(1, (parseInt(input.value, 10) || 1) + 1);
      input.value = n;
      setLineQty(vid, n);
      renderCart();
    });

    input.addEventListener('change', () => {
      const n = Math.max(1, parseInt(input.value, 10) || 1);
      setLineQty(vid, n);
      renderCart();
    });

    row.querySelector('.cart-remove').addEventListener('click', () => {
      removeLine(vid);
      renderCart();
    });
  });

  document.getElementById('cart-clear').addEventListener('click', () => {
    clearLocalCart();
    renderCart();
  });

  wireSquareCheckoutButton();
}

// ================= NAV =================
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
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ================= BOOT =================
document.addEventListener('DOMContentLoaded', () => {
  [...document.querySelectorAll('[data-cart-link], #cart-link')].forEach(el => {
    el.setAttribute('href', '/cart.html');
    el.removeAttribute('target');
    el.removeAttribute('rel');
  });

  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('main-menu');

  setNavHeightVar();
  window.addEventListener('resize', setNavHeightVar);
  window.addEventListener('orientationchange', setNavHeightVar);

  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.contains('is-open') ? closeMobileMenu(toggle, menu) : openMobileMenu(toggle, menu);
    });

    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeMobileMenu(toggle, menu);
    });

    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('is-open')) return;
      const inMenu = e.target.closest('#main-menu');
      const onTgl = e.target.closest('.nav-toggle');
      if (!inMenu && !onTgl) closeMobileMenu(toggle, menu);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) closeMobileMenu(toggle, menu);
    });

    const mq = window.matchMedia('(min-width: 801px)');
    if (mq.addEventListener) {
      mq.addEventListener('change', (m) => { if (m.matches) closeMobileMenu(toggle, menu); });
    } else if (mq.addListener) {
      mq.addListener((m) => { if (m.matches) closeMobileMenu(toggle, menu); });
    }
  }

  setBadgeFromLocal();
  setInterval(refreshBadge, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshBadge();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === LS_CART_KEY || e.key === '__cart_ping__') setBadgeFromLocal();
  });

  try {
    initFilters();
  } catch (e) {
    if (DEBUG) console.warn('initFilters error', e);
  }

  loadProducts().catch(err => console.error('loadProducts failed:', err));
  renderCart();
});

// ================= DATA LOAD =================
async function loadProducts() {
  const items = await fetchJsonArray(PRODUCTS_JSON_PATH);

  document.querySelectorAll('#product-grid').forEach(grid => {
    const cat = (grid.getAttribute('data-category') || '').trim();
    const activeTags = getActiveTags();

    const subset = items.filter(p => {
      const platforms = Array.isArray(p.platforms)
        ? p.platforms
        : (p.platform ? [p.platform] : []);

      const category = (p.category || '').trim();

      const matchesCategory =
        !cat ||
        platforms.includes(cat) ||
        category === cat;

      const tags = Array.isArray(p.tags) ? p.tags : [];
      const matchesTags =
        activeTags.length === 0 ||
        activeTags.every(t => tags.includes(t));

      return matchesCategory && matchesTags;
    });

    grid.innerHTML = subset.map(p => productCard(p)).join('') || '<p>No products match those filters.</p>';
  });

  const fg = document.getElementById('featured-grid');
  if (fg) {
    const featuredArrays = await Promise.all(
      FEATURED_PRODUCTS_JSON_PATHS.map(path => fetchJsonArray(path))
    );

    const featuredItems = dedupeProductsById(
      featuredArrays.flat().filter(p => p && p.featured === true)
    );

    fg.innerHTML = featuredItems.length
      ? featuredItems.map(p => productCard(p)).join('')
      : '<p>No featured products yet.</p>';

    const combinedItems = dedupeProductsById([...items, ...featuredItems]);
    wireCards(combinedItems);
  } else {
    wireCards(items);
  }

  if (__pendingScrollSel) {
    const el = document.querySelector(__pendingScrollSel);
    if (el) scrollToEl(el);
    __pendingScrollSel = null;
  }
}

// ================= RENDER =================
function productCard(p) {
  const imgs = allImages(p);
  const inventory = Number(p.inventory ?? 0);
  const ctaText = inventory <= 0 ? 'BACKORDER' : 'ADD TO CART';

  if (p.simple) {
    return `
    <div class="card" data-id="${p.id}" id="product-${p.id}">
      <img class="product-img" src="${imgs[0]}" alt="${escapeHtml(p.title)}">
      ${imgs.length > 1 ? `
        <div class="thumbs">
          ${imgs.map((src, i) => `<button class="thumb" type="button" data-src="${src}" aria-pressed="${i === 0}">
            <img src="${src}" alt="">
          </button>`).join('')}
        </div>` : ``}
      <div class="content">
        <div class="badge">${(p.platforms || []).join(' ÃÂ¢ÃÂÃÂ¢ ')}</div>
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.desc)}</p>
        <p class="price dyn-price">$${(p.basePrice || 0).toFixed(2)}</p>
        ${inventory <= 0 ? `<p class="stock-note">Backorder</p>` : ``}
        <div class="controls">
          <div>
            <label>Qty</label>
            <input type="number" class="qty" min="1" value="1"/>
          </div>
        </div>
        <button class="btn add ${inventory <= 0 ? 'backorder-btn' : ''}">${ctaText}</button>
        ${marketplaceButtons(p)}
      </div>
    </div>`;
  }

  const labels = p.option_labels || {};
  const vmap = p.variant_ids || {};
  const opt1 = getVisibleNonMetaKeys(vmap);
  const firstKey = opt1[0] || '';
  const nodeForFirst = firstKey ? vmap[firstKey] : null;
  const opt2Keys = (nodeForFirst && typeof nodeForFirst === 'object' && !isTerminalVariantNode(nodeForFirst))
    ? getVisibleNonMetaKeys(nodeForFirst) : [];
  const firstOpt2 = opt2Keys[0] || '';
  const nodeForSecond = firstOpt2 ? nodeForFirst?.[firstOpt2] : null;
  const opt3Keys = (nodeForSecond && typeof nodeForSecond === 'object' && !isTerminalVariantNode(nodeForSecond))
    ? getVisibleNonMetaKeys(nodeForSecond) : [];

  return `
  <div class="card" data-id="${p.id}" id="product-${p.id}">
    <img class="product-img" src="${imgs[0]}" alt="${escapeHtml(p.title)}">
    ${imgs.length > 1 ? `
      <div class="thumbs">
        ${imgs.map((src, i) => `<button class="thumb" type="button" data-src="${src}" aria-pressed="${i === 0}">
          <img src="${src}" alt="">
        </button>`).join('')}
      </div>` : ``}
    <div class="content">
      <div class="badge">${(p.platforms || []).join(' ÃÂ¢ÃÂÃÂ¢ ')}</div>
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <p class="price dyn-price">$${(p.basePrice || 0).toFixed(2)}</p>
      ${inventory <= 0 ? `<p class="stock-note">Backorder</p>` : ``}
      <div class="controls">
        <div ${opt1.length <= 1 ? 'style="display:none"' : ''}>
          <label>${escapeHtml(labels.first || 'Option 1')}</label>
          <select class="select opt1">${opt1.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
        </div>
        <div class="opt2-wrap" ${opt2Keys.length <= 1 ? 'style="display:none"' : ''}>
          <label>${escapeHtml(labels.second || 'Option 2')}</label>
          <select class="select opt2">${opt2Keys.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
        </div>
        <div class="opt3-wrap" ${opt3Keys.length <= 1 ? 'style="display:none"' : ''}>
          <label>${escapeHtml(labels.third || 'Option 3')}</label>
          <select class="select opt3">${opt3Keys.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select>
        </div>
        <div>
          <label>Qty</label>
          <input type="number" class="qty" min="1" value="1"/>
        </div>
        <label class="checkbox" ${p.powdercoat_variant_id ? '' : 'style="display:none"'}>
          <input type="checkbox" class="powder"/> Powdercoat Black +$${p.powdercoat_price || 50}
        </label>
      </div>
      <button class="btn add ${inventory <= 0 ? 'backorder-btn' : ''}">${ctaText}</button>
      ${marketplaceButtons(p)}
    </div>
  </div>`;
}

function marketplaceButtons(p) {
  const links = [];

  if (p.gunbroker_url) {
    links.push(`
      <a class="btn marketplace-btn gunbroker-btn"
         href="${p.gunbroker_url}"
         target="_blank"
         rel="noopener noreferrer nofollow">
         BUY ON GUNBROKER
      </a>
    `);
  }

  if (p.amazon_url) {
    links.push(`
      <a class="btn marketplace-btn amazon-btn"
         href="${p.amazon_url}"
         target="_blank"
         rel="noopener noreferrer nofollow">
         BUY ON AMAZON
      </a>
    `);
  }

  if (p.ebay_url) {
    links.push(`
      <a class="btn marketplace-btn ebay-btn"
         href="${p.ebay_url}"
         target="_blank"
         rel="noopener noreferrer nofollow">
         BUY ON
         <span class="ebay-logo">
           <span class="ebay-e">E</span><span class="ebay-b">B</span><span class="ebay-a">A</span><span class="ebay-y">Y</span>
         </span>
      </a>
    `);
  }

  return links.length
    ? `<div class="marketplace-links">${links.join('')}</div>`
    : '';
}

// ================= WIRE CARDS =================
function wireCards(items) {
  document.querySelectorAll('.card').forEach(card => {
    const product = items.find(x => x.id === card.dataset.id);
    if (!product) return;

    const btn = card.querySelector('.add');
    const qty = card.querySelector('.qty');
    const coat = card.querySelector('.powder');
    const priceEl = card.querySelector('.dyn-price');

    const mainImg = card.querySelector('.product-img');
    card.querySelectorAll('.thumb').forEach(btnThumb => {
      btnThumb.addEventListener('click', () => {
        const src = btnThumb.getAttribute('data-src');
        if (mainImg && src) mainImg.src = src;
        card.querySelectorAll('.thumb').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btnThumb.setAttribute('aria-pressed', 'true');
      });
    });

    if (product.simple) {
      btn.addEventListener('click', () => {
        const q = Math.max(1, parseInt(qty?.value, 10) || 1);
        const variantId = defaultSimpleVariantId(product);
        if (!variantId) {
          showToast('Variant not found');
          return;
        }

        const priceCents = Math.round((product.basePrice || 0) * 100);
        addToLocalCart({
          variantId,
          qty: q,
          title: product.title,
          image: primaryImage(product),
          price_cents: priceCents,
          productId: product.id,
          weightOz: product.weightOz || DEFAULT_PRODUCT_WEIGHT_OZ
        });

        if (coat && coat.checked && product.powdercoat_variant_id) {
          addToLocalCart({
            variantId: product.powdercoat_variant_id,
            qty: 1,
            title: 'Powdercoat Black',
            image: primaryImage(product),
            price_cents: Math.round((product.powdercoat_price || 50) * 100),
            productId: product.id,
            weightOz: 0
          });
        }

        showToast(Number(product.inventory ?? 0) <= 0 ? 'Added To Cart - Backorder' : 'Item Added To Cart!');
      });
      return;
    }

    const vmap = product.variant_ids || {};
    const o1Sel = card.querySelector('.opt1');
    const o2Sel = card.querySelector('.opt2');
    const o3Sel = card.querySelector('.opt3');
    const opt2Wrap = card.querySelector('.opt2-wrap');
    const opt3Wrap = card.querySelector('.opt3-wrap');

    function setPrice(cents) {
      if (!priceEl) return;
      priceEl.textContent = `$${(Number(cents || 0) / 100).toFixed(2)}`;
    }

    function ensureSelectOptions(selectEl, keys) {
      if (!selectEl) return;
      const current = selectEl.value;
      const html = keys.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
      selectEl.innerHTML = html;
      if (keys.includes(current)) selectEl.value = current;
      else if (keys.length) selectEl.value = keys[0];
    }

    function rebuildDownstream(changedLevel = 1) {
      const baseCents = Math.round((product.basePrice || 0) * 100);

      const o1Keys = getVisibleNonMetaKeys(vmap);
      if (o1Sel && o1Keys.length) {
        ensureSelectOptions(o1Sel, o1Keys);
      }

      const o1 = (o1Sel?.value || o1Keys[0] || '').trim();
      let node1 = vmap[o1];

      if (!node1) {
        const fallbackLeaf = getFirstLeafNode(vmap);
        setPrice(getVariantPriceFromNode(product, fallbackLeaf, baseCents));
        if (opt2Wrap) opt2Wrap.style.display = 'none';
        if (opt3Wrap) opt3Wrap.style.display = 'none';
        return;
      }

      if (isTerminalVariantNode(node1)) {
        if (opt2Wrap) opt2Wrap.style.display = 'none';
        if (opt3Wrap) opt3Wrap.style.display = 'none';
        setPrice(getVariantPriceFromNode(product, node1, baseCents));
        return;
      }

      const o2Keys = getVisibleNonMetaKeys(node1);
      if (o2Sel) {
        ensureSelectOptions(o2Sel, o2Keys);
      }
      if (opt2Wrap) opt2Wrap.style.display = (o2Keys.length > 1 ? '' : 'none');

      const o2 = (o2Sel?.value || o2Keys[0] || '').trim();
      let node2 = node1[o2];

      if (!node2) {
        const fallbackLeaf = getFirstLeafNode(node1);
        if (opt3Wrap) opt3Wrap.style.display = 'none';
        setPrice(getVariantPriceFromNode(product, fallbackLeaf, baseCents));
        return;
      }

      if (isTerminalVariantNode(node2)) {
        if (opt3Wrap) opt3Wrap.style.display = 'none';
        setPrice(getVariantPriceFromNode(product, node2, baseCents));
        return;
      }

      const o3Keys = getVisibleNonMetaKeys(node2);
      if (o3Sel) {
        ensureSelectOptions(o3Sel, o3Keys);
      }
      if (opt3Wrap) opt3Wrap.style.display = (o3Keys.length > 1 ? '' : 'none');

      const o3 = (o3Sel?.value || o3Keys[0] || '').trim();
      let node3 = node2[o3];

      if (!node3) {
        const fallbackLeaf = getFirstLeafNode(node2);
        setPrice(getVariantPriceFromNode(product, fallbackLeaf, baseCents));
        return;
      }

      setPrice(getVariantPriceFromNode(product, node3, baseCents));
    }

    function resolveVariantIdCurrent() {
      const o1 = (o1Sel?.value || '').trim();
      const o2 = (o2Sel?.value || '').trim();
      const o3 = (o3Sel?.value || '').trim();

      let node = walkVariantNode(vmap, [o1, o2, o3].filter(Boolean));

      if (!node || !isTerminalVariantNode(node)) {
        const partialNode = walkVariantNode(vmap, [o1, o2].filter(Boolean));
        if (partialNode && isTerminalVariantNode(partialNode)) node = partialNode;
      }

      if (!node || !isTerminalVariantNode(node)) {
        const partialNode = walkVariantNode(vmap, [o1].filter(Boolean));
        if (partialNode && isTerminalVariantNode(partialNode)) node = partialNode;
      }

      if (!node) {
        node = getFirstLeafNode(vmap);
      }

      return getVariantIdFromNode(node);
    }

    function resolveCurrentPriceCents() {
      const baseCents = Math.round((product.basePrice || 0) * 100);

      const o1 = (o1Sel?.value || '').trim();
      const o2 = (o2Sel?.value || '').trim();
      const o3 = (o3Sel?.value || '').trim();

      let node = walkVariantNode(vmap, [o1, o2, o3].filter(Boolean));

      if (!node || !isTerminalVariantNode(node)) {
        node = getFirstLeafNode(node || walkVariantNode(vmap, [o1, o2].filter(Boolean)) || walkVariantNode(vmap, [o1].filter(Boolean)) || vmap);
      }

      return getVariantPriceFromNode(product, node, baseCents);
    }

    rebuildDownstream(1);

    o1Sel?.addEventListener('change', () => rebuildDownstream(1));
    o2Sel?.addEventListener('change', () => rebuildDownstream(2));
    o3Sel?.addEventListener('change', () => rebuildDownstream(3));

    btn.addEventListener('click', () => {
      const q = Math.max(1, parseInt(qty?.value, 10) || 1);
      const variantId = resolveVariantIdCurrent();

      if (!variantId) {
        showToast('Please select a valid option');
        return;
      }

      const cents = resolveCurrentPriceCents();

      const variations = [
        (o1Sel?.value || '').trim(),
        (o2Sel?.value || '').trim(),
        (o3Sel?.value || '').trim()
      ].filter(Boolean).join(' / ');

      const displayTitle = variations
        ? `${product.title} - ${variations}`
        : product.title;

      addToLocalCart({
        variantId,
        qty: q,
        title: displayTitle,
        image: primaryImage(product),
        price_cents: cents,
        productId: product.id,
        weightOz: product.weightOz || DEFAULT_PRODUCT_WEIGHT_OZ
      });

      if (coat && coat.checked && product.powdercoat_variant_id) {
        addToLocalCart({
          variantId: product.powdercoat_variant_id,
          qty: 1,
          title: 'Powdercoat Black',
          image: primaryImage(product),
          price_cents: Math.round((product.powdercoat_price || 50) * 100),
          productId: product.id,
          weightOz: 0
        });
      }

      showToast(Number(product.inventory ?? 0) <= 0 ? 'Added To Cart - Backorder' : 'Item Added To Cart!');
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

// ================= HOTSPOTS =================
document.addEventListener('click', (e) => {
  const spot = e.target.closest('.hotspot');
  if (!spot) return;
  const sel = spot.getAttribute('data-target');
  if (!sel) return;
  const target = document.querySelector(sel);
  if (target) {
    scrollToEl(target);
    target.classList.remove('flash');
    void target.offsetWidth;
    target.classList.add('flash');
  } else {
    __pendingScrollSel = sel;
  }
});
