<div align="center">

# 🐋 LittleWhale 小鲸鱼助手

**Translate & interpret any selected text on the web with DeepSeek**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/github/v/release/zhaotianyi-source/littlewhale-extension)](https://github.com/zhaotianyi-source/littlewhale-extension/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/zhaotianyi-source/littlewhale-extension/ci.yml?branch=main)](https://github.com/zhaotianyi-source/littlewhale-extension/actions)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

A Chrome extension (Manifest V3) powered by the DeepSeek API. Select any text on any webpage, and a floating toolbar appears with **Translate** and **Interpret** actions — no copy-paste, no switching tabs. The little whale (DeepSeek's orca) reads it for you.

## ✨ Features

- **Select → Act**: select text with your mouse (or `Shift + Arrow keys`), a floating toolbar appears right next to the selection.
- **Translate**: outputs a polished Simplified Chinese translation of the selected text.
- **Interpret**: explains the selection — core ideas, background, key details and takeaways.
- **Configurable model**: defaults to `deepseek-v4-flash` with `reasoning_effort=max` (deepest thinking); switch model & effort anytime in the popup.
- **Private by design**: your API key is stored locally only, never exposed to web pages; optional "Safe Mode" keeps it in memory (not on disk).
- **Result panel**: scrollable, copyable, dismissible with `Esc`.

## 📸 Screenshots

_Coming soon — add your screenshots to `docs/screenshots/` and reference them here (e.g. `docs/screenshots/selection.png`, `docs/screenshots/popup.png`)._

## 📦 Installation

**Requirements**: Chrome (or Chromium-based browser) ≥ 114 (uses the Popover API and `chrome.storage.session`).

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right corner)
3. Click **Load unpacked** and select this repository folder
4. Click the extension icon in the toolbar → paste your DeepSeek API key (auto-saved) → **Test connection** → done.

> Get an API key at [platform.deepseek.com](https://platform.deepseek.com).

## 🚀 Usage

1. Open any webpage and select some text.
2. Click **翻译 / Translate** or **解读 / Interpret** on the floating toolbar.
3. Read the result in the popup panel — copy it or close with the ✕ button / `Esc`.

## ⚙️ Configuration

Open the extension popup:

| Setting | Description | Default |
|---|---|---|
| API Key | Your DeepSeek API key (`sk-...`). Auto-saved on paste. | — |
| Safe Mode | Keep the key in memory only, never written to disk (re-enter after browser restart). | off |
| Model | Any DeepSeek model id, e.g. `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-chat` | `deepseek-v4-flash` |
| Intelligence | `reasoning_effort`: `max` / `high` / `low` (v4 models keep thinking mode on) | `max` |

## 🔒 Privacy & Security

- **Storage**: the API key is stored in `chrome.storage.local` (your local Chrome profile, plaintext, never synced to any cloud account). With **Safe Mode** enabled it lives only in memory (`chrome.storage.session`) and is wiped on browser restart.
- **Network**: the key is sent **only** to `https://api.deepseek.com` as an `Authorization` header (`host_permissions` is scoped to that origin). Nothing is sent to any other site.
- **Isolation**: web pages cannot access extension storage or trigger extension requests; other extensions are isolated per extension ID. The content script never reads your key.
- **No tracking**: no analytics, no telemetry, no third-party requests of any kind.
- **Advice**: review your usage at platform.deepseek.com regularly; if you suspect a leak, revoke and rotate the key. Enable disk encryption (FileVault) to protect the at-rest profile.

## ❓ FAQ

<details>
<summary><b>Why do I get "API key not configured"?</b></summary>

Open the extension popup and paste your key — it auto-saves (you'll see `已保存 / Saved: sk-****xxxx`). Then retry.
</details>

<details>
<summary><b>How do I change the model / intelligence level?</b></summary>

Open the popup → **Model settings**: edit the model id and pick an intelligence level. Changes auto-save.
</details>

<details>
<summary><b>Selection works but no toolbar appears?</b></summary>

The content script runs in the top frame only. On pages where the text lives inside an iframe (e.g. embedded documents), the toolbar may not appear — a known limitation.
</details>

<details>
<summary><b>Is my API key sent to TapTap or other sites?</b></summary>

No. The key is only ever sent to `api.deepseek.com`.
</details>

<details>
<summary><b>Error: HTTP 401 / 429 / 400?</b></summary>

`401` — invalid or revoked key. `429` — rate limit or insufficient balance. `400 model not found` — typo in the model id. Check the popup's error message for details.
</details>

## 🛠 Development

```bash
npm install     # install dev dependencies (jsdom)
npm run check   # syntax-check all extension JS files
npm test        # run UI regression tests (jsdom)
```

The regression suite (`tests/content-ui.test.js`) simulates the selection → toolbar → result flow and guards against visibility regressions. CI runs all checks on every push and PR.

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Found a bug or have an idea? Open an [issue](https://github.com/zhaotianyi-source/littlewhale-extension/issues).

## 📄 License

[MIT](LICENSE) © [zhaotianyi-source](https://github.com/zhaotianyi-source)
