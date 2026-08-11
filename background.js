// 小鲸鱼助手 LittleWhale —— Service Worker（MV3）
// 职责：接收 content script / popup 的消息，携带存储中的 API Key 调用 DeepSeek API。
// API Key 只存放在 chrome.storage（local / session），不注入页面，避免泄露。

const DEEPSEEK_BASE = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_EFFORT = 'max';

// 进行中的请求：requestId → AbortController（支持前端取消）
const inflight = new Map();

// 每个模式对应的系统提示词
const SYSTEM_PROMPTS = {
  translate:
    '你是一位专业的翻译。请将用户提供的内容翻译成简体中文。只输出译文本身，不要加任何解释、前言或后记。如果原文已经是中文，请润色为通顺的现代汉语。',
  interpret:
    '你是一位专业的解读助手。请对用户提供的内容进行解读，包含：核心观点、背景信息、关键细节与启示。使用简体中文，条理清晰。请用 Markdown 排版（标题、列表、粗体等），不要把全文包进一层代码块，不要使用 LaTeX 公式环境。',
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'deepseek') {
    const requestId = msg.requestId != null ? String(msg.requestId) : '';
    handleDeepSeek(msg.mode, msg.text, requestId)
      .then((content) => sendResponse({ ok: true, content, requestId }))
      .catch((err) => {
        if (err && err.name === 'AbortError') {
          sendResponse({ ok: false, aborted: true, requestId, error: '已取消' });
          return;
        }
        console.error('[小鲸鱼助手] 请求失败:', err && err.message ? err.message : err);
        sendResponse({
          ok: false,
          requestId,
          error: err && err.message ? err.message : String(err),
        });
      });
    return true; // 异步响应
  }

  if (msg.type === 'deepseek-abort') {
    const requestId = msg.requestId != null ? String(msg.requestId) : '';
    const controller = requestId ? inflight.get(requestId) : null;
    if (controller) {
      controller.abort();
      inflight.delete(requestId);
      sendResponse({ ok: true, aborted: true });
    } else {
      sendResponse({ ok: true, aborted: false });
    }
    return false;
  }

  if (msg.type === 'deepseek-test') {
    testDeepSeek()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        console.error('[小鲸鱼助手] 测试失败:', err && err.message ? err.message : err);
        sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
      });
    return true;
  }
});

async function getApiKey() {
  // 优先读内存（安全模式），其次读持久存储
  const session = await chrome.storage.session.get('apiKey');
  if (session.apiKey) return session.apiKey.trim();
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      '尚未配置 DeepSeek API Key：请点击浏览器工具栏中的扩展图标，在弹窗中粘贴 Key（粘贴后会自动保存）再试。'
    );
  }
  return apiKey.trim();
}

async function getConfig() {
  const { model, reasoningEffort } = await chrome.storage.local.get(['model', 'reasoningEffort']);
  return {
    model: model && model.trim() ? model.trim() : DEFAULT_MODEL,
    reasoningEffort: reasoningEffort || DEFAULT_EFFORT,
  };
}

function buildBody(model, reasoningEffort, messages, extra) {
  const body = { model, messages, stream: false, ...extra };
  if (model.startsWith('deepseek-v4')) {
    body.reasoning_effort = reasoningEffort;
  }
  return body;
}

async function handleDeepSeek(mode, text, requestId) {
  const apiKey = await getApiKey();
  if (!text || !text.trim()) throw new Error('选中的文本为空。');

  const { model, reasoningEffort } = await getConfig();
  const system = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.interpret;

  const controller = new AbortController();
  if (requestId) inflight.set(requestId, controller);

  try {
    const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        buildBody(
          model,
          reasoningEffort,
          [
            { role: 'system', content: system },
            { role: 'user', content: text.slice(0, 20000) },
          ],
          { temperature: 0.3 }
        )
      ),
      signal: controller.signal,
    });

    if (!resp.ok) {
      let detail = '';
      try {
        const j = await resp.json();
        detail = j?.error?.message || JSON.stringify(j);
      } catch (_) {
        /* ignore */
      }
      if (resp.status === 401) {
        throw new Error(`API Key 无效或已过期（HTTP 401）。${detail}`.trim());
      }
      if (resp.status === 429) {
        throw new Error('请求过于频繁或额度不足（HTTP 429），请稍后重试。');
      }
      throw new Error(`DeepSeek API 请求失败（HTTP ${resp.status}）：${detail}`.trim());
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek 返回内容为空，请重试。');
    return content;
  } finally {
    if (requestId) inflight.delete(requestId);
  }
}

async function testDeepSeek() {
  const apiKey = await getApiKey();
  const { model, reasoningEffort } = await getConfig();
  const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(
      buildBody(
        model,
        reasoningEffort,
        [{ role: 'user', content: 'ping' }],
        { max_tokens: 8 }
      )
    ),
  });
  if (!resp.ok) {
    let detail = '';
    try {
      const j = await resp.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch (_) {
      /* ignore */
    }
    throw new Error(`连接失败（HTTP ${resp.status}）：${detail || '请检查 API Key、模型名与网络。'}`);
  }
}
