
'use strict';

// OFFROAD TACTICAL — GUN BUILDER

const $ = id => document.getElementById(id);

const money = value =>
  value == null
    ? 'Price pending'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);

const CATEGORIES = ['optic', 'light', 'stabilizer'];
const LAYERS = ['firearm', ...CATEGORIES];
const STORAGE_KEY = 'offroad-builder-positions-v1';

let catalog = null;
let zoom = 1;
let editorEnabled = false;
let editorLayer = 'optic';
let editorDragging = null;
let originalPositions = {};

const state = {
  firearm: '',
  optic: 'none',
  light: 'none',
  lightColor: 'black',
  stabilizer: 'none'
};

const findGun = () =>
  catalog?.firearms.find(x => x.id === state.firearm);

const findAccessory = id =>
  catalog?.accessories.find(x => x.id === id) || null;

function compatible(gun, item) {
  if (!gun || !item || !item.stock) return false;

  if (item.category === 'stabilizer') {
    return Boolean(
      gun.stabilizerMount &&
      Array.isArray(item.compatibleMounts) &&
      item.compatibleMounts.includes(gun.stabilizerMount)
    );
  }

  // Preserve the existing optic/light catalog behavior.
  return true;
}

function fillSelect(el, items, selected) {
  if (!el) return;

  el.replaceChildren();

  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent =
      item.name +
      (item.id === 'none'
        ? ''
        : ` · ${money(item.price)}`);

    el.append(option);
  }

  el.value = selected;
}

function setImage(el, item) {
  if (!el || !item) return;

  el.onerror = () => {
    el.onerror = null;
    el.src = item.fallbackImage || 'assets/pistol.svg';
  };

  el.src = item.image;
}

// -------------------------------------
// LIGHT COLOR VARIANTS
// -------------------------------------

function getLightVariants(light) {
  if (!light || !Array.isArray(light.colorVariants)) {
    return [];
  }

  return light.colorVariants.filter(
    variant =>
      variant &&
      variant.enabled !== false &&
      variant.id &&
      variant.image
  );
}

function selectedLightVariant() {
  const light = findAccessory(state.light);
  const variants = getLightVariants(light);

  return (
    variants.find(x => x.id === state.lightColor) ||
    variants[0] ||
    null
  );
}

function setupLightColors() {
  if ($('lightColorWrap')) return;

  const lightSelect = $('light');
  if (!lightSelect) return;

  const wrap = document.createElement('div');
  wrap.id = 'lightColorWrap';
  wrap.hidden = true;

  const label = document.createElement('label');
  label.htmlFor = 'lightColor';
  label.textContent = 'Light color';

  const select = document.createElement('select');
  select.id = 'lightColor';
  select.setAttribute('aria-label', 'Light color');

  select.addEventListener('change', () => {
    state.lightColor = select.value;
    render();
  });

  wrap.append(label, select);
  lightSelect.insertAdjacentElement('afterend', wrap);

  const style = document.createElement('style');

  style.textContent = `
    #lightColorWrap {
      margin: 12px 0;
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
      padding: 11px;
      background: #141414;
      border: 1px solid #666;
      border-radius: 6px;
      color: #eee;
      font-size: 16px;
      box-sizing: border-box;
    }
  `;

  document.head.append(style);
}

function updateLightColors() {
  const wrap = $('lightColorWrap');
  const select = $('lightColor');
  if (!wrap || !select) return;

  const light = findAccessory(state.light);
  const variants = getLightVariants(light);

  wrap.hidden = variants.length === 0;
  select.replaceChildren();

  if (!variants.length) {
    state.lightColor = 'black';
    return;
  }

  for (const variant of variants) {
    const option = document.createElement('option');
    option.value = variant.id;
    option.textContent = variant.label || variant.id;
    select.append(option);
  }

  if (!variants.some(x => x.id === state.lightColor)) {
    state.lightColor =
      variants.find(x => x.id === light.defaultColor)?.id ||
      variants[0].id;
  }

  select.value = state.lightColor;
}

// -------------------------------------
// STABILIZER CONTROLS
// -------------------------------------

function setupStabilizerControls() {
  // Works with the updated index.html, or
  // creates the controls if they are absent.

  if (!$('stabilizer')) {
    const lightSelect = $('light');
    if (!lightSelect) return;

    const wrap = document.createElement('div');
    wrap.id = 'stabilizerWrap';

    const label = document.createElement('label');
    label.htmlFor = 'stabilizer';
    label.textContent = 'Stabilizer';

    const select = document.createElement('select');
    select.id = 'stabilizer';

    wrap.append(label, select);

    const anchor = $('lightColorWrap') || lightSelect;
    anchor.insertAdjacentElement('afterend', wrap);
  }

  if (!$('stabilizerImage')) {
    const art = $('art');
    if (!art) return;

    const image = document.createElement('img');
    image.id = 'stabilizerImage';
    image.className = 'overlay';
    image.alt = 'Stabilizer';
    image.hidden = true;
    image.draggable = false;

    art.append(image);
  }

  const style = document.createElement('style');

  style.textContent = `
    #stabilizerWrap {
      margin: 12px 0;
    }

    #stabilizerWrap[hidden] {
      display: none !important;
    }

    #stabilizerWrap label {
      display: block;
      margin-bottom: 7px;
      color: #d8d8d8;
      font-size: 14px;
      font-weight: 600;
    }

    #stabilizerWrap select {
      width: 100%;
      padding: 11px;
      background: #141414;
      border: 1px solid #666;
      border-radius: 6px;
      color: #eee;
      font-size: 16px;
      box-sizing: border-box;
    }

    #stabilizerImage[hidden] {
      display: none !important;
    }
  `;

  document.head.append(style);
}

// -------------------------------------
// IMAGE POSITIONS
// -------------------------------------

function defaultPosition(category) {
  if (category === 'stabilizer') {
    return { x: 18, y: 49, width: 22 };
  }

  return { x: 50, y: 50, width: 18 };
}

function positionFor(gun, category) {
  return gun[category + 'Position'] ||
    defaultPosition(category);
}

function applyImagePosition(el, position) {
  if (!el) return;

  el.style.left = position.x + '%';
  el.style.top = position.y + '%';
  el.style.width = position.width + '%';
  el.style.transform = 'translate(-50%, -50%)';
}

// -------------------------------------
// MAIN RENDER
// -------------------------------------

function render() {
  const gun = findGun();
  if (!gun) return;

  fillSelect(
    $('firearm'),
    catalog.firearms.filter(x => x.stock),
    state.firearm
  );

  for (const category of CATEGORIES) {
    const choices = catalog.accessories.filter(
      item =>
        item.category === category &&
        item.stock &&
        compatible(gun, item)
    );

    if (category === 'optic' && gun.id === 'psa-pa15') {
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

  const stabilizerWrap = $('stabilizerWrap');
  if (stabilizerWrap) {
    stabilizerWrap.hidden = !gun.stabilizerMount;
  }

  updateLightColors();

  // Main firearm image
  const firearmImage = $('firearmImage');

  setImage(firearmImage, gun);
  firearmImage.hidden = false;
  firearmImage.alt = gun.name;

  applyImagePosition(firearmImage, {
    x: gun.basePosition?.x ?? 50,
    y: gun.basePosition?.y ?? 50,
    width: gun.previewScale || 100
  });

  // Accessory overlays
  for (const category of CATEGORIES) {
    const el = $(category + 'Image');
    if (!el) continue;

    const item = findAccessory(state[category]);

    const allowed =
      category !== 'stabilizer' ||
      compatible(gun, item);

    el.hidden =
      !item ||
      !allowed ||
      item.previewApproved === false;

    if (el.hidden) continue;

    const variant =
      category === 'light'
        ? selectedLightVariant()
        : null;

    const displayItem = variant
      ? { ...item, image: variant.image }
      : item;

    setImage(el, displayItem);

    el.alt =
      item.name +
      (variant
        ? ` (${variant.label || variant.id})`
        : '');

    applyImagePosition(
      el,
      positionFor(gun, category)
    );
  }

  const reference = $('accessoryReference');
  if (reference) reference.hidden = true;

  if ($('imageNote')) {
    $('imageNote').textContent =
      'Images are illustrative. Verify exact firearm model, mounting compatibility, and hardware before purchase.';
  }

  // Build summary
  const optic = findAccessory(state.optic);
  const light = findAccessory(state.light);
  const stabilizer = findAccessory(state.stabilizer);
  const lightVariant = selectedLightVariant();

  const lines = [
    gun,
    optic,
    light,
    stabilizer
  ].filter(Boolean);

  const buildLines = $('buildLines');
  buildLines.replaceChildren();

  for (const item of lines) {
    const row = document.createElement('div');
    row.className = 'line';

    const name = document.createElement('span');

    name.textContent =
      item.name +
      (item === light && lightVariant
        ? ` (${lightVariant.label || lightVariant.id})`
        : '');

    const price = document.createElement('span');
    price.textContent = money(item.price);

    row.append(name, price);
    buildLines.append(row);
  }

  const total = $('total');

  total.textContent =
    lines.every(x => x.price != null)
      ? money(
          lines.reduce(
            (sum, x) => sum + x.price,
            0
          )
        )
      : 'Pricing not available';

  if ($('compatibility')) {
    $('compatibility').textContent =
      'PRELIMINARY CATALOG: Accessory images are illustrative and do not establish physical compatibility. Confirm firearm model, optic footprint, rail type, mounting interface, and hardware. Stabilizer fitment and applicable legal requirements must be verified independently.';
  }

  // Update shareable URL
  const url = new URL(location.href);

  for (const key of [
    'firearm',
    'optic',
    'light',
    'stabilizer'
  ]) {
    url.searchParams.set(key, state[key]);
  }

  url.searchParams.set(
    'lightColor',
    state.lightColor
  );

  history.replaceState(null, '', url);

  if (editorEnabled) {
    updateEditorControls();
    markTarget();
  }
}

// -------------------------------------
// BUILD SUMMARY AND SHARING
// -------------------------------------

function summary() {
  const gun = findGun();
  const optic = findAccessory(state.optic);
  const light = findAccessory(state.light);
  const stabilizer = findAccessory(state.stabilizer);
  const variant = selectedLightVariant();

  return `Offroad Tactical build
Firearm: ${gun?.name || 'None'}
Optic: ${optic?.name || 'None'}
Light: ${light?.name || 'None'}${
    light && variant
      ? ` (${variant.label || variant.id})`
      : ''
  }
Stabilizer: ${stabilizer?.name || 'None'}
Estimated total: ${$('total').textContent}
Illustrative preview. Accessory fitment is not verified.
Build link: ${location.href}`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);

    if ($('message')) {
      $('message').textContent =
        'Copied to clipboard.';
    }
  } catch (error) {
    if ($('message')) {
      $('message').textContent =
        'Clipboard unavailable. Open the site over HTTPS.';
    }
  }
}

// -------------------------------------
// SAVED POSITION CALIBRATIONS
// -------------------------------------

function applySavedPositions() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '{}'
    );

    for (const gun of catalog.firearms) {
      const data = saved[gun.id];
      if (!data) continue;

      for (const key of [
        'opticPosition',
        'lightPosition',
        'stabilizerPosition',
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
  } catch (error) {
    console.warn('Could not restore calibration', error);
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
      lightPosition: gun.lightPosition,
      stabilizerPosition: gun.stabilizerPosition
    };
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data)
    );
  } catch (error) {
    console.warn('Could not save positions', error);
  }
}

// -------------------------------------
// POSITION EDITOR
// -------------------------------------

function currentEditorPosition() {
  const gun = findGun();
  if (!gun) return null;

  if (editorLayer === 'firearm') {
    return {
      x: gun.basePosition?.x ?? 50,
      y: gun.basePosition?.y ?? 50,
      width: gun.previewScale || 100
    };
  }

  if (
    editorLayer === 'stabilizer' &&
    !gun.stabilizerMount
  ) {
    return null;
  }

  return positionFor(gun, editorLayer);
}

function markTarget() {
  for (const name of LAYERS) {
    const image = $(
      name === 'firearm'
        ? 'firearmImage'
        : name + 'Image'
    );

    if (!image) continue;

    image.classList.toggle(
      'editor-target',
      editorEnabled &&
      name === editorLayer &&
      !image.hidden
    );
  }
}

function updateEditorControls() {
  const gun = findGun();
  if (!gun) return;

  const position = currentEditorPosition();

  for (const name of LAYERS) {
    const button = $('edit-layer-' + name);
    if (!button) continue;

    button.classList.toggle(
      'active',
      name === editorLayer
    );

    if (name === 'stabilizer') {
      button.disabled = !gun.stabilizerMount;
    }
  }

  if (!position) {
    if ($('editorHelp')) {
      $('editorHelp').textContent =
        'This layer is unavailable for the selected firearm.';
    }
    return;
  }

  for (const key of ['x', 'y', 'width']) {
    const input = $('edit-' + key);
    if (input) {
      input.value = Number(position[key]).toFixed(1);
    }
  }

  const image = $(
    editorLayer === 'firearm'
      ? 'firearmImage'
      : editorLayer + 'Image'
  );

  if ($('editorHelp')) {
    $('editorHelp').textContent =
      !image || image.hidden
        ? 'Select an accessory first to adjust its position.'
        : 'Drag the image or adjust X, Y, and Size.';
  }
}

function setEditorPosition(key, value) {
  const gun = findGun();

  if (!gun || !Number.isFinite(value)) return;

  if (
    editorLayer === 'stabilizer' &&
    !gun.stabilizerMount
  ) {
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
      gun.basePosition ??= { x: 50, y: 50 };
      gun.basePosition[key] = value;
    }
  } else {
    const positionKey = editorLayer + 'Position';

    gun[positionKey] ??=
      defaultPosition(editorLayer);

    gun[positionKey][key] = value;
  }

  savePositions();
  render();
  updateEditorControls();
}

function downloadCatalog() {
  const blob = new Blob(
    [JSON.stringify(catalog, null, 2) + '\n'],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'catalog.json';

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

  if ($('editorStatus')) {
    $('editorStatus').textContent =
      'Downloaded catalog.json. Replace the existing GitHub catalog.json and commit to publish your positions.';
  }
}

function setupPositionEditor() {
  const style = document.createElement('style');

  style.textContent = `
    #editorPanel {
      margin-top: 15px;
      padding: 14px;
      border: 1px solid #566167;
      border-radius: 9px;
      background: #151b1e;
      color: #f5f5f5;
    }

    #editorPanel[hidden] {
      display: none !important;
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

    #editorPanel button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
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

  document.head.append(style);

  const panel = document.createElement('div');
  panel.id = 'editorPanel';
  panel.hidden = true;

  panel.innerHTML = `
    <strong>POSITION EDITOR</strong>

    <p class="edit-note">
      Adjust images separately for each firearm.
      Changes are saved in this browser until
      you download and publish the catalog.
    </p>

    <div class="editrow">
      <button type="button" id="edit-layer-firearm">Firearm</button>
      <button type="button" id="edit-layer-optic">Optic</button>
      <button type="button" id="edit-layer-light">Light</button>
      <button type="button" id="edit-layer-stabilizer">Stabilizer</button>
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
      Browser edits are local until the
      updated catalog is committed to GitHub.
    </p>
  `;

  const toggle = document.createElement('button');
  toggle.id = 'editToggle';
  toggle.type = 'button';
  toggle.textContent = 'Edit image positions';

  const anchor =
    document.querySelector('.stage-tools') ||
    $('stage');

  if (!anchor) {
    throw new Error('Preview controls not found');
  }

  anchor.insertAdjacentElement('afterend', toggle);
  toggle.insertAdjacentElement('afterend', panel);

  toggle.onclick = () => {
    editorEnabled = !editorEnabled;

    panel.hidden = !editorEnabled;

    toggle.textContent = editorEnabled
      ? 'Close position editor'
      : 'Edit image positions';

    $('art').classList.toggle(
      'editor-on',
      editorEnabled
    );

    updateEditorControls();
    markTarget();
  };

  for (const name of LAYERS) {
    const button = $('edit-layer-' + name);

    button.onclick = () => {
      editorLayer = name;
      updateEditorControls();
      markTarget();
    };
  }

  for (const key of ['x', 'y', 'width']) {
    $('edit-' + key).addEventListener(
      'change',
      event => {
        setEditorPosition(
          key,
          Number(event.target.value)
        );
      }
    );
  }

  $('editorReset').onclick = () => {
    const gun = findGun();
    const base = originalPositions[gun.id];

    if (!base) return;

    for (const key of [
      'opticPosition',
      'lightPosition',
      'stabilizerPosition',
      'basePosition',
      'previewScale'
    ]) {
      if (base[key] === undefined) {
        delete gun[key];
      } else {
        gun[key] = JSON.parse(
          JSON.stringify(base[key])
        );
      }
    }

    savePositions();
    render();
    markTarget();
    updateEditorControls();
  };

  $('editorDownload').onclick = downloadCatalog;

  const art = $('art');

  art.addEventListener('pointerdown', event => {
    if (!editorEnabled) return;

    const target = $(
      editorLayer === 'firearm'
        ? 'firearmImage'
        : editorLayer + 'Image'
    );

    if (
      !target ||
      target.hidden ||
      event.target !== target
    ) {
      return;
    }

    event.preventDefault();

    editorDragging = {
      id: event.pointerId,
      target
    };

    target.setPointerCapture(event.pointerId);
  });

  art.addEventListener('pointermove', event => {
    if (
      !editorDragging ||
      event.pointerId !== editorDragging.id
    ) {
      return;
    }

    const rect = art.getBoundingClientRect();
    const scale = zoom || 1;

    const x =
      50 +
      ((event.clientX - rect.left - rect.width / 2) /
        scale / rect.width) * 100;

    const y =
      50 +
      ((event.clientY - rect.top - rect.height / 2) /
        scale / rect.height) * 100;

    setEditorPosition('x', x);
    setEditorPosition('y', y);
  });

  const stopDragging = () => {
    editorDragging = null;
  };

  art.addEventListener('pointerup', stopDragging);
  art.addEventListener('pointercancel', stopDragging);
  art.addEventListener('lostpointercapture', stopDragging);

  for (const id of [
    'firearm',
    'optic',
    'light',
    'stabilizer'
  ]) {
    $(id)?.addEventListener('change', () => {
      updateEditorControls();
      markTarget();
    });
  }

  updateEditorControls();
}

// -------------------------------------
// INITIALIZATION
// -------------------------------------

async function init() {
  try {
    const response = await fetch(
      'catalog.json',
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('Catalog not found');
    }

    catalog = await response.json();

    // Save the published starting positions
    // before loading browser-specific edits.
    for (const gun of catalog.firearms) {
      originalPositions[gun.id] =
        JSON.parse(JSON.stringify(gun));
    }

    applySavedPositions();

    // Optional Square catalog additions
    try {
      const response = await fetch(
        'square-products.json',
        { cache: 'no-store' }
      );

      if (response.ok) {
        const square = await response.json();

        const ids = new Set(
          catalog.accessories.map(x => x.id)
        );

        for (const item of square.accessories || []) {
          if (!ids.has(item.id)) {
            catalog.accessories.push(item);
            ids.add(item.id);
          }
        }
      }
    } catch (error) {
      console.warn(
        'Square sync unavailable; using base catalog',
        error
      );
    }

    setupLightColors();
    setupStabilizerControls();

    const params = new URLSearchParams(location.search);
    const guns = catalog.firearms.filter(x => x.stock);

    if (!guns.length) {
      throw new Error('No available firearms');
    }

    state.firearm =
      guns.some(x => x.id === params.get('firearm'))
        ? params.get('firearm')
        : (
            guns.find(x => x.id === 'psa-pa15') ||
            guns[0]
          ).id;

    for (const category of CATEGORIES) {
      state[category] = params.get(category) || 'none';
    }

    state.lightColor =
      params.get('lightColor') || 'black';

    $('firearm').addEventListener('change', event => {
      state.firearm = event.target.value;
      render();
    });

    for (const category of CATEGORIES) {
      $(category).addEventListener('change', event => {
        state[category] = event.target.value;

        if (category === 'light') {
          state.lightColor = 'black';
        }

        render();
      });
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

    $('copyBuild').onclick = () => copy(summary());
    $('shareBuild').onclick = () => copy(location.href);

    if ($('year')) {
      $('year').textContent =
        new Date().getFullYear();
    }

    render();
    setupPositionEditor();

  } catch (error) {
    console.error('Gun Builder initialization failed', error);

    if ($('compatibility')) {
      $('compatibility').textContent =
        'Could not load Gun Builder: ' +
        error.message +
        '. Check catalog.json and your GitHub Pages files.';
    }
  }
}

init();
