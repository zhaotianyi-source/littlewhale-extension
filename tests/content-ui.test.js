// 小鲸鱼助手 LittleWhale —— content.js 显隐逻辑回归测试（jsdom）
// 验证：选区出现 → 工具栏出现；点页面其它处 / 点 × / Esc / 空选区 → 工具栏消失；结果浮窗可关闭。
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

function setup() {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>
       <p id="p">Hello world this is a test paragraph.</p>
       <div id="outside">outside area</div>
     </body></html>`,
    { url: 'https://example.com/', runScripts: 'outside-only' }
  );
  const { window } = dom;
  const { document } = window;

  // 注入 content.css（jsdom 不会自动加载扩展的 css）
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // 模拟 chrome API
  window.chrome = {
    runtime: { sendMessage: () => Promise.resolve({ ok: true, content: '这是译文结果' }) },
  };

  // jsdom 的 getBoundingClientRect 全为 0，patch 成真实选区矩形
  window.Range.prototype.getBoundingClientRect = function () {
    return { left: 100, top: 100, right: 300, bottom: 120, width: 200, height: 20, x: 100, y: 100 };
  };

  window.eval(code);
  return { window, document };
}

const { window, document } = setup();
const p = document.getElementById('p');
const sel = window.getSelection();
const toolbar = () => document.querySelector('.dsh-ui-toolbar');
const result = () => document.querySelector('.dsh-ui-result');

// 1. 模拟双击选中段落文字 → mouseup → 工具栏出现
const range = document.createRange();
range.selectNodeContents(p);
sel.removeAllRanges();
sel.addRange(range);
document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
check('选中文字后工具栏出现 (hidden=false)', toolbar() && toolbar().hidden === false);

// 2. 关键回归：hidden 后 computed display 必须为 none（此前 .dsh-ui-toolbar 的 display:flex 覆盖了它）
toolbar().hidden = true;
check('工具栏 hidden=true 后 computed display=none', window.getComputedStyle(toolbar()).display === 'none');
toolbar().hidden = false;
check('工具栏 hidden=false 后 computed display=flex', window.getComputedStyle(toolbar()).display === 'flex');

// 3. 点击页面其它位置（mousedown 在 UI 外）→ 工具栏消失
document.getElementById('outside').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
check('点击页面其它位置后工具栏消失 (hidden=true)', toolbar().hidden === true);

// 4. 再次选中 → 点击工具栏 × 按钮 → 消失
sel.addRange(range);
document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
const closeBtn = toolbar().querySelector('[data-action="close"]');
closeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
check('点击 × 后工具栏消失 (hidden=true)', toolbar().hidden === true);

// 5. 再次选中 → 点击「翻译」→ 结果浮窗出现；点「关闭」→ 浮窗消失
sel.addRange(range);
document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
toolbar().querySelector('[data-mode="translate"]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true, cancelable: true })
);
// 等待异步消息返回
setTimeout(() => {
  const box = result();
  check('点击翻译后结果浮窗出现', box && box.hidden === false && box.textContent.includes('这是译文结果'));
  if (box) {
    const dismiss = box.querySelector('[data-action="dismiss"]');
    dismiss.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    check('点击结果浮窗关闭后消失 (hidden=true)', box.hidden === true);
  }

  // 6. 清空选区 → mouseup → 工具栏消失
  sel.removeAllRanges();
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  check('清空选区后工具栏消失 (hidden=true)', toolbar().hidden === true);

  // 7. 静态守卫：content.css 中必须保留 [hidden] 兜底规则。
  //    （真实 Chrome 中 UA 的 [hidden] 会被作者样式 display:flex 覆盖，jsdom 是硬编码隐藏、
  //    无法复现该 bug，因此此处用静态断言保证修复不被回退。）
  const hasFallback = /\.dsh-ui-toolbar\[hidden\][\s\S]*?display:\s*none\s*!important/.test(CSS);
  check('content.css 包含 [hidden] !important 兜底规则', hasFallback);

  console.log(failures === 0 ? '\n=== 全部通过 ===' : `\n=== ${failures} 项失败 ===`);
  process.exit(failures === 0 ? 0 : 1);
}, 50);
