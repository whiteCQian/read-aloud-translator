importScripts('shared.js');

const Core = globalThis.TranslationCore;
const TRANSLATION_APIS = {
  baidu: {
    name: '百度翻译代理',
    url: text => `https://api.yun.info/api/translate?q=${encodeURIComponent(text)}&from=en&to=zh`,
    parser: Core.parseBaidu
  },
  myMemory: {
    name: 'MyMemory',
    url: text => `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh`,
    parser: Core.parseMyMemory
  },
  google: {
    name: 'Google 翻译',
    url: text => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`,
    parser: Core.parseGoogle
  }
};
const tabBaiduDisabled = new Map();
const BAIDU_DISABLED_TIMEOUT = 3 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 6500;
const TRANSLATION_TIMEOUT = 24000;
const activeRequests = new Map();
const dictionaryResults = new Map();
let audioDocumentCreating = null;
let currentPlayback = null;

async function audioDocumentExists() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('audio.html')] });
  return contexts.length > 0;
}

async function ensureAudioDocument() {
  if (audioDocumentCreating) return audioDocumentCreating;
  audioDocumentCreating = (async () => {
    if (await audioDocumentExists()) return;
    await chrome.offscreen.createDocument({ url: 'audio.html', reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play dictionary recordings independently of website media restrictions.' });
  })();
  try { await audioDocumentCreating; } finally { audioDocumentCreating = null; }
}

function reportPlayback(playback, state) {
  chrome.tabs.sendMessage(playback.tabId, { action: 'dictionary-audio-state',
    requestId: playback.requestId, playbackId: playback.id, state }, { frameId: playback.frameId }).catch(() => {});
}

async function stopDictionaryAudio(playbackId) {
  const playback = currentPlayback;
  if (!playback || playback.id !== playbackId) return;
  currentPlayback = null;
  reportPlayback(playback, 'stopped');
  await stopAudioPlayer(playbackId);
}

async function stopAudioPlayer(playbackId) {
  if (await audioDocumentExists()) {
    await chrome.runtime.sendMessage({ target: 'dictionary-player', action: 'stop', playbackId });
  }
}

async function playDictionaryAudio(request, sender) {
  const scope = requestScope(sender);
  const dictionary = dictionaryResults.get(scope);
  if (!sender.tab || !dictionary || dictionary.id !== request.requestId || !dictionary.audios.length
    || typeof request.playbackId !== 'string') return { success: false };
  const previous = currentPlayback;
  const playback = { id: request.playbackId, requestId: request.requestId, scope,
    tabId: sender.tab.id, frameId: sender.frameId || 0 };
  currentPlayback = playback;
  try {
    if (previous) { reportPlayback(previous, 'stopped'); await stopAudioPlayer(previous.id); }
    await ensureAudioDocument();
    if (currentPlayback !== playback) return { success: false, cancelled: true };
    const response = await chrome.runtime.sendMessage({ target: 'dictionary-player', action: 'play',
      urls: dictionary.audios, playbackId: playback.id });
    if (currentPlayback !== playback) return { success: false, cancelled: true };
    if (!response?.success) currentPlayback = null;
    return response || { success: false };
  } catch {
    if (currentPlayback === playback) currentPlayback = null;
    return { success: false };
  }
}

function isTabBaiduDisabled(tabId) {
  const disabledAt = tabBaiduDisabled.get(tabId);
  if (disabledAt === undefined) return false;
  if (Date.now() - disabledAt >= BAIDU_DISABLED_TIMEOUT) {
    tabBaiduDisabled.delete(tabId);
    return false;
  }
  return true;
}

async function fetchJson(url, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new Error('请求已取消');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    const data = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

async function translateWithApi(apiKey, text, tabId, signal) {
  const api = TRANSLATION_APIS[apiKey];
  try {
    const { response, data } = await fetchJson(api.url(text), signal);
    if (apiKey === 'baidu' && response.status === 500 && data?.errorCode === 'BAIDU_PROVIDER_DISABLED') {
      if (tabId !== null && tabId !== undefined) tabBaiduDisabled.set(tabId, Date.now());
      return null;
    }
    if (!response.ok) return null;
    return api.parser(data);
  } catch {
    // Keep selected text, request URLs and remote responses out of logs.
    return null;
  }
}

async function handleTranslation(text, chineseRoute, tabId, signal) {
  if (typeof text !== 'string' || !text.trim()) return { success: false, error: '请先选中英文单词或句子。' };
  text = text.trim();
  if (text.length > Core.MAX_TEXT_LENGTH) {
    return { success: false, error: `每次最多翻译 ${Core.MAX_TEXT_LENGTH} 个字符，请缩短选区。` };
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, TRANSLATION_TIMEOUT);
  const providers = chineseRoute ? ['baidu', 'myMemory'] : ['google', 'myMemory'];
  try {
    // Retry the whole text with the fallback, never mixing partial providers.
    for (const key of providers) {
      if (controller.signal.aborted) break;
      if (key === 'baidu' && isTabBaiduDisabled(tabId)) continue;
      const chunks = key === 'google' ? [text] : Core.splitText(text);
      const translated = [];
      let complete = true;
      for (const chunk of chunks) {
        if (controller.signal.aborted) { complete = false; break; }
        if (!chunk.trim()) { translated.push(chunk); continue; }
        const result = await translateWithApi(key, chunk.trim(), tabId, controller.signal);
        if (!result) { complete = false; break; }
        translated.push(result + (chunk.match(/\n+\s*$/)?.[0] || ''));
      }
      if (complete && !controller.signal.aborted) {
        return { success: true, result: translated.join('').trim(), provider: TRANSLATION_APIS[key].name };
      }
    }
    return { success: false, error: controller.signal.aborted
      ? '请求已超时或取消，请稍后重试。' : '暂时无法连接翻译服务，请重试或在设置中切换服务。' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

async function getDictionary(text, signal) {
  if (typeof text !== 'string' || !Core.isWord(text) || text.length > 100) return { pron: '', audio: '' };
  try {
    const { response, data } = await fetchJson(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`, signal);
    return response.ok ? Core.parseDictionary(data) : { pron: '', audio: '' };
  } catch { return { pron: '', audio: '' }; }
}

function requestScope(sender) { return `${sender.tab?.id ?? 'popup'}:${sender.frameId ?? 0}`; }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target === 'dictionary-player') return false;
  if (request.action === 'dictionary-audio-state' && request.target === 'background'
    && sender.url === chrome.runtime.getURL('audio.html')) {
    if (currentPlayback?.id === request.playbackId) {
      const playback = currentPlayback; currentPlayback = null; reportPlayback(playback, request.state);
    }
    return false;
  }
  if (request.action === 'play-dictionary') {
    playDictionaryAudio(request, sender).then(sendResponse);
    return true;
  }
  if (request.action === 'stop-dictionary') {
    if (currentPlayback?.scope === requestScope(sender)) stopDictionaryAudio(request.playbackId).catch(() => {});
    return false;
  }
  if (request.action === 'selection-from-frame' && sender.tab) {
    showSelection(sender.tab.id, 0, request.text).then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'open-settings') {
    chrome.runtime.openOptionsPage().then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  const scope = requestScope(sender);
  if (request.action === 'cancel') {
    if (dictionaryResults.get(scope)?.id === request.requestId) dictionaryResults.delete(scope);
    if (currentPlayback?.scope === scope && currentPlayback.requestId === request.requestId) {
      stopDictionaryAudio(currentPlayback.id).catch(() => {});
    }
    for (const type of ['translate', 'dictionary']) {
      const active = activeRequests.get(`${scope}:${type}`);
      if (active && active.id === request.requestId) active.controller.abort();
    }
    return false;
  }
  if (!['translate', 'dictionary'].includes(request.action)) return false;
  const key = `${scope}:${request.action}`;
  activeRequests.get(key)?.controller.abort();
  const active = { id: request.requestId, controller: new AbortController() };
  activeRequests.set(key, active);
  (async () => {
    if (request.action === 'dictionary') return getDictionary(request.text, active.controller.signal);
    const stored = await chrome.storage.local.get('settings');
    const settings = Core.normalizeSettings(stored.settings);
    const chineseRoute = settings.translationProvider === 'chinese'
      || (settings.translationProvider === 'auto' && Core.detectChineseUser(request.language, request.timezone));
    return handleTranslation(request.text, chineseRoute, sender.tab?.id, active.controller.signal);
  })().then(result => {
    if (request.action === 'dictionary' && activeRequests.get(key) === active && !active.controller.signal.aborted) {
      dictionaryResults.set(scope, { id: request.requestId, audios: result.audios || [] });
    }
    sendResponse(result);
  }).catch(() => sendResponse({ success: false, error: '扩展连接失败，请刷新页面后重试。' }))
    .finally(() => { if (activeRequests.get(key) === active) activeRequests.delete(key); });
  return true;
});

async function showSelection(tabId, frameId = 0, text) {
  if (tabId === undefined) return;
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'show-selection', text }, { frameId });
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: '英汉翻译 · 选中文字后按翻译快捷键' });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b54734' });
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setTitle({ tabId, title: '请刷新普通网页后重试；浏览器内部页面不支持翻译' });
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'translate-selection') return;
  if (!tab?.id) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'show-selection', focusedOnly: true });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch { await showSelection(tab.id); }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'translate-selection', title: '翻译选中文字', contexts: ['selection'] });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Always render in the top document, so a small embedded frame cannot clip the card.
  if (info.menuItemId === 'translate-selection') showSelection(tab?.id, 0, info.selectionText);
});
chrome.tabs.onRemoved.addListener(tabId => {
  tabBaiduDisabled.delete(tabId);
  for (const scope of dictionaryResults.keys()) {
    if (scope.startsWith(`${tabId}:`)) dictionaryResults.delete(scope);
  }
  if (currentPlayback?.tabId === tabId) stopDictionaryAudio(currentPlayback.id).catch(() => {});
  for (const [key, active] of activeRequests) {
    if (key.startsWith(`${tabId}:`)) { active.controller.abort(); activeRequests.delete(key); }
  }
});
