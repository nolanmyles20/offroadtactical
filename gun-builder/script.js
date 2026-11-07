
'use strict';

const $ = id => document.getElementById(id);

const money = value =>
  value == null
    ? 'Price pending'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);

let catalog;
let zoom = 1;

const state = {
  firearm: '',
  optic: '',
  light: '',
  lightColor: 'black'
};

const findGun = () =>
  catalog.firearms.find(x => x.id === state.firearm);

const findAccessory = id =>
  catalog.accessories.find(x => x.id === id);

const compatible = (gun, item) =>
  !!gun &&
  !!item &&
  item.stock &&
  item.compatibleMounts.includes(
    item.category === 'optic'
      ? gun.opticMount
      : gun.lightMount
  );

function fillSelect(el, items, selected) {
  el.replaceChildren();

  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent =
      item.name +
      (item.id === 'none'
        ? ''
        : ` · ${money(item.price)}`);

    el.append(opt);
  }

  el.value = selected;
}

function setImage(el, item) {
  el.onerror = () => {
    el.onerror = null;
    el.src = item.fallbackImage || 'assets/pistol.svg';
  };

  el.src = item.image;
}

// =====================================
// OLIGHT COLOR VARIANTS
// =====================================

function getLightVariants(light) {
  if (!light) return [];

  const variants = light.colorVariants;

  if (Array.isArray(variants)) {
    return variants.filter(
      v => v &&
        v.enabled !== false &&
        v.id &&
        v.image
    );
  }

  // Support catalog entries without
  // explicitly defined color variants.
  return [];
}

function selectedLightVariant() {
  const light = findAccessory(state.light);
  const variants = getLightVariants(light);

  return (
    variants.find(v => v.id === state.lightColor) ||
    variants[0] ||
    null
  );
}

function updateLightColors() {
  const light = findAccessory(state.light);
  const wrap = $('lightColorWrap');
  const select = $('lightColor');

  if (!wrap || !select) return;

  const variants = getLightVariants(light);

  wrap.hidden = !light || variants.length === 0;

  select.replaceChildren();

  if (!variants.length) {
    state.lightColor = 'black';
    return;
  }

  for (const variant of variants) {
    const opt = document.createElement('option');

    opt.value = variant.id;
    opt.textContent =
      variant.label || variant.id;

    select.append(opt);
  }

  if (!variants.some(v => v.id === state.lightColor)) {
    state.lightColor = variants[0].id;
  }

  select.value = state.lightColor;
}

function setupLightColors() {
  const lightSelect = $('light');

  if (!lightSelect || $('lightColorWrap')) return;

  const wrap = document.createElement('div');
  wrap.id = 'lightColorWrap';
  wrap.hidden = true;

  const label = document.createElement('label');
  label.htmlFor = 'lightColor';
  label.textContent = 'Light color';

  const select = document.createElement('select');
  select.id = 'lightColor';
  select.setAttribute(
    'aria-label',
    'Light color'
  );

  select.addEventListener('change', () => {
    state.lightColor = select.value;
    render();
  });

  wrap.append(label, select);

  // Keep the color control within the
  // existing light selection area.
  lightSelect.insertAdjacentElement(
    'afterend',
    wrap
  );

  const css = document.createElement('style');

  css.textContent = `
    #lightColorWrap {
      margin-top: 12px;
      margin-bottom: 12px;
    }

    #lightColorWrap[hidden] {
      display: none !important;
    }

    #lightColorWrap label {
      display: block;
      margin-bottom: 7px;
      color: #d8d8d8;
      font-size: 14px;
      font-weight: 600;
    }

    #lightColorWrap select {
      display: block;
      width: 100%;
      max-width: 100%;
      padding: 11px;
      background: #141414;
      border: 1px solid #666;
      border-radius: 6px;
      color: #eee;
      font-size: 16px;
      box-sizing: border-box;
    }

    #lightColorWrap select:focus {
      outline: 2px solid #b6ff00;
      outline-offset: 2px;
    }
  `;

  document.head.append(css);
}

// =====================================
// MAIN RENDER
// =====================================

function render() {
  const gun = findGun();

  if (!gun) return;

  fillSelect(
    $('firearm'),
    catalog.firearms.filter(x => x.stock),
    state.firearm
  );

  for (const category of ['optic', 'light']) {
    const choices = catalog.accessories.filter(
      x => x.category === category && x.stock
    );

    if (
      category === 'optic' &&
      gun.id === 'psa-pa15'
    ) {
      choices.sort((a, b) =>
        a.id === 'osight-r'
          ? -1
          : b.id === 'osight-r'
          ? 1
          : 0
      );
    }

    if (
      state[category] !== 'none' &&
      !choices.some(x => x.id === state[category])
    ) {
      state[category] = 'none';
    }

    fillSelect(
      $(category),
      [{ id: 'none', name: 'None' }, ...choices],
      state[category]
    );
  }

  updateLightColors();

  // Firearm image
  setImage($('firearmImage'), gun);

  $('firearmImage').alt = gun.name;

  $('firearmImage').style.width =
    (gun.previewScale || 100) + '%';

  $('firearmImage').style.left =
    (gun.basePosition?.x ?? 50) + '%';

  $('firearmImage').style.top =
    (gun.basePosition?.y ?? 50) + '%';

  $('firearmImage').style.transform =
    'translate(-50%,-50%)';

  // Optic and light overlays
  for (const category of ['optic', 'light']) {
    const el = $(category + 'Image');
    const item = findAccessory(state[category]);

    const position =
      category === 'optic'
        ? gun.opticPosition
        : gun.lightPosition;

    el.hidden =
      !item || item.previewApproved === false;

    if (item) {
      const variant =
        category === 'light'
          ? selectedLightVariant()
          : null;

      const displayItem =
        variant
          ? { ...item, image: variant.image }
          : item;

      setImage(el, displayItem);

      el.alt =
        item.name +
        (variant
          ? ' ' + (variant.label || variant.id)
          : '');

      el.style.left = position.x + '%';
      el.style.top = position.y + '%';
      el.style.width = position.width + '%';

      el.style.transform =
        'translate(-50%,-50%)';
    }
  }

  const refBox = $('accessoryReference');

  if (refBox) refBox.hidden = true;

  $('imageNote').textContent =
    'Images are illustrative. Verify exact firearm model, mounting compatibility, and hardware before purchase.';

  const optic = findAccessory(state.optic);
  const light = findAccessory(state.light);
  const lightVariant = selectedLightVariant();

  const lines = [gun, optic, light].filter(Boolean);

  $('buildLines').replaceChildren();

  for (const item of lines) {
    const row = document.createElement('div');
    row.className = 'line';

    const name = document.createElement('span');

    name.textContent =
      item.name +
      (item === light && lightVariant
        ? ' (' +
          (lightVariant.label || lightVariant.id) +
          ')'
        : '');

    const price = document.createElement('span');
    price.textContent = money(item.price);

    row.append(name, price);
    $('buildLines').append(row);
  }

  $('total').textContent =
    lines.every(x => x.price != null)
      ? money(
          lines.reduce(
            (sum, x) => sum + x.price,
            0
          )
        )
      : 'Pricing not available';

  $('compatibility').textContent =
    'PRELIMINARY CATALOG: Imported Square products appear in selections but are not drawn as mounted until manually calibrated and fitment verified. Accessory selection is for visualization only, NOT a verified fitment recommendation. Confirm exact PSA SKU, optic footprint/adapter, rail type, and mounting hardware before purchase. The standard Dagger slide has no optic mount.';

  const url = new URL(location.href);

  for (const key of ['firearm', 'optic', 'light']) {
    url.searchParams.set(key, state[key]);
  }

  url.searchParams.set(
    'lightColor',
    state.lightColor
  );

  history.replaceState(null, '', url);
}

// =====================================
// BUILD SUMMARY
// =====================================

function summary() {
  const gun = findGun();
  const optic = findAccessory(state.optic);
  const light = findAccessory(state.light);
  const variant = selectedLightVariant();

  return `Offroad Tactical build
Firearm: ${gun.name}
Optic: ${optic?.name || 'None'}
Light: ${light?.name || 'None'}${
    light && variant
      ? ' (' + (variant.label || variant.id) + ')'
      : ''
  }
Estimated total: ${$('total').textContent}
Illustrative preview; accessory fit NOT verified; pricing and availability pending.`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);

    $('message').textContent =
      'Copied to clipboard.';
  } catch {
    $('message').textContent =
      'Clipboard unavailable. Try opening the site over HTTPS.';
  }
}

// =====================================
// INITIALIZATION
// =====================================

async function init() {
  try {
    const response = await fetch(
      'catalog.json',
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw Error('Catalog not found');
    }

    catalog = await response.json();

    applySavedPositions();

    // Additional Square product listings
    try {
      const sr = await fetch(
        'square-products.json',
        { cache: 'no-store' }
      );

      if (sr.ok) {
        const sq = await sr.json();

        const ids = new Set(
          catalog.accessories.map(x => x.id)
        );

        for (const item of sq.accessories || []) {
          if (!ids.has(item.id)) {
            catalog.accessories.push(item);
            ids.add(item.id);
          }
        }
      }
    } catch (e) {
      console.warn(
        'Square sync unavailable; using base catalog',
        e
      );
    }

    const params =
      new URLSearchParams(location.search);

    const guns =
      catalog.firearms.filter(x => x.stock);

    if (!guns.length) {
      throw Error('No available firearms in catalog');
    }

    state.firearm =
      guns.some(x => x.id === params.get('firearm'))
        ? params.get('firearm')
        : (
            guns.find(x => x.id === 'psa-pa15') ||
            guns[0]
          ).id;

    for (const category of ['optic', 'light']) {
      state[category] =
        params.get(category) || 'none';
    }

    // Restore selected light color from
    // a shared URL.
    state.lightColor =
      params.get('lightColor') || 'black';

    $('firearm').addEventListener(
      'change',
      e => {
        state.firearm = e.target.value;
        render();
      }
    );

    for (const category of ['optic', 'light']) {
      $(category).addEventListener(
        'change',
        e => {
          state[category] = e.target.value;

          if (category === 'light') {
            state.lightColor = 'black';
          }

          render();
        }
      );
    }

    $('zoomIn').onclick = () => {
      zoom = Math.min(1.8, zoom + 0.15);
      $('art').style.setProperty('--zoom', zoom);
    };

    $('zoomOut').onclick = () => {
      zoom = Math.max(0.7, zoom - 0.15);
      $('art').style.setProperty('--zoom', zoom);
    };

    $('zoomReset').onclick = () => {
      zoom = 1;
      $('art').style.setProperty('--zoom', zoom);
    };

    $('copyBuild').onclick = () =>
      copy(summary());

    $('shareBuild').onclick = () =>
      copy(location.href);

    $('year').textContent =
      new Date().getFullYear();

    // REQUIRED: Create color selector
    // before rendering.
    setupLightColors();

    render();

    setupPositionEditor();

  } catch (error) {
    $('compatibility').textContent =
      'Could not load catalog: ' +
      error.message +
      ' (serve this folder using a local web server or GitHub Pages).';
  }
}

// =====================================
// POSITION EDITOR
// =====================================

const EDITOR_STORAGE =
  'offroad-builder-positions-v1';

let editorLayer = 'optic';
let editorEnabled = false;
let editorDragging = null;

function applySavedPositions() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(EDITOR_STORAGE) ||
      '{}'
    );

    for (const gun of catalog.firearms) {
      const data = saved[gun.id];

      if (!data) continue;

      for (const key of [
        'opticPosition',
        'lightPosition',
        'basePosition'
      ]) {
        if (data[key]) {
          gun[key] = {
            ...gun[key],
            ...data[key]
          };
        }
      }

      if (Number.isFinite(data.previewScale)) {
        gun.previewScale = data.previewScale;
      }
    }
  } catch (err) {
    console.warn(
      'Could not restore calibration',
      err
    );
  }
}

function savePositions() {
  const data = {};

  for (const gun of catalog.firearms) {
    data[gun.id] = {
      previewScale: gun.previewScale || 100,
      basePosition:
        gun.basePosition || { x: 50, y: 50 },
      opticPosition: gun.opticPosition,
      lightPosition: gun.lightPosition
    };
  }

  localStorage.setItem(
    EDITOR_STORAGE,
    JSON.stringify(data)
  );
}

function currentEditorPosition() {
  const gun = findGun();

  if (editorLayer === 'firearm') {
    return {
      x: gun.basePosition?.x ?? 50,
      y: gun.basePosition?.y ?? 50,
      width: gun.previewScale || 100
    };
  }

  return gun[editorLayer + 'Position'];
}

function updateEditorControls() {
  const pos = currentEditorPosition();

  if (!pos) return;

  for (const key of ['x', 'y', 'width']) {
    const el = $('edit-' + key);

    if (el) {
      el.value =
        Number(pos[key]).toFixed(1);
    }
  }

  for (const name of [
    'firearm',
    'optic',
    'light'
  ]) {
    const b = $('edit-layer-' + name);

    if (b) {
      b.classList.toggle(
        'active',
        name === editorLayer
      );
    }
  }

  const chosen =
    editorLayer === 'firearm'
      ? $('firearmImage')
      : $(editorLayer + 'Image');

  $('editorHelp').textContent =
    chosen.hidden
      ? 'This accessory is not displayed. Select an accessory first.'
      : 'Drag the selected image in the preview, or change its X, Y and size values.';
}

function setEditorPosition(key, value) {
  const gun = findGun();

  if (!gun || !Number.isFinite(value)) {
    return;
  }

  value = Math.max(
    key === 'width' ? 2 : 0,
    Math.min(
      key === 'width' ? 180 : 100,
      value
    )
  );

  if (editorLayer === 'firearm') {
    if (key === 'width') {
      gun.previewScale = value;
    } else {
      gun.basePosition ??= {
        x: 50,
        y: 50
      };

      gun.basePosition[key] = value;
    }
  } else {
    gun[editorLayer + 'Position'][key] =
      value;
  }

  render();
  updateEditorControls();
  savePositions();
}

function setupPositionEditor() {
  const css = document.createElement('style');

  css.textContent = `
    #editorPanel {
      margin-top: 15px;
      padding: 14px;
      border: 1px solid #566167;
      border-radius: 9px;
      background: #151b1e;
      color: #f5f5f5;
    }

    #editorPanel[hidden] {
      display: none;
    }

    #editorPanel .editrow {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin: 9px 0;
    }

    #editorPanel button,
    #editToggle {
      border: 1px solid #66747b;
      border-radius: 6px;
      background: #253036;
      color: white;
      padding: 8px 12px;
      cursor: pointer;
    }

    #editorPanel button.active {
      outline: 2px solid #b6cf41;
    }

    #editorPanel label {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1 1 120px;
      font-size: 13px;
    }

    #editorPanel input {
      width: 75px;
      padding: 7px;
      background: #0e1315;
      color: white;
      border: 1px solid #66747b;
      border-radius: 5px;
    }

    #editorPanel .edit-note {
      font-size: 12px;
      line-height: 1.5;
      color: #b9c3c6;
    }

    #art.editor-on .overlay,
    #art.editor-on #firearmImage {
      touch-action: none;
    }

    #art.editor-on .editor-target {
      outline: 1px dashed #b6cf41;
      cursor: grab;
    }
  `;

  document.head.append(css);

  const panel =
    document.createElement('div');

  panel.id = 'editorPanel';
  panel.hidden = true;

  panel.innerHTML = `
    <strong>POSITION EDITOR</strong>

    <p class="edit-note">
      Adjust this firearm independently.
      Save in browser for testing;
      download the catalog to publish changes.
    </p>

    <div class="editrow">
      <button type="button" id="edit-layer-firearm">Firearm</button>
      <button type="button" id="edit-layer-optic">Optic</button>
      <button type="button" id="edit-layer-light">Light</button>
    </div>

    <div class="editrow">
      <label>
        X %
        <input type="number" id="edit-x"
          min="0" max="100" step="0.5">
      </label>

      <label>
        Y %
        <input type="number" id="edit-y"
          min="0" max="100" step="0.5">
      </label>

      <label>
        Size %
        <input type="number" id="edit-width"
          min="2" max="180" step="0.5">
      </label>
    </div>

    <p class="edit-note" id="editorHelp"></p>

    <div class="editrow">
      <button type="button" id="editorReset">
        Reset this firearm
      </button>

      <button type="button" id="editorDownload">
        Download updated catalog.json
      </button>
    </div>

    <p class="edit-note" id="editorStatus">
      Edits are saved locally in this browser.
      They are not live for customers until you
      commit the downloaded catalog.
    </p>
  `;

  const toggle =
    document.createElement('button');

  toggle.id = 'editToggle';
  toggle.type = 'button';
  toggle.textContent =
    'Edit image positions';

  const tools =
    document.querySelector('.stage-tools');

  const anchor =
    tools || document.getElementById('stage');

  if (!anchor) {
    throw new Error(
      'Preview controls not found'
    );
  }

  anchor.insertAdjacentElement(
    'afterend',
    toggle
  );

  toggle.insertAdjacentElement(
    'afterend',
    panel
  );

  toggle.onclick = () => {
    editorEnabled = !editorEnabled;

    panel.hidden = !editorEnabled;

    toggle.textContent =
      editorEnabled
        ? 'Close position editor'
        : 'Edit image positions';

    $('art').classList.toggle(
      'editor-on',
      editorEnabled
    );

    updateEditorControls();
    markTarget();
  };

  for (const name of [
    'firearm',
    'optic',
    'light'
  ]) {
    $('edit-layer-' + name).onclick =
      () => {
        editorLayer = name;
        markTarget();
        updateEditorControls();
      };
  }

  for (const key of [
    'x',
    'y',
    'width'
  ]) {
    $('edit-' + key).addEventListener(
      'change',
      e => setEditorPosition(
        key,
        Number(e.target.value)
      )
    );
  }

  const original =
    JSON.parse(
      JSON.stringify(catalog.firearms)
    );

  $('editorReset').onclick = () => {
    const gun = findGun();

    const base = original.find(
      x => x.id === gun.id
    );

    for (const key of [
      'opticPosition',
      'lightPosition',
      'basePosition',
      'previewScale'
    ]) {
      if (base[key] === undefined) {
        delete gun[key];
      } else {
        gun[key] =
          JSON.parse(
            JSON.stringify(base[key])
          );
      }
    }

    savePositions();
    render();
    markTarget();
    updateEditorControls();
  };

  $('editorDownload').onclick = () => {
    const blob = new Blob(
      [JSON.stringify(catalog, null, 2) + '\n'],
      { type: 'application/json' }
    );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement('a');

    a.href = url;
    a.download = 'catalog.json';

    document.body.append(a);
    a.click();
    a.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );

    $('editorStatus').textContent =
      'Downloaded catalog.json. Replace gun-builder/catalog.json in GitHub and commit to publish.';
  };

  const art = $('art');

  art.addEventListener(
    'pointerdown',
    e => {
      if (!editorEnabled) return;

      const target =
        editorLayer === 'firearm'
          ? $('firearmImage')
          : $(editorLayer + 'Image');

      if (
        target.hidden ||
        e.target !== target
      ) {
        return;
      }

      e.preventDefault();

      const rect =
        art.getBoundingClientRect();

      editorDragging = {
        id: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top
      };

      target.setPointerCapture(
        e.pointerId
      );
    }
  );

  art.addEventListener(
    'pointermove',
    e => {
      if (
        !editorDragging ||
        e.pointerId !== editorDragging.id
      ) {
        return;
      }

      const rect =
        art.getBoundingClientRect();

      const scale = zoom || 1;

      const x =
        50 +
        (e.clientX -
          rect.left -
          rect.width / 2) /
        scale /
        rect.width *
        100;

      const y =
        50 +
        (e.clientY -
          rect.top -
          rect.height / 2) /
        scale /
        rect.height *
        100;

      setEditorPosition('x', x);
      setEditorPosition('y', y);
    }
  );

  art.addEventListener(
    'pointerup',
    () => {
      editorDragging = null;
    }
  );

  art.addEventListener(
    'pointercancel',
    () => {
      editorDragging = null;
    }
  );

  for (const id of [
    'firearm',
    'optic',
    'light'
  ]) {
    $(id).addEventListener(
      'change',
      () => {
        markTarget();
        updateEditorControls();
      }
    );
  }

  updateEditorControls();
}

function markTarget() {
  for (const name of [
    'firearm',
    'optic',
    'light'
  ]) {
    $(name + 'Image').classList.toggle(
      'editor-target',
      editorEnabled &&
      name === editorLayer
    );
  }
}

// Start the configurator only after all
// functions and editor settings exist.
init();
