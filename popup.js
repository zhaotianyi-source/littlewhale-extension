// 小鲸鱼助手 LittleWhale —— Popup 逻辑
// ① API Key：粘贴即自动保存（防抖 600ms），可切换「安全模式」（仅内存）
// ② 模型设置：模型 + 智能水平（reasoning_effort），修改即自动保存
// （TapTap 链接工具已拆分至独立插件 taptap-maker-plugin/）

const $ = (id) => document.getElementById(id);

const keyInput = $('apiKey');
const toggleKeyBtn = $('toggleKey');
const saveKeyBtn = $('saveKey');
const testKeyBtn = $('testKey');
const keyStatus = $('keyStatus');
const safeModeCheckbox = $('safeMode');

const modelInput = $('model');
const effortSelect = $('effort');
const modelStatus = $('modelStatus');

// chrome.storage.session 需要 Chrome 102+，老版本浏览器回退到 local
const hasSessionStorage = !!(chrome.storage && chrome.storage.session);

function setStatus(el, text, type) {
  el.textContent = text || '';
  el.className = 'status' + (type ? ' ' + type : '');
}

function maskKey(k) {
  if (!k) return '';
  return k.length > 10 ? k.slice(0, 3) + '****' + k.slice(-4) : '已设置';
}

// ---------- API Key ----------
// 存储策略：
//  - 默认存 chrome.storage.local（持久，明文落盘）
//  - 安全模式存 chrome.storage.session（纯内存，浏览器重启即清空，不落盘）
async function loadKey() {
  let apiKey = '';
  let from = '';
  if (hasSessionStorage) {
    const s = await chrome.storage.session.get('apiKey');
    if (s.apiKey) {
      apiKey = s.apiKey;
      from = '内存';
      safeModeCheckbox.checked = true;
    }
  }
  if (!apiKey) {
    const l = await chrome.storage.local.get('apiKey');
    if (l.apiKey) {
      apiKey = l.apiKey;
      from = '本机';
    }
  }
  if (apiKey) {
    keyInput.value = apiKey;
    setStatus(keyStatus, `已保存（${from}）：${maskKey(apiKey)} ✓`, 'ok');
  } else {
    setStatus(keyStatus, '尚未保存 Key：在下方粘贴后会自动保存');
  }
}

async function saveKey(silent) {
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    if (!silent) setStatus(keyStatus, 'API Key 不能为空', 'err');
    return false;
  }
  try {
    if (safeModeCheckbox.checked) {
      await chrome.storage.session.set({ apiKey });
      await chrome.storage.local.remove('apiKey');
      setStatus(keyStatus, `已保存到内存（安全模式）：${maskKey(apiKey)} ✓`, 'ok');
    } else {
      await chrome.storage.local.set({ apiKey });
      await chrome.storage.session.remove('apiKey');
      setStatus(keyStatus, `已保存到本机：${maskKey(apiKey)} ✓`, 'ok');
    }
    return true;
  } catch (err) {
    setStatus(keyStatus, '保存失败：' + (err && err.message ? err.message : err) + '（请点击扩展卡片刷新后重试）', 'err');
    return false;
  }
}

// 粘贴/输入即自动保存
let keySaveTimer = null;
keyInput.addEventListener('input', () => {
  clearTimeout(keySaveTimer);
  keySaveTimer = setTimeout(() => saveKey(true), 600);
});

// 切换安全模式时，若输入框中有 Key 立即迁移到目标存储，避免状态不一致
safeModeCheckbox.addEventListener('change', async () => {
  const apiKey = keyInput.value.trim();
  if (!apiKey) return;
  if (safeModeCheckbox.checked) {
    await chrome.storage.session.set({ apiKey });
    await chrome.storage.local.remove('apiKey');
    setStatus(keyStatus, '已切换为安全模式：Key 已移入内存，不落盘 ✓', 'ok');
  } else {
    await chrome.storage.local.set({ apiKey });
    await chrome.storage.session.remove('apiKey');
    setStatus(keyStatus, '已切换为持久保存：Key 已写入本机存储 ✓', 'ok');
  }
});

toggleKeyBtn.addEventListener('click', () => {
  const show = keyInput.type === 'password';
  keyInput.type = show ? 'text' : 'password';
  toggleKeyBtn.textContent = show ? '隐藏' : '显示';
});
saveKeyBtn.addEventListener('click', () => saveKey(false));
keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveKey(false);
});

async function testKey() {
  // 测试前先确保 Key 已保存
  if (keyInput.value.trim()) await saveKey(true);
  setStatus(keyStatus, '测试中…');
  testKeyBtn.disabled = true;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'deepseek-test' });
    if (resp && resp.ok) {
      setStatus(keyStatus, `连接成功（${modelInput.value.trim() || 'deepseek-v4-flash'}）✓`, 'ok');
    } else {
      setStatus(keyStatus, (resp && resp.error) || '连接失败', 'err');
    }
  } catch (err) {
    setStatus(keyStatus, err && err.message ? err.message : String(err), 'err');
  } finally {
    testKeyBtn.disabled = false;
  }
}

// ---------- 模型设置 ----------
async function loadModelSettings() {
  const { model, reasoningEffort } = await chrome.storage.local.get(['model', 'reasoningEffort']);
  modelInput.value = model || 'deepseek-v4-flash';
  effortSelect.value = reasoningEffort || 'max';
}
async function saveModelSettings() {
  await chrome.storage.local.set({
    model: (modelInput.value.trim() || 'deepseek-v4-flash'),
    reasoningEffort: effortSelect.value,
  });
  setStatus(modelStatus, `已保存：${modelInput.value.trim() || 'deepseek-v4-flash'} / ${effortSelect.value} ✓`, 'ok');
}
let modelSaveTimer = null;
modelInput.addEventListener('input', () => {
  clearTimeout(modelSaveTimer);
  modelSaveTimer = setTimeout(saveModelSettings, 600);
});
effortSelect.addEventListener('change', saveModelSettings);

// 初始化
loadKey();
loadModelSettings();
