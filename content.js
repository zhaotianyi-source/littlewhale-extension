// 小鲸鱼助手 LittleWhale —— Content Script
// 功能：选中网页文本后，在选区旁浮出「翻译 / 解读」工具栏；点击后调用
// background（DeepSeek API），在浮窗中展示结果，支持复制与关闭。

(() => {
  if (window.__dshSelectionUI__) return;
  window.__dshSelectionUI__ = true;

  const UI_PREFIX = 'dsh-ui'; // 与 content.css 中的类名前缀对应

  let toolbar = null;
  let activeMode = '';
  let isRequesting = false;
  let lastSelection = null; // { text, rect }：工具栏弹出时缓存，点击按钮后选区可能已被清除

  // ---------- 工具函数 ----------
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function getSelectedText(target) {
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (typeof target.selectionStart === 'number') {
          return target.value.slice(target.selectionStart, target.selectionEnd).trim();
        }
      }
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    return sel.toString().trim();
  }

  function getSelectionRect(target) {
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const r = target.getBoundingClientRect();
        return r && (r.width || r.height) ? r : null;
      }
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      return r && (r.width || r.height) ? r : null;
    } catch (_) {
      return null;
    }
  }

  function isInsideUI(el) {
    return !!(el && el.closest && el.closest(`.${UI_PREFIX}`));
  }

  // ---------- 工具栏 ----------
  function ensureToolbar() {
    if (toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.className = UI_PREFIX;
    toolbar.innerHTML = `
      <div class="${UI_PREFIX}-toolbar" hidden>
        <span class="${UI_PREFIX}-toolbar-title">DeepSeek</span>
        <button class="${UI_PREFIX}-btn ${UI_PREFIX}-btn-translate" data-mode="translate">翻译</button>
        <button class="${UI_PREFIX}-btn ${UI_PREFIX}-btn-interpret" data-mode="interpret">解读</button>
        <button class="${UI_PREFIX}-btn ${UI_PREFIX}-btn-close" title="关闭" data-action="close">×</button>
      </div>
      <div class="${UI_PREFIX}-result" hidden></div>
    `;
    document.documentElement.appendChild(toolbar);
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode) {
        runMode(mode);
      } else if (btn.dataset.action === 'close') {
        hideToolbar();
      }
    });
    return toolbar;
  }

  function showToolbar(rect) {
    const bar = ensureToolbar().querySelector(`.${UI_PREFIX}-toolbar`);
    bar.hidden = false;
    bar.style.left = '0px';
    bar.style.top = '0px';
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = rect.left + rect.width / 2 - bw / 2;
    let y = rect.bottom + 6;
    if (y + bh > vh - 4) y = rect.top - bh - 6; // 下方放不下就放上方
    bar.style.left = `${clamp(x, 4, Math.max(4, vw - bw - 4))}px`;
    bar.style.top = `${clamp(y, 4, Math.max(4, vh - bh - 4))}px`;
  }

  function hideToolbar() {
    if (!toolbar) return;
    const bar = toolbar.querySelector(`.${UI_PREFIX}-toolbar`);
    bar.hidden = true;
    lastSelection = null;
    hideResult();
  }

  // ---------- 结果浮窗 ----------
  function showResult(rect, mode, text) {
    activeMode = mode === 'translate' ? '翻译' : '解读';
    const box = ensureToolbar().querySelector(`.${UI_PREFIX}-result`);
    box.innerHTML = `
      <div class="${UI_PREFIX}-result-head">
        <span class="${UI_PREFIX}-result-title">${activeMode}结果</span>
        <span class="${UI_PREFIX}-result-actions">
          <button class="${UI_PREFIX}-link" data-action="copy">复制</button>
          <button class="${UI_PREFIX}-link" data-action="dismiss">关闭</button>
        </span>
      </div>
      <div class="${UI_PREFIX}-result-body">${escapeHtml(text)}</div>
    `;
    box.hidden = false;
    box.style.left = '0px';
    box.style.top = '0px';

    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = rect.left + rect.width / 2 - bw / 2;
    let y = rect.bottom + 44; // 放在工具栏下方
    if (y + bh > vh - 4) y = Math.max(4, rect.top - bh - 8); // 下方放不下就放选区上方
    box.style.left = `${clamp(x, 4, Math.max(4, vw - bw - 4))}px`;
    box.style.top = `${clamp(y, 4, Math.max(4, vh - bh - 4))}px`;

    box.querySelector('[data-action="copy"]').addEventListener('click', () => {
      navigator.clipboard
        .writeText(text)
        .then(() => flashText(box.querySelector('[data-action="copy"]'), '已复制 ✓'))
        .catch(() => flashText(box.querySelector('[data-action="copy"]'), '复制失败'));
    });
    box.querySelector('[data-action="dismiss"]').addEventListener('click', hideResult);
  }

  function hideResult() {
    if (!toolbar) return;
    const box = toolbar.querySelector(`.${UI_PREFIX}-result`);
    if (box) {
      box.hidden = true;
      box.innerHTML = '';
    }
    isRequesting = false;
  }

  function flashText(el, text) {
    const old = el.textContent;
    el.textContent = text;
    setTimeout(() => {
      el.textContent = old;
    }, 1200);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- 发起请求 ----------
  async function runMode(mode) {
    // 优先使用缓存选区（点击按钮时页面可能已清除选区）
    let text = lastSelection ? lastSelection.text : '';
    let rect = lastSelection ? lastSelection.rect : null;
    if (!text) {
      const target = document.activeElement;
      text = getSelectedText(target);
      rect = rect || getSelectionRect(target);
    }
    if (!text) {
      showToast('未选中任何文本');
      return;
    }
    if (isRequesting) return;
    if (!rect) return;

    isRequesting = true;
    const box = ensureToolbar().querySelector(`.${UI_PREFIX}-result`);
    const modeName = mode === 'translate' ? '翻译' : '解读';
    box.innerHTML = `
      <div class="${UI_PREFIX}-result-head">
        <span class="${UI_PREFIX}-result-title">${modeName}中…</span>
      </div>
      <div class="${UI_PREFIX}-result-body ${UI_PREFIX}-loading">
        <div class="${UI_PREFIX}-spinner"></div>
        <span>DeepSeek 正在${modeName}，请稍候…</span>
      </div>
    `;
    box.hidden = false;
    box.style.left = `${clamp(rect.left, 4, Math.max(4, window.innerWidth - 360))}px`;
    box.style.top = `${clamp(rect.bottom + 44, 4, Math.max(4, window.innerHeight - 120))}px`;

    try {
      const resp = await chrome.runtime.sendMessage({ type: 'deepseek', mode, text });
      if (resp && resp.ok) {
        showResult(rect, mode, resp.content);
      } else {
        showError(rect, (resp && resp.error) || '未知错误');
      }
    } catch (err) {
      showError(rect, err && err.message ? err.message : String(err));
    }
    isRequesting = false;
  }

  function showError(rect, message) {
    const box = ensureToolbar().querySelector(`.${UI_PREFIX}-result`);
    box.innerHTML = `
      <div class="${UI_PREFIX}-result-head">
        <span class="${UI_PREFIX}-result-title">出错了</span>
        <span class="${UI_PREFIX}-result-actions">
          <button class="${UI_PREFIX}-link" data-action="dismiss">关闭</button>
        </span>
      </div>
      <div class="${UI_PREFIX}-result-body ${UI_PREFIX}-error">${escapeHtml(message)}</div>
    `;
    box.hidden = false;
    box.style.left = `${clamp(rect.left, 4, Math.max(4, window.innerWidth - 360))}px`;
    box.style.top = `${clamp(rect.bottom + 44, 4, Math.max(4, window.innerHeight - 120))}px`;
    box.querySelector('[data-action="dismiss"]').addEventListener('click', hideResult);
  }

  // ---------- 简易 toast ----------
  let toastEl = null;
  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = `${UI_PREFIX}-toast`;
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toastEl.style.display = 'none';
    }, 1800);
  }

  // ---------- 事件绑定 ----------
  function onSelectionMaybe(event) {
    const target = event && event.target;
    if (isInsideUI(target)) return;

    const text = getSelectedText(target);
    if (!text) {
      hideToolbar();
      return;
    }
    const rect = getSelectionRect(target);
    if (!rect) return;
    lastSelection = { text, rect };
    showToolbar(rect);
  }

  document.addEventListener('mouseup', onSelectionMaybe);
  document.addEventListener('keyup', (e) => {
    // 支持键盘 Shift+方向键 选择后弹出
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Shift') {
      onSelectionMaybe(e);
    }
  });

  // 点击页面其它位置 / 滚动 / Esc 时收起
  document.addEventListener('mousedown', (e) => {
    if (!isInsideUI(e.target)) {
      hideToolbar();
    }
  });
  window.addEventListener('scroll', (e) => {
    if (isInsideUI(e.target)) return; // 滚动结果浮窗内容时不收起
    if (toolbar) hideToolbar();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideToolbar();
  });

  // 页面可见性变化时收起（避免残留）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideToolbar();
  });

  // 页面刷新/跳转前清理
  window.addEventListener('beforeunload', () => {
    if (toolbar && toolbar.parentNode) toolbar.remove();
  });
})();
