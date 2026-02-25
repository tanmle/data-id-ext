# Data ID Extractor

A Chrome extension that extracts `data-element-id` attributes from web elements and copies them as **TypeScript Playwright page object properties** — ready to paste into your test code.

## ✨ Features

### 🔍 Scan Page
Scans the current page for all elements with the configured data attribute. Results appear in a searchable, checkable list.

- **Checkboxes** — Select/deselect individual elements; "All" toggle for batch control
- **Search filter** — Filter results by ID or tag name
- **Click to copy** — Click any element row to copy its TypeScript property
- **Copy All** — Copy all checked elements at once

### 🖱️ Pick Mode
Click **Pick** in the popup to enter an interactive selection mode directly on the page:

- All matching elements get **highlighted** with dashed outlines
- **Hover** to see a tooltip with the element tag and ID
- **Click** any highlighted element to copy its TypeScript property to clipboard
- Press **Escape** to cancel
- The popup **auto-closes** so you can interact with the page freely

### 📋 Right-Click Context Menu
Right-click any element on the page and select **"Copy as TypeScript property"** from the context menu. Works without opening the popup — fastest for one-off copies.

### 🔁 Duplicate ID Detection
When the same `data-element-id` appears on multiple elements (e.g., a wrapper `<div>` and an `<input>` inside it), the extension automatically:

- Shows an orange **DUP** badge next to duplicate IDs
- Generates a **CSS selector locator** instead of `getByTestId` for disambiguation
- Appends the **tag name** to the variable name

| Scenario | Output |
|---|---|
| Unique ID | `private readonly loginButton = this.page.getByTestId('login-button');` |
| Duplicate on `<input>` | `private readonly loginButtonInput = this.page.locator('input[data-element-id="login-button"]');` |
| Duplicate on `<div>` | `private readonly loginButtonDiv = this.page.locator('div[data-element-id="login-button"]');` |

### ⚙️ Settings

- **Attribute Name** — Configurable data attribute to scan for (default: `data-element-id`)
- **Element Types** — Filter which HTML element types to include in scans (default: `input`, `button`). Leave empty to scan all types.

## 📦 Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Generate the extension icons:
   ```bash
   node generate-icons.js
   ```
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable **Developer mode** (toggle in top-right)
5. Click **Load unpacked** and select the `data-id-ext` folder
6. The extension icon appears in your toolbar — pin it for easy access

### Packing as .crx

1. Go to `chrome://extensions/`
2. Click **Pack extension**
3. Set the **Extension root directory** to the `data-id-ext` folder
4. If re-packing, provide the existing `.pem` private key file
5. Click **Pack Extension** — produces a `.crx` file for distribution

## 🏗️ Project Structure

```
data-id-ext/
├── manifest.json        # Extension manifest (Manifest V3)
├── background.js        # Service worker — context menu + defaults
├── content.js           # Injected into pages — pick mode, right-click, clipboard
├── content.css          # In-page styles — highlights, tooltips, notifications
├── popup.html           # Popup UI structure
├── popup.js             # Popup logic — scan, copy, settings, checkboxes
├── popup.css            # Popup styles — dark theme, animations
├── generate-icons.js    # Node.js script to generate PNG icons
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🔑 Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab to scan elements |
| `storage` | Persist settings (attribute name, element types) |
| `scripting` | Inject content script on-demand for Pick mode |
| `contextMenus` | "Copy as TypeScript property" right-click option |

## 🛠️ Technical Details

- **Manifest V3** — Uses service worker architecture
- **No dependencies** — Pure vanilla JS, no build step required
- **Dark theme** — Premium UI with smooth animations and glassmorphism
- **Clipboard** — Uses `navigator.clipboard.writeText()` with `document.execCommand('copy')` fallback
- **CSP compliant** — No inline scripts or event handlers; all listeners attached via `addEventListener`

## 📝 Usage Examples

### Typical Workflow

1. Open the page you're writing tests for
2. Click the extension icon → **Scan Page**
3. Review the list, uncheck any elements you don't need
4. Click **Copy All** → paste into your page object class

### Quick Single Element

- **Right-click** the element → "Copy as TypeScript property" → paste
- Or use **Pick** mode for visual selection

### Custom Attribute

If your app uses `data-testid` instead of `data-element-id`:

1. Click ⚙️ in the popup
2. Change the attribute name to `data-testid`
3. Click **Save**

## 📄 License

MIT
