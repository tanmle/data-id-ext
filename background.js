// Background service worker
// Handles context menu + default config

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
    // Append tag suffix to variable name for disambiguation
    const varName = camelName + capitalize(tag);
    return `private readonly ${varName} = this.page.locator('${tag}[${attrName}="${id}"]');`;
  }
  return `private readonly ${camelName} = this.page.getByTestId('${id}');`;
}

// ── Install ───────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    { attributeName: 'data-element-id', elementTypes: ['input', 'button'] },
    (data) => {
      chrome.storage.sync.set({
        attributeName: data.attributeName || 'data-element-id',
        elementTypes: data.elementTypes || ['input', 'button'],
      });
    }
  );

  chrome.contextMenus.create({
    id: 'copy-data-id',
    title: 'Copy as TypeScript property',
    contexts: ['all'],
  });
});

// ── Context Menu Click ────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'copy-data-id') return;
  if (!tab?.id) return;

  try {
    const settings = await chrome.storage.sync.get({ attributeName: 'data-element-id' });
    const attrName = settings.attributeName;

    // Ask the content script to get the right-clicked element's info
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_RIGHT_CLICKED_ELEMENT',
    });

    if (response && response.id) {
      const tsLine = toTypescriptLine(response.id, response.tag, response.isDuplicate, attrName);

      await chrome.tabs.sendMessage(tab.id, {
        type: 'COPY_TO_CLIPBOARD',
        text: tsLine,
      });
    } else {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_NOTIFICATION',
        message: 'No data attribute found on this element',
        isError: true,
      });
    }
  } catch (err) {
    console.error('Context menu handler error:', err);
  }
});
