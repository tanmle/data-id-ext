// ── Helpers ───────────────────────────────────────
function kebabToCamel(str) {
  return str.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Global attrName cached for use in toTypescriptLine
let cachedAttrName = 'data-element-id';

function toTypescriptLine(id, tag, isDuplicate) {
  const camelName = kebabToCamel(id);
  if (isDuplicate && tag) {
    const varName = camelName + capitalize(tag);
    return `private readonly ${varName} = this.page.locator('${tag}[${cachedAttrName}="${id}"]');`;
  }
  return `private readonly ${camelName} = this.page.getByTestId('${id}');`;
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  toast.classList.remove('hidden', 'error');
  if (isError) toast.classList.add('error');
  toastMsg.textContent = message;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { attributeName: 'data-element-id', elementTypes: ['input', 'button'] },
      (data) => resolve(data)
    );
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── State ─────────────────────────────────────────
let elements = [];        // [{id, tag, text, type, isDuplicate}, ...]
let elementTypes = ['input', 'button'];
let checkedIds = new Set();
let duplicateIds = new Set(); // IDs that appear more than once

// ── DOM refs ──────────────────────────────────────
const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const attributeInput = document.getElementById('attribute-name');
const btnSaveSettings = document.getElementById('btn-save-settings');
const typeChips = document.getElementById('type-chips');
const typeInput = document.getElementById('type-input');
const btnAddType = document.getElementById('btn-add-type');
const btnScan = document.getElementById('btn-scan');
const btnCopyAll = document.getElementById('btn-copy-all');
const btnPick = document.getElementById('btn-pick');
const searchBar = document.getElementById('search-bar');
const searchInput = document.getElementById('search-input');
const elementCount = document.getElementById('element-count');
const elementList = document.getElementById('element-list');
const checkAllBox = document.getElementById('check-all');

// ── Init ──────────────────────────────────────────
(async function init() {
  const settings = await getSettings();
  cachedAttrName = settings.attributeName;
  attributeInput.value = settings.attributeName;
  attributeInput.placeholder = settings.attributeName;
  elementTypes = settings.elementTypes || ['input', 'button'];
  renderTypeChips();
})();

// ── Settings ──────────────────────────────────────
btnSettings.addEventListener('click', () => {
  const isHidden = settingsPanel.classList.contains('hidden');
  settingsPanel.classList.toggle('hidden');
  btnSettings.classList.toggle('active', isHidden);
});

btnSaveSettings.addEventListener('click', async () => {
  const value = attributeInput.value.trim();
  if (!value) {
    showToast('Attribute name cannot be empty', true);
    return;
  }
  cachedAttrName = value;
  chrome.storage.sync.set({ attributeName: value, elementTypes }, () => {
    showToast(`Settings saved`);
    settingsPanel.classList.add('hidden');
    btnSettings.classList.remove('active');
    elements = [];
    checkedIds.clear();
    duplicateIds.clear();
    renderElements();
  });
});

// ── Element Type Chips ────────────────────────────
function renderTypeChips() {
  typeChips.innerHTML = elementTypes
    .map(
      (type) => `
      <span class="type-chip" data-type="${type}">
        ${type}
        <button class="type-chip-remove" data-type="${type}" title="Remove ${type}">×</button>
      </span>`
    )
    .join('');

  typeChips.querySelectorAll('.type-chip-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = btn.dataset.type;
      elementTypes = elementTypes.filter((t) => t !== type);
      renderTypeChips();
      saveElementTypes();
    });
  });
}

function saveElementTypes() {
  chrome.storage.sync.set({ elementTypes });
}

btnAddType.addEventListener('click', addType);
typeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addType();
});

function addType() {
  const value = typeInput.value.trim().toLowerCase();
  if (!value) return;
  if (elementTypes.includes(value)) {
    showToast(`"${value}" already added`, true);
    return;
  }
  elementTypes.push(value);
  typeInput.value = '';
  renderTypeChips();
  saveElementTypes();
  showToast(`Added: ${value}`);
}

// ── Scan ──────────────────────────────────────────
btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  btnScan.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    Scanning...`;

  try {
    const tab = await getActiveTab();
    const settings = await getSettings();
    cachedAttrName = settings.attributeName;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanPage,
      args: [settings.attributeName, settings.elementTypes],
    });

    elements = results[0]?.result || [];

    // Detect duplicate IDs
    duplicateIds.clear();
    const idCount = {};
    elements.forEach((el) => {
      idCount[el.id] = (idCount[el.id] || 0) + 1;
    });
    Object.entries(idCount).forEach(([id, count]) => {
      if (count > 1) duplicateIds.add(id);
    });

    // Mark each element
    elements.forEach((el) => {
      el.isDuplicate = duplicateIds.has(el.id);
    });

    // Check all by default
    checkedIds.clear();
    elements.forEach((el, i) => checkedIds.add(i)); // use index as key since IDs can duplicate
    checkAllBox.checked = true;

    renderElements();

    const dupCount = duplicateIds.size;
    if (elements.length === 0) {
      showToast('No elements found', true);
    } else if (dupCount > 0) {
      showToast(`Found ${elements.length} element(s), ${dupCount} duplicate ID(s)`);
    } else {
      showToast(`Found ${elements.length} element(s)`);
    }
  } catch (err) {
    showToast('Cannot scan this page', true);
    console.error(err);
  }

  btnScan.disabled = false;
  btnScan.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    Scan Page`;
});

// This function runs in the PAGE context
function scanPage(attrName, allowedTypes) {
  const els = document.querySelectorAll(`[${attrName}]`);
  const results = [];
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(tag)) {
      continue;
    }
    results.push({
      id: el.getAttribute(attrName),
      tag: tag,
      text: (el.textContent || '').trim().slice(0, 60),
      type: el.getAttribute('type') || '',
    });
  }
  return results;
}

// ── Check All / Uncheck All ───────────────────────
checkAllBox.addEventListener('change', () => {
  const filtered = getFilteredElements();
  if (checkAllBox.checked) {
    filtered.forEach((el) => checkedIds.add(el._idx));
  } else {
    filtered.forEach((el) => checkedIds.delete(el._idx));
  }
  renderElements();
});

function updateCheckAllState() {
  const filtered = getFilteredElements();
  if (filtered.length === 0) {
    checkAllBox.checked = false;
    checkAllBox.indeterminate = false;
    return;
  }
  const checkedCount = filtered.filter((el) => checkedIds.has(el._idx)).length;
  checkAllBox.checked = checkedCount === filtered.length;
  checkAllBox.indeterminate = checkedCount > 0 && checkedCount < filtered.length;
}

// ── Copy All ──────────────────────────────────────
btnCopyAll.addEventListener('click', () => {
  if (elements.length === 0) return;

  const filtered = getFilteredElements().filter((el) => checkedIds.has(el._idx));
  if (filtered.length === 0) {
    showToast('No elements selected', true);
    return;
  }

  const lines = filtered.map((el) => toTypescriptLine(el.id, el.tag, el.isDuplicate));
  const text = lines.join('\n');

  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied ${filtered.length} element(s)`);
  });
});

// ── Pick Mode ─────────────────────────────────────
btnPick.addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    const settings = await getSettings();

    // Ensure content script is injected before sending the message
    await ensureContentScript(tab.id);

    await chrome.tabs.sendMessage(tab.id, {
      type: 'START_PICK',
      attrName: settings.attributeName,
    });

    window.close();
  } catch (err) {
    console.error(err);
    showToast('Cannot connect to page. Try reloading.', true);
  }
});

// Inject content script + CSS if not already present
async function ensureContentScript(tabId) {
  try {
    // Try a ping first — if content script is already loaded, it will respond
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    // Content script not loaded — inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content.css'],
    });
  }
}

// ── Search ────────────────────────────────────────
searchInput.addEventListener('input', () => {
  renderElements();
});

function getFilteredElements() {
  const query = searchInput.value.trim().toLowerCase();
  // Attach index to each element for stable checkbox tracking
  const indexed = elements.map((el, i) => ({ ...el, _idx: i }));
  if (!query) return indexed;
  return indexed.filter(
    (el) =>
      el.id.toLowerCase().includes(query) ||
      el.tag.toLowerCase().includes(query)
  );
}

// ── Render ────────────────────────────────────────
function renderElements() {
  const filtered = getFilteredElements();

  btnCopyAll.disabled = elements.length === 0;
  searchBar.classList.toggle('hidden', elements.length === 0);
  elementCount.textContent = filtered.length;
  updateCheckAllState();

  if (elements.length === 0) {
    elementList.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
        <p>Click <strong>Scan Page</strong> to find elements</p>
        <p class="hint">or right-click any element on the page</p>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    elementList.innerHTML = `
      <div class="empty-state">
        <p>No matching elements</p>
      </div>`;
    return;
  }

  elementList.innerHTML = filtered
    .map(
      (el) => `
      <div class="element-item ${checkedIds.has(el._idx) ? '' : 'unchecked'}" data-idx="${el._idx}" data-id="${el.id}" data-tag="${el.tag}" data-dup="${el.isDuplicate ? '1' : '0'}" style="animation-delay: ${el._idx * 20}ms" title="${escapeAttr(toTypescriptLine(el.id, el.tag, el.isDuplicate))}">
        <label class="element-checkbox">
          <input type="checkbox" data-idx="${el._idx}" ${checkedIds.has(el._idx) ? 'checked' : ''}>
        </label>
        <span class="element-tag">${el.tag}${el.type ? `·${el.type}` : ''}</span>
        <div class="element-info">
          <div class="element-id">${el.id}${el.isDuplicate ? ' <span class="dup-badge">DUP</span>' : ''}</div>
          ${el.text ? `<div class="element-preview">${escapeHtml(el.text)}</div>` : ''}
        </div>
        <div class="element-copy-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </div>
      </div>`
    )
    .join('');

  // Attach checkbox handlers (stopPropagation to prevent row click)
  elementList.querySelectorAll('.element-checkbox').forEach((label) => {
    label.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  elementList.querySelectorAll('.element-checkbox input').forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.idx, 10);
      if (cb.checked) {
        checkedIds.add(idx);
      } else {
        checkedIds.delete(idx);
      }
      const row = cb.closest('.element-item');
      row.classList.toggle('unchecked', !cb.checked);
      updateCheckAllState();
    });
  });

  // Attach click handlers for individual copy
  elementList.querySelectorAll('.element-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.element-checkbox')) return;

      const id = item.dataset.id;
      const tag = item.dataset.tag;
      const isDup = item.dataset.dup === '1';
      const tsLine = toTypescriptLine(id, tag, isDup);
      navigator.clipboard.writeText(tsLine).then(() => {
        item.classList.add('copied');
        showToast(`Copied: ${id}`);
        setTimeout(() => item.classList.remove('copied'), 1500);
      });
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
