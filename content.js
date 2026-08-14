// 小鲸鱼助手 LittleWhale —— Content Script
// 功能：选中网页文本后，在选区旁浮出「翻译 / 解读」工具栏；点击后调用
// background（DeepSeek API），在浮窗中展示结果，支持复制与关闭。

(() => {
  if (window.__dshSelectionUI__) return;
  window.__dshSelectionUI__ = true;

  const UI_PREFIX = 'dsh-ui'; // 与 content.css 中的类名前缀对应

  let toolbar = null;
  let isRequesting = false;
  let lastSelection = null; // { text, rect }：工具栏弹出时缓存
  let requestSeq = 0; // 请求代次：取消/新请求时递增，丢弃过期响应
  let activeRequestId = ''; // 与 background AbortController 对应
  let uiInTopLayer = false; // 容器 popover 是否处于浏览器 top layer
  // popover API 需要 Chrome 114+；旧版本降级为普通 z-index 方案
  const hasPopover =
    typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

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
  // 容器使用手动 popover（popover="manual" + showPopover()）进入浏览器 top layer：
  // 实测 Chrome 中 popover 可以压过页面自身模态框（非模态 <dialog> 反而压不过）。
  // popover 无遮罩、不劫持焦点、不拦截外部交互；manual 模式不受 Esc/点击空白影响。
  // 显隐仍由内部元素的 hidden 属性控制，popover 的显示/隐藏仅作「顶层开关」。
  function ensureToolbar() {
    if (toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.className = UI_PREFIX;
    toolbar.setAttribute('popover', 'manual');
    toolbar.innerHTML = `
      <div class="${UI_PREFIX}-toolbar" hidden>
        <span class="${UI_PREFIX}-toolbar-brand">
          <span class="${UI_PREFIX}-toolbar-brand-mark">DS</span>
          DeepSeek
        </span>
        <span class="${UI_PREFIX}-toolbar-sep" aria-hidden="true"></span>
        <button class="${UI_PREFIX}-btn ${UI_PREFIX}-btn-translate" data-mode="translate">翻译</button>
        <button class="${UI_PREFIX}-btn ${UI_PREFIX}-btn-interpret" data-mode="interpret">解读</button>
        <span class="${UI_PREFIX}-toolbar-sep" aria-hidden="true"></span>
        <button class="${UI_PREFIX}-btn ${UI_PREFIX}-btn-close" title="关闭" data-action="close" aria-label="关闭">×</button>
      </div>
      <div class="${UI_PREFIX}-result" hidden></div>
      <div class="${UI_PREFIX}-toast" role="status" style="display:none"></div>
    `;
    (document.body || document.documentElement).appendChild(toolbar);
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

  // 进入 top layer。若已在其中，先收起再打开，保证位于 top layer 末尾
  // （页面稍后弹出的对话框之上），两次操作同帧完成无闪烁。
  function enterTopLayer() {
    if (!toolbar || !hasPopover) return;
    if (uiInTopLayer) {
      toolbar.hidePopover();
      uiInTopLayer = false;
    }
    toolbar.showPopover();
    uiInTopLayer = true;
  }

  // 工具栏、结果卡、toast 全部隐藏时，退出 top layer
  function exitTopLayer() {
    if (!toolbar || !uiInTopLayer || !hasPopover) return;
    const bar = toolbar.querySelector(`.${UI_PREFIX}-toolbar`);
    const box = toolbar.querySelector(`.${UI_PREFIX}-result`);
    const toast = toolbar.querySelector(`.${UI_PREFIX}-toast`);
    const anyVisible =
      (bar && !bar.hidden) || (box && !box.hidden) || (toast && toast.style.display !== 'none');
    if (!anyVisible) {
      toolbar.hidePopover();
      uiInTopLayer = false;
    }
  }

  function showToolbar(rect) {
    // 结果卡片打开时不再弹出选区工具栏，避免与加载/结果叠层
    if (isResultOpen()) return;
    const bar = ensureToolbar().querySelector(`.${UI_PREFIX}-toolbar`);
    enterTopLayer();
    bar.hidden = false;
    bar.style.left = '0px';
    bar.style.top = '0px';
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = rect.left + rect.width / 2 - bw / 2;
    let y = rect.bottom + 6;
    if (y + bh > vh - 4) y = rect.top - bh - 6;
    bar.style.left = `${clamp(x, 4, Math.max(4, vw - bw - 4))}px`;
    bar.style.top = `${clamp(y, 4, Math.max(4, vh - bh - 4))}px`;
  }

  function isResultOpen() {
    if (!toolbar) return false;
    const box = toolbar.querySelector(`.${UI_PREFIX}-result`);
    return !!(box && !box.hidden);
  }

  // 仅收起选区工具栏；结果卡片不在此关闭
  function hideToolbar() {
    if (!toolbar) return;
    const bar = toolbar.querySelector(`.${UI_PREFIX}-toolbar`);
    bar.hidden = true;
    lastSelection = null;
    exitTopLayer();
  }

  // ---------- 结果浮窗 ----------
  // 稳定视口定位：优先选区下方，放不下则上方；水平居中于选区并夹紧。
  // 卡片使用 fixed，滚动后仍留在视口内可读位置（不追随文档流）。
  function placeResult(box, rect) {
    box.style.left = '0px';
    box.style.top = '0px';
    const bw = box.offsetWidth || 360;
    const bh = box.offsetHeight || 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let x;
    let y;
    if (rect && typeof rect.left === 'number') {
      x = rect.left + (rect.width || 0) / 2 - bw / 2;
      y = (rect.bottom || 0) + 12;
      if (y + bh > vh - margin) {
        y = Math.max(margin, (rect.top || 0) - bh - 12);
      }
      // 若仍溢出（卡片很高），钉在视口右侧中部，保证可读
      if (y + bh > vh - margin || y < margin) {
        x = vw - bw - margin;
        y = Math.max(margin, Math.min(vh - bh - margin, (vh - bh) / 2));
      }
    } else {
      x = vw - bw - margin;
      y = Math.max(margin, Math.min(vh - bh - margin, (vh - bh) / 2));
    }

    box.style.left = `${clamp(x, margin, Math.max(margin, vw - bw - margin))}px`;
    box.style.top = `${clamp(y, margin, Math.max(margin, vh - bh - margin))}px`;
  }

  function modeMeta(mode) {
    if (mode === 'translate') return { label: '翻译', badge: 'translate' };
    if (mode === 'interpret') return { label: '解读', badge: 'interpret' };
    return { label: mode || '', badge: '' };
  }

  function bindResultActions(box, rawText) {
    const copyBtn = box.querySelector('[data-action="copy"]');
    if (copyBtn && rawText != null) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard
          .writeText(rawText)
          .then(() => flashText(copyBtn, '已复制'))
          .catch(() => flashText(copyBtn, '复制失败'));
      });
    }
    const dismissBtn = box.querySelector('[data-action="dismiss"]');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        // 手动关闭是结果卡片唯一关闭路径
        cancelActiveRequest();
        hideResult();
      });
    }
  }

  function showResult(rect, mode, text) {
    const meta = modeMeta(mode);
    const box = ensureToolbar().querySelector(`.${UI_PREFIX}-result`);
    enterTopLayer();
    box.classList.remove('is-loading');
    box.innerHTML = `
      <div class="${UI_PREFIX}-result-head">
        <span class="${UI_PREFIX}-result-title">
          <span class="${UI_PREFIX}-badge ${UI_PREFIX}-badge-${meta.badge}">${meta.label}</span>
          结果
        </span>
        <span class="${UI_PREFIX}-result-actions">
          <button class="${UI_PREFIX}-link" data-action="copy">复制</button>
          <button class="${UI_PREFIX}-link" data-action="dismiss">关闭</button>
        </span>
      </div>
      <div class="${UI_PREFIX}-result-body ${UI_PREFIX}-md">${renderMarkdown(text)}</div>
    `;
    box.hidden = false;
    placeResult(box, rect);
    bindResultActions(box, text);
  }

  function hideResult() {
    if (!toolbar) return;
    const box = toolbar.querySelector(`.${UI_PREFIX}-result`);
    if (box) {
      box.hidden = true;
      box.classList.remove('is-loading');
      box.innerHTML = '';
    }
    isRequesting = false;
    exitTopLayer();
  }

  function flashText(el, text) {
    if (!el) return;
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
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeUrl(url) {
    const raw = String(url || '').trim();
    // 禁止空白、反斜杠、控制字符
    if (!raw || /[\s\\]/.test(raw)) return '';
    for (let i = 0; i < raw.length; i += 1) {
      const code = raw.charCodeAt(i);
      if (code < 32 || code === 127) return '';
    }
    if (!/^(https?:\/\/|mailto:)/i.test(raw)) return '';
    // 再挡一层 javascript: 等伪协议混入
    if (/^(javascript|data|vbscript):/i.test(raw)) return '';
    return raw.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E');
  }

  // 若模型把全文包进 ``` 或 ```markdown，剥掉最外层再渲染
  function unwrapOuterFence(src) {
    const t = String(src || '').trim();
    const m = t.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```$/i);
    return m ? m[1] : src;
  }

  // ---------- Markdown 渲染（零依赖，XSS 安全）----------
  function renderMarkdown(src) {
    const raw = unwrapOuterFence(String(src || '').replace(/\r\n?/g, '\n'));
    if (!raw.trim()) return '';

    // 抽出 fenced code / $$ 公式块，避免内部被二次解析
    const fences = [];
    let text = raw.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const i = fences.length;
      fences.push({ lang: String(lang || '').trim(), code: code.replace(/\n$/, '') });
      return `\n\n%%DSHFENCE${i}%%\n\n`;
    });
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, code) => {
      const i = fences.length;
      fences.push({ lang: 'math', code: String(code).trim() });
      return `\n\n%%DSHFENCE${i}%%\n\n`;
    });

    const lines = text.split('\n');
    const html = [];
    let i = 0;
    let para = [];

    const flushPara = () => {
      if (!para.length) return;
      const joined = para.join('\n').trim();
      para = [];
      if (!joined) return;
      html.push(`<p>${inlineMd(joined)}</p>`);
    };

    const isFenceToken = (line) => /^%%DSHFENCE\d+%%$/.test(line.trim());
    const fenceIndex = (line) => {
      const m = line.trim().match(/^%%DSHFENCE(\d+)%%$/);
      return m ? Number(m[1]) : -1;
    };

    // 列表：支持一层缩进嵌套
    const listItemRe = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
    const taskRe = /^\[([ xX])\]\s+(.*)$/;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        flushPara();
        i += 1;
        continue;
      }

      if (isFenceToken(trimmed)) {
        flushPara();
        const f = fences[fenceIndex(trimmed)];
        if (f) {
          const langLabel = f.lang
            ? `<div class="${UI_PREFIX}-code-lang">${escapeHtml(f.lang)}</div>`
            : '';
          html.push(
            `<pre class="${UI_PREFIX}-pre">${langLabel}<code>${escapeHtml(f.code)}</code></pre>`
          );
        }
        i += 1;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushPara();
        html.push(`<hr class="${UI_PREFIX}-hr" />`);
        i += 1;
        continue;
      }

      const hm = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (hm) {
        flushPara();
        const level = Math.min(hm[1].length, 4);
        html.push(`<h${level} class="${UI_PREFIX}-h${level}">${inlineMd(hm[2])}</h${level}>`);
        i += 1;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        flushPara();
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^>\s?/, ''));
          i += 1;
        }
        html.push(
          `<blockquote class="${UI_PREFIX}-quote">${inlineMd(quote.join('\n'))}</blockquote>`
        );
        continue;
      }

      if (listItemRe.test(line)) {
        flushPara();
        // 收集连续列表行（含缩进）
        const items = [];
        while (i < lines.length) {
          const lm = lines[i].match(listItemRe);
          if (!lm) break;
          const indent = lm[1].replace(/\t/g, '    ').length;
          const ordered = /^\d+\./.test(lm[2]);
          let body = lm[3];
          let task = null;
          const tm = body.match(taskRe);
          if (tm) {
            task = tm[1].toLowerCase() === 'x';
            body = tm[2];
          }
          items.push({ indent, ordered, body, task });
          i += 1;
        }
        html.push(renderListTree(items));
        continue;
      }

      // 简单表格
      if (
        /^\|.+\|$/.test(trimmed) &&
        i + 1 < lines.length &&
        /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[i + 1].trim())
      ) {
        flushPara();
        const splitRow = (row) =>
          row
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim());
        const header = splitRow(trimmed);
        i += 2;
        const body = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
          body.push(splitRow(lines[i].trim()));
          i += 1;
        }
        html.push(
          `<div class="${UI_PREFIX}-table-wrap"><table class="${UI_PREFIX}-table"><thead><tr>${header
            .map((c) => `<th>${inlineMd(c)}</th>`)
            .join('')}</tr></thead><tbody>${body
            .map((row) => `<tr>${row.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table></div>`
        );
        continue;
      }

      para.push(line);
      i += 1;
    }
    flushPara();
    return html.join('');
  }

  function renderListTree(items) {
    if (!items.length) return '';
    // 归一缩进到 0 / 1 两级
    const minIndent = Math.min(...items.map((it) => it.indent));
    const norm = items.map((it) => ({
      ...it,
      level: it.indent - minIndent >= 2 ? 1 : 0,
    }));

    const topOrdered = norm[0].ordered;
    const parts = [`<${topOrdered ? 'ol' : 'ul'} class="${UI_PREFIX}-list">`];
    let idx = 0;
    while (idx < norm.length) {
      const it = norm[idx];
      if (it.level === 0) {
        const taskCls =
          it.task === null || it.task === undefined
            ? ''
            : ` class="${UI_PREFIX}-task ${it.task ? 'is-checked' : ''}"`;
        const marker =
          it.task === null || it.task === undefined
            ? ''
            : `<span class="${UI_PREFIX}-task-box" aria-hidden="true"></span>`;
        // 吞掉随后的嵌套项
        const children = [];
        let j = idx + 1;
        while (j < norm.length && norm[j].level === 1) {
          children.push(norm[j]);
          j += 1;
        }
        let childHtml = '';
        if (children.length) {
          const childOrdered = children[0].ordered;
          childHtml = `<${childOrdered ? 'ol' : 'ul'} class="${UI_PREFIX}-list ${UI_PREFIX}-list-nested">${children
            .map((c) => {
              const tcls =
                c.task === null || c.task === undefined
                  ? ''
                  : ` class="${UI_PREFIX}-task ${c.task ? 'is-checked' : ''}"`;
              const tmark =
                c.task === null || c.task === undefined
                  ? ''
                  : `<span class="${UI_PREFIX}-task-box" aria-hidden="true"></span>`;
              return `<li${tcls}>${tmark}${inlineMd(c.body)}</li>`;
            })
            .join('')}</${childOrdered ? 'ol' : 'ul'}>`;
        }
        parts.push(`<li${taskCls}>${marker}${inlineMd(it.body)}${childHtml}</li>`);
        idx = j;
      } else {
        // 孤儿嵌套项当顶级
        parts.push(`<li>${inlineMd(it.body)}</li>`);
        idx += 1;
      }
    }
    parts.push(`</${topOrdered ? 'ol' : 'ul'}>`);
    return parts.join('');
  }

  function inlineMd(src) {
    let s = escapeHtml(src);

    // 行内代码占位
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, code) => {
      const i = codes.length;
      codes.push(code);
      return `%%DSHCODE${i}%%`;
    });

    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const safe = sanitizeUrl(url);
      if (!safe) return label;
      return `<a class="${UI_PREFIX}-md-a" href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // 自动链接 http(s)://...
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,:;!?)\]])/g, (_, pre, url) => {
      const safe = sanitizeUrl(url);
      if (!safe) return `${pre}${url}`;
      return `${pre}<a class="${UI_PREFIX}-md-a" href="${safe}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    // 粗体 / 粗斜体 / 斜体（* 系）；下划线斜体仅在两侧非单词字符时生效，避免 snake_case
    s = s
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, `<strong class="${UI_PREFIX}-strong"><em class="${UI_PREFIX}-em">$1</em></strong>`)
      .replace(/\*\*([^*\n]+)\*\*/g, `<strong class="${UI_PREFIX}-strong">$1</strong>`)
      .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, `$1<em class="${UI_PREFIX}-em">$2</em>`)
      .replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, `$1<em class="${UI_PREFIX}-em">$2</em>`);

    // $...$ 行内公式 → code 样式
    s = s.replace(/\$([^$\n]+)\$/g, (_, tex) => `<code class="${UI_PREFIX}-code">${tex}</code>`);

    // 还原行内代码
    s = s.replace(/%%DSHCODE(\d+)%%/g, (_, idx) => {
      return `<code class="${UI_PREFIX}-code">${codes[Number(idx)]}</code>`;
    });

    s = s.replace(/\n/g, '<br />');
    return s;
  }

  // ---------- 请求生命周期 ----------
  function cancelActiveRequest() {
    requestSeq += 1; // 使进行中的响应全部过期
    isRequesting = false;
    const id = activeRequestId;
    activeRequestId = '';
    if (id) {
      try {
        chrome.runtime.sendMessage({ type: 'deepseek-abort', requestId: id }, () => {
          void chrome.runtime.lastError; // 忽略无接收端
        });
      } catch (_) {
        /* ignore */
      }
    }
  }

  async function runMode(mode) {
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
    if (!rect) return;

    // 新请求：作废旧请求（含 abort）
    cancelActiveRequest();
    const seq = requestSeq;
    const requestId = `${Date.now()}-${seq}`;
    activeRequestId = requestId;
    isRequesting = true;

    // 加载期只保留结果卡，隐藏选区工具栏
    hideToolbar();

    const box = ensureToolbar().querySelector(`.${UI_PREFIX}-result`);
    enterTopLayer();
    const meta = modeMeta(mode);
    box.classList.add('is-loading');
    box.innerHTML = `
      <div class="${UI_PREFIX}-result-head">
        <span class="${UI_PREFIX}-result-title">
          <span class="${UI_PREFIX}-badge ${UI_PREFIX}-badge-${meta.badge}">${meta.label}</span>
        </span>
        <span class="${UI_PREFIX}-result-actions">
          <button class="${UI_PREFIX}-link" data-action="dismiss">取消</button>
        </span>
      </div>
      <div class="${UI_PREFIX}-result-body ${UI_PREFIX}-loading">
        <div class="${UI_PREFIX}-spinner" aria-hidden="true"></div>
        <div class="${UI_PREFIX}-loading-text">
          <div class="${UI_PREFIX}-loading-title">正在${meta.label}</div>
          <div class="${UI_PREFIX}-loading-sub">DeepSeek 处理中，请稍候</div>
        </div>
      </div>
    `;
    box.hidden = false;
    placeResult(box, rect);
    bindResultActions(box, null);

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'deepseek',
        mode,
        text,
        requestId,
      });
      // 过期 / 已取消：丢弃
      if (seq !== requestSeq) return;
      if (resp && resp.aborted) return;

      if (resp && resp.ok) {
        showResult(rect, mode, resp.content);
      } else {
        showError(rect, (resp && resp.error) || '未知错误');
      }
    } catch (err) {
      if (seq !== requestSeq) return;
      showError(rect, err && err.message ? err.message : String(err));
    } finally {
      if (seq === requestSeq) {
        isRequesting = false;
        if (activeRequestId === requestId) activeRequestId = '';
      }
    }
  }

  function showError(rect, message) {
    const box = ensureToolbar().querySelector(`.${UI_PREFIX}-result`);
    enterTopLayer();
    box.classList.remove('is-loading');
    box.innerHTML = `
      <div class="${UI_PREFIX}-result-head">
        <span class="${UI_PREFIX}-result-title">
          <span class="${UI_PREFIX}-badge ${UI_PREFIX}-badge-error">错误</span>
        </span>
        <span class="${UI_PREFIX}-result-actions">
          <button class="${UI_PREFIX}-link" data-action="dismiss">关闭</button>
        </span>
      </div>
      <div class="${UI_PREFIX}-result-body">
        <div class="${UI_PREFIX}-error">${escapeHtml(message)}</div>
      </div>
    `;
    box.hidden = false;
    placeResult(box, rect);
    bindResultActions(box, null);
  }

  // ---------- Toast ----------
  // Toast 也放在 dialog 容器内，同样渲染在 top layer
  function showToast(msg) {
    const el = ensureToolbar().querySelector(`.${UI_PREFIX}-toast`);
    enterTopLayer();
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.style.display = 'none';
      exitTopLayer();
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
    // 结果卡片打开期间不弹出工具栏
    if (isResultOpen()) return;
    const rect = getSelectionRect(target);
    if (!rect) return;
    lastSelection = { text, rect };
    showToolbar(rect);
  }

  document.addEventListener('mouseup', onSelectionMaybe);
  document.addEventListener('keyup', (e) => {
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Shift'
    ) {
      onSelectionMaybe(e);
    }
  });

  // 点击空白：只收起工具栏，不关结果卡
  document.addEventListener('mousedown', (e) => {
    if (!isInsideUI(e.target)) {
      hideToolbar();
    }
  });

  window.addEventListener(
    'scroll',
    (e) => {
      if (isInsideUI(e.target)) return;
      if (toolbar) hideToolbar();
    },
    true
  );

  // Esc：有结果卡时只收工具栏；无结果时无额外动作（结果仅手动关）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideToolbar();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideToolbar();
  });

  window.addEventListener('beforeunload', () => {
    cancelActiveRequest();
    if (toolbar && toolbar.parentNode) toolbar.remove();
  });
})();
