// 小鲸鱼助手 LittleWhale —— content.js 回归测试（jsdom）
// 覆盖：工具栏显隐、结果卡粘性关闭、Markdown 渲染、请求竞态/取消丢弃、链接消毒。
// 运行：npm test
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'content.js');
const CSS = fs.readFileSync(path.join(ROOT, 'content.css'), 'utf8');
const code = fs.readFileSync(SRC, 'utf8');

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

function setup(sendMessageImpl) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>
       <p id="p">Hello world this is a test paragraph.</p>
       <div id="outside">outside area</div>
     </body></html>`,
    { url: 'https://example.com/', runScripts: 'outside-only' }
  );
  const { window } = dom;
  const { document } = window;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const calls = [];
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (msg, cb) => {
        calls.push(msg);
        if (typeof sendMessageImpl === 'function') {
          const ret = sendMessageImpl(msg, calls);
          if (ret && typeof ret.then === 'function') {
            if (typeof cb === 'function') {
              ret.then((v) => cb(v)).catch(() => cb && cb());
              return undefined;
            }
            return ret;
          }
          if (typeof cb === 'function') {
            cb(ret);
            return undefined;
          }
          return Promise.resolve(ret);
        }
        // 默认：deepseek 返回 Markdown；abort 空操作
        if (msg && msg.type === 'deepseek-abort') {
          if (typeof cb === 'function') cb({ ok: true, aborted: true });
          return undefined;
        }
        const payload = {
          ok: true,
          content:
            '## 核心观点\n\n这是**译文结果**，含 `code` 与列表：\n\n- 第一点\n  - 嵌套点\n- [x] 已完成任务\n\n---\n\n见 https://example.com/path 与 [文档](https://example.com/docs)。\n\n脚本探测：<script>alert(1)</script>\n坏链：[x](javascript:alert(1))',
        };
        return Promise.resolve(payload);
      },
    },
  };

  window.Range.prototype.getBoundingClientRect = function () {
    return { left: 100, top: 100, right: 300, bottom: 120, width: 200, height: 20, x: 100, y: 100 };
  };

  // 避免 clipboard 报错
  window.navigator.clipboard = {
    writeText: () => Promise.resolve(),
  };

  window.eval(code);
  return { window, document, calls };
}

const { window, document, calls } = setup();
const p = document.getElementById('p');
const sel = window.getSelection();
const toolbar = () => document.querySelector('.dsh-ui-toolbar');
const result = () => document.querySelector('.dsh-ui-result');

const range = document.createRange();
range.selectNodeContents(p);

function selectText() {
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
}

// 1. 选中 → 工具栏
selectText();
check('选中文字后工具栏出现 (hidden=false)', toolbar() && toolbar().hidden === false);

// 2. hidden 显示回归
toolbar().hidden = true;
check('工具栏 hidden=true 后 computed display=none', window.getComputedStyle(toolbar()).display === 'none');
toolbar().hidden = false;
check('工具栏 hidden=false 后 computed display=flex', window.getComputedStyle(toolbar()).display === 'flex');

// 3. 点击空白 → 工具栏消失
document.getElementById('outside').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
check('点击页面其它位置后工具栏消失 (hidden=true)', toolbar().hidden === true);

// 4. × 关闭工具栏
selectText();
toolbar().querySelector('[data-action="close"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true, cancelable: true })
);
check('点击 × 后工具栏消失 (hidden=true)', toolbar().hidden === true);

// 5. 翻译 → 结果 + Markdown
selectText();
toolbar().querySelector('[data-mode="translate"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true, cancelable: true })
);

setTimeout(() => {
  const box = result();
  const body = box && box.querySelector('.dsh-ui-result-body');

  check(
    '点击翻译后结果浮窗出现',
    box && box.hidden === false && box.textContent.includes('这是译文结果')
  );

  // 加载开始应已隐藏工具栏
  check('发起请求后选区工具栏已隐藏', toolbar().hidden === true);

  check(
    'Markdown：标题/粗体/代码/列表/嵌套/任务/分隔线/自动链接',
    !!(
      body &&
      body.classList.contains('dsh-ui-md') &&
      body.querySelector('h2.dsh-ui-h2') &&
      body.querySelector('strong.dsh-ui-strong') &&
      body.querySelector('code.dsh-ui-code') &&
      body.querySelector('ul.dsh-ui-list') &&
      body.querySelector('.dsh-ui-list-nested') &&
      body.querySelector('li.dsh-ui-task.is-checked') &&
      body.querySelector('hr.dsh-ui-hr') &&
      body.querySelector('a.dsh-ui-md-a[href="https://example.com/path"]') &&
      body.querySelector('a.dsh-ui-md-a[href="https://example.com/docs"]') &&
      !body.textContent.includes('**译文结果**')
    )
  );

  // XSS：不得出现真实 script 节点；javascript: 链接不得保留
  check('Markdown 不注入 script 节点', !body.querySelector('script'));
  check(
    'javascript: 链接被剥离',
    !body.querySelector('a[href^="javascript:"]') && body.innerHTML.includes('坏链')
  );
  check(
    '原始 HTML 尖括号被转义展示',
    body.textContent.includes('<script>alert(1)</script>') ||
      body.innerHTML.includes('&lt;script&gt;')
  );

  // 粘性关闭
  document.getElementById('outside').dispatchEvent(
    new window.MouseEvent('mousedown', { bubbles: true, cancelable: true })
  );
  check('结果打开时点击空白不关闭结果卡片', box.hidden === false);

  sel.removeAllRanges();
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  check('结果打开时清空选区不关闭结果卡片', box.hidden === false);

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('结果打开时按 Esc 不关闭结果卡片', box.hidden === false);

  // 手动关闭（结果已完成：无需 abort，仅关 UI）
  box.querySelector('[data-action="dismiss"]').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, cancelable: true })
  );
  check('点击结果浮窗关闭后消失 (hidden=true)', box.hidden === true);

  // 5d. 加载中点取消 → 应发送 deepseek-abort
  const abortCallsBefore = calls.filter((c) => c && c.type === 'deepseek-abort').length;
  let releaseSlow;
  const slowPromise = new Promise((resolve) => {
    releaseSlow = () => resolve({ ok: true, content: 'SLOW_DONE' });
  });
  // 临时替换 sendMessage：deepseek 挂起，便于点取消
  const originalSend = window.chrome.runtime.sendMessage;
  window.chrome.runtime.sendMessage = (msg, cb) => {
    calls.push(msg);
    if (msg && msg.type === 'deepseek-abort') {
      if (typeof cb === 'function') cb({ ok: true, aborted: true });
      return undefined;
    }
    if (msg && msg.type === 'deepseek') return slowPromise;
    return Promise.resolve({ ok: false });
  };
  selectText();
  toolbar().querySelector('[data-mode="interpret"]').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, cancelable: true })
  );
  // 同步进入加载态后立刻取消
  const loadingBox = result();
  check('加载态结果卡可见', loadingBox && loadingBox.hidden === false && loadingBox.classList.contains('is-loading'));
  loadingBox.querySelector('[data-action="dismiss"]').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true, cancelable: true })
  );
  check(
    '加载中取消会发送 deepseek-abort',
    calls.filter((c) => c && c.type === 'deepseek-abort').length > abortCallsBefore
  );
  check('加载中取消后结果卡关闭', result().hidden === true);
  releaseSlow(); // 释放挂起请求，避免未处理 rejection
  window.chrome.runtime.sendMessage = originalSend;

  // 6. 无结果时清空选区
  selectText();
  sel.removeAllRanges();
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  check('清空选区后工具栏消失 (hidden=true)', toolbar().hidden === true);

  // 7. CSS 守卫
  check(
    'content.css 包含 [hidden] !important 兜底规则',
    /\.dsh-ui-toolbar\[hidden\][\s\S]*?display:\s*none\s*!important/.test(CSS)
  );
  check('content.js 包含 requestSeq 竞态防护', /requestSeq/.test(code));
  check('content.js 包含 Markdown 渲染实现', /function renderMarkdown\s*\(/.test(code));
  check('background 支持 abort', /deepseek-abort/.test(fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8')));

  // ---------- 竞态：旧响应不得覆盖新结果 ----------
  runRaceTest()
    .then(() => {
      console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`);
      process.exit(failures === 0 ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}, 40);

function runRaceTest() {
  // 独立 DOM，精确控制两次 deepseek 的 resolve 顺序
  let resolveA;
  let resolveB;
  let deepseekCount = 0;
  const pending = [];

  const race = setup((msg) => {
    if (msg && msg.type === 'deepseek-abort') {
      return { ok: true, aborted: true };
    }
    if (msg && msg.type === 'deepseek') {
      deepseekCount += 1;
      const n = deepseekCount;
      return new Promise((resolve) => {
        pending.push({ n, resolve, id: msg.requestId });
        if (n === 1) resolveA = () => resolve({ ok: true, content: 'RESULT_A', requestId: msg.requestId });
        if (n === 2) resolveB = () => resolve({ ok: true, content: 'RESULT_B', requestId: msg.requestId });
      });
    }
    return Promise.resolve({ ok: false, error: 'unknown' });
  });

  const { window: w, document: d } = race;
  const p2 = d.getElementById('p');
  const sel2 = w.getSelection();
  const range2 = d.createRange();
  range2.selectNodeContents(p2);
  sel2.removeAllRanges();
  sel2.addRange(range2);
  d.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true }));

  const bar = () => d.querySelector('.dsh-ui-toolbar');
  const box = () => d.querySelector('.dsh-ui-result');

  // 第一次请求
  bar().querySelector('[data-mode="interpret"]').dispatchEvent(
    new w.MouseEvent('click', { bubbles: true, cancelable: true })
  );

  return new Promise((resolve) => setTimeout(resolve, 20))
    .then(() => {
      check('竞态：第一次请求已发出', deepseekCount === 1);
      // 点取消
      const dismiss = box().querySelector('[data-action="dismiss"]');
      dismiss.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      check('竞态：取消后结果卡关闭', box().hidden === true);

      // 再次选中并发起第二次
      sel2.addRange(range2);
      d.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      // 结果关闭后应能再出工具栏
      check('取消后可再次弹出工具栏', bar().hidden === false);
      bar().querySelector('[data-mode="interpret"]').dispatchEvent(
        new w.MouseEvent('click', { bubbles: true, cancelable: true })
      );
    })
    .then(() => new Promise((r) => setTimeout(r, 20)))
    .then(() => {
      check('竞态：第二次请求已发出', deepseekCount === 2);
      // 先 resolve 旧请求 A —— 应被丢弃
      resolveA();
    })
    .then(() => new Promise((r) => setTimeout(r, 20)))
    .then(() => {
      const textAfterA = box().textContent || '';
      check('竞态：旧响应 A 不写入结果', !textAfterA.includes('RESULT_A'));
      // 再 resolve B
      resolveB();
    })
    .then(() => new Promise((r) => setTimeout(r, 20)))
    .then(() => {
      const textAfterB = box().textContent || '';
      check('竞态：仅展示新响应 B', box().hidden === false && textAfterB.includes('RESULT_B'));
      check('竞态：最终不含 A', !textAfterB.includes('RESULT_A'));
    });
}
