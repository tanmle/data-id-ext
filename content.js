// ── Content Script ─────────────────────────────────
// Handles "Pick" mode, right-click context menu, and clipboard operations

let pickModeActive = false;
let currentAttrName = 'data-element-id';
let overlay = null;
let tooltip = null;
let lastHighlightedEl = null;
let lastRightClickedEl = null;

// ── Helpers ───────────────────────────────────────
function kebabToCamel(str) {
  return str.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toTypescriptLine(id, tag, isDuplicate, attrName) {
  const camelName = kebabToCamel(id);
  if (isDuplicate && tag) {
    const varName = camelName + capitalize(tag);
    return `private readonly ${varName} = this.page.locator('${tag}[${attrName}="${id}"]');`;
  }
  return `private readonly ${camelName} = this.page.getByTestId('${id}');`;
}

function checkIsDuplicate(id) {
  const matches = document.querySelectorAll(`[${currentAttrName}="${id}"]`);
  return matches.length > 1;
}

// ── Track right-clicked element ───────────────────
document.addEventListener('contextmenu', (e) => {
  lastRightClickedEl = e.target;
}, true);

// ── Message listener ──────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return;
  } else if (msg.type === 'START_PICK') {
    currentAttrName = msg.attrName || 'data-element-id';
    startPickMode();
    sendResponse({ ok: true });
  } else if (msg.type === 'STOP_PICK') {
    stopPickMode();
    sendResponse({ ok: true });
  } else if (msg.type === 'GET_RIGHT_CLICKED_ELEMENT') {
    const result = findMatchingElementFromTarget(lastRightClickedEl);
    if (result) {
      result.classList.add('data-id-ext-copied');
      setTimeout(() => result.classList.remove('data-id-ext-copied'), 800);
      const id = result.getAttribute(currentAttrName);
      const tag = result.tagName.toLowerCase();
      const isDuplicate = checkIsDuplicate(id);
      sendResponse({ id, tag, isDuplicate });
    } else {
      sendResponse({ id: null });
    }
  } else if (msg.type === 'COPY_TO_CLIPBOARD') {
    navigator.clipboard.writeText(msg.text).then(() => {
      showPageNotification('Copied to clipboard!');
      sendResponse({ ok: true });
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = msg.text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showPageNotification('Copied to clipboard!');
      sendResponse({ ok: true });
    });
    return true;
  } else if (msg.type === 'SHOW_NOTIFICATION') {
    showPageNotification(msg.message, msg.isError);
    sendResponse({ ok: true });
  }
});

// ── Load current attribute name from storage ──────
chrome.storage.sync.get({ attributeName: 'data-element-id' }, (data) => {
  currentAttrName = data.attributeName;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.attributeName) {
    currentAttrName = changes.attributeName.newValue;
  }
});

// ── In-page notification ──────────────────────────
function showPageNotification(message, isError = false) {
  const existing = document.querySelector('.data-id-ext-notification');
  if (existing) existing.remove();

  const notif = document.createElement('div');
  notif.className = 'data-id-ext-notification' + (isError ? ' data-id-ext-notification-error' : '');
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.classList.add('data-id-ext-notification-hide');
    setTimeout(() => notif.remove(), 300);
  }, 2000);
}

// ── Pick Mode ─────────────────────────────────────
function startPickMode() {
  if (pickModeActive) return;
  pickModeActive = true;

  overlay = document.createElement('div');
  overlay.className = 'data-id-ext-overlay';
  document.body.appendChild(overlay);

  tooltip = document.createElement('div');
  tooltip.className = 'data-id-ext-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  highlightAll();

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
}

function stopPickMode() {
  if (!pickModeActive) return;
  pickModeActive = false;

  if (overlay) { overlay.remove(); overlay = null; }
  if (tooltip) { tooltip.remove(); tooltip = null; }

  removeHighlights();
  clearHover();

  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKeyDown, true);
}

// ── Highlight all matching elements ───────────────
function highlightAll() {
  const els = document.querySelectorAll(`[${currentAttrName}]`);
  els.forEach((el) => {
    el.classList.add('data-id-ext-highlight');
  });
}

function removeHighlights() {
  document.querySelectorAll('.data-id-ext-highlight').forEach((el) => {
    el.classList.remove('data-id-ext-highlight');
  });
}

// ── Mouse interactions ────────────────────────────
function onMouseMove(e) {
  if (!pickModeActive) return;

  const target = findMatchingElementFromTarget(e.target);

  if (lastHighlightedEl && lastHighlightedEl !== target) {
    lastHighlightedEl.classList.remove('data-id-ext-hover');
  }

  if (target) {
    target.classList.add('data-id-ext-hover');
    lastHighlightedEl = target;

    const id = target.getAttribute(currentAttrName);
    const tag = target.tagName.toLowerCase();
    const isDuplicate = checkIsDuplicate(id);
    const rect = target.getBoundingClientRect();

    tooltip.innerHTML = `
      <span class="data-id-ext-tooltip-tag">&lt;${tag}&gt;</span>
      <span class="data-id-ext-tooltip-id">${id}</span>
      ${isDuplicate ? '<span class="data-id-ext-tooltip-dup">DUP</span>' : ''}
      <span class="data-id-ext-tooltip-hint">Click to copy</span>
    `;
    tooltip.style.display = 'flex';

    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.top + window.scrollY - tooltipRect.height - 8;
    let left = rect.left + window.scrollX + (rect.width - tooltipRect.width) / 2;

    if (top < window.scrollY + 4) {
      top = rect.bottom + window.scrollY + 8;
    }
    left = Math.max(4, Math.min(left, window.innerWidth - tooltipRect.width - 4));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  } else {
    if (tooltip) tooltip.style.display = 'none';
  }
}

function onClick(e) {
  if (!pickModeActive) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const target = findMatchingElementFromTarget(e.target);
  if (target) {
    const id = target.getAttribute(currentAttrName);
    const tag = target.tagName.toLowerCase();
    const isDuplicate = checkIsDuplicate(id);
    const tsLine = toTypescriptLine(id, tag, isDuplicate, currentAttrName);

    target.classList.add('data-id-ext-copied');
    setTimeout(() => target.classList.remove('data-id-ext-copied'), 800);

    navigator.clipboard.writeText(tsLine).then(() => {
      showPageNotification(`Copied: ${id}`);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = tsLine;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      showPageNotification(`Copied: ${id}`);
    });
  }

  stopPickMode();
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    stopPickMode();
    chrome.runtime.sendMessage({ type: 'PICK_CANCELLED' });
  }
}

// ── Utility ───────────────────────────────────────
function findMatchingElementFromTarget(el) {
  let current = el;
  while (current && current !== document.body && current !== document.documentElement) {
    if (current.hasAttribute && current.hasAttribute(currentAttrName)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function clearHover() {
  if (lastHighlightedEl) {
    lastHighlightedEl.classList.remove('data-id-ext-hover');
    lastHighlightedEl = null;
  }
}
