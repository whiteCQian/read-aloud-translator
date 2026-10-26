(() => {
  const Core = globalThis.TranslationCore;
  const HOST_ID = 'chromeplugin-translate-popup';
  const icons = {
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a4 4 0 0 0-4-2H4z"/><path d="M13 7a3 3 0 0 1 3-3h4v14h-3a4 4 0 0 0-4 2"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6a8 8 0 0 1 13.3 3M4.6 15A8 8 0 0 0 18 18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M9.72 4.541 10.436 2.123h3.128l.716 2.418 1.382.572 2.216-1.203 2.212 2.212-1.203 2.216.572 1.382 2.418.716v3.128l-2.418.716-.572 1.382 1.203 2.216-2.212 2.212-2.216-1.203-1.382.572-.716 2.418h-3.128l-.716-2.418-1.382-.572-2.216 1.203-2.212-2.212 1.203-2.216-.572-1.382-2.418-.716v-3.128l2.418-.716.572-1.382-1.203-2.216 2.212-2.212 2.216 1.203Z"/>'
  };
  const svg = name => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const styles = `
    :host { all: initial; color-scheme: light; }
    *, *::before, *::after { box-sizing: border-box; }
    .panel { position: fixed; width: min(456px, calc(100vw - 24px)); max-height: calc(100dvh - 24px);
      display: flex; flex-direction: column; background: #fff; color: #202a3b; border: 1px solid #dfe5ef;
      border-radius: 18px; box-shadow: 0 16px 56px #132b4b26, 0 2px 8px #132b4b0a;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
      text-align: left; letter-spacing: normal; overflow: hidden; animation: enter .16s ease-out; }
    button { font: inherit; cursor: pointer; border: 0; display: inline-flex; align-items: center; justify-content: center;
      gap: 7px; background: transparent; color: inherit; padding: 0; border-radius: 8px; }
    button:hover { background: #eef3fa; color: #245aca; }
    button:focus-visible { outline: 2px solid #3267d6; outline-offset: 2px; }
    button:disabled { opacity: .45; cursor: default; }
    button[hidden], [hidden] { display: none !important; }
    .header { display: flex; align-items: center; padding: 15px 18px; border-bottom: 1px solid #edf0f5; gap: 9px; flex-shrink: 0; }
    .brand-icon { display: flex; align-items: center; justify-content: center; width: 29px; height: 29px; border-radius: 8px; background: #edf3ff; color: #3267d6; }
    .brand { font-weight: 650; font-size: 14px; }
    .kind { font-size: 11px; color: #7c8799; margin-left: 2px; }
    .spacer { flex: 1; }
    .icon { flex: 0 0 29px; width: 29px; height: 29px; color: #8993a3; }
    .icon svg { display: block; flex: none; width: 18px; height: 18px; }
    .scroll { overflow: auto; overscroll-behavior: contain; padding: 21px 23px 24px; }
    .eyebrow { display: flex; align-items: center; gap: 7px; color: #8390a5; font-size: 10px; font-weight: 650; letter-spacing: 1.6px; }
    .eyebrow .line { flex: 1; height: 1px; background: #edf0f5; margin-left: 4px; }
    .source { margin: 10px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 17px/1.7 Georgia, 'Times New Roman', serif; color: #48536a; }
    .source.word { font: 600 32px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; letter-spacing: -.6px; color: #202a3b; }
    .phonetic { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; color: #5c78ad; }
    .phonetic-text { font: 15px/1.5 'Segoe UI', sans-serif; }
    .phonetic button { font-size: 11px; padding: 3px 6px; color: #697a96; background: #f2f5fa; }
    .phonetic .audio { background: transparent; padding: 4px; }
    .divider { height: 1px; background: #edf0f5; margin: 20px 0; }
    .target-label { color: #3267d6; letter-spacing: 1px; }
    .result { margin: 11px 0 0; color: #1b2b48; font-size: 23px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
    .result.word { font-size: 27px; font-weight: 600; line-height: 1.5; }
    .error { color: #a84b38; font-size: 14px; line-height: 1.8; }
    .loading { margin-top: 18px; display: grid; gap: 11px; }
    .skeleton { height: 12px; background: #eef2f7; border-radius: 4px; animation: pulse 1.3s ease-in-out infinite; }
    .skeleton:last-child { width: 62%; }
    .loading-caption { font-size: 12px; color: #8b97a9; margin-top: 3px; }
    .footer { display: flex; align-items: center; gap: 6px; padding: 11px 15px; background: #fafbfd; border-top: 1px solid #edf0f5; flex-shrink: 0; }
    .action { font-size: 12px; padding: 7px 9px; color: #5c6c85; }
    .action.primary { color: #3267d6; }
    .provider { font-size: 10px; color: #8b97a9; text-align: right; max-width: 95px; }
    .hint { padding: 0 23px 12px; font-size: 11px; color: #8590a1; }
    .toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 24px);
      padding: 12px 18px; border-radius: 12px; background: #20314b; color: white; font: 13px/1.5 'Segoe UI', 'Microsoft YaHei', sans-serif; box-shadow: 0 6px 24px #132b4b26; }
    @keyframes enter { from { opacity: 0; translate: 0 5px; } to { opacity: 1; translate: 0 0; } }
    @keyframes pulse { 50% { opacity: .4; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `;

  let current = null;
  let sequence = 0;
  let host = null;
  let shadow = null;
  let toastTimer;
  let settings = { ...Core.DEFAULT_SETTINGS };
  let utterance = null;
  let audio = null;
  const $ = selector => shadow?.querySelector(selector);
  const send = message => chrome.runtime.sendMessage(message);

  function ensureHost() {
    if (host?.isConnected) return;
    document.getElementById(HOST_ID)?.remove();
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${styles}</style><div class="mount" style="pointer-events:auto"></div>`;
    (document.fullscreenElement || document.documentElement).appendChild(host);
  }

  function updateSpeaking(speaking) {
    const button = $('#speak');
    if (!button) return;
    button.innerHTML = svg(speaking ? 'stop' : 'sound') + (speaking ? '停止朗读' : '朗读原文');
    button.setAttribute('aria-label', speaking ? '停止朗读' : '朗读原文');
    button.dataset.speaking = String(speaking);
    const audioButton = $('#audio');
    if (audioButton) {
      const label = audio ? '停止词典发音' : '播放词典发音';
      audioButton.title = label;
      audioButton.setAttribute('aria-label', label);
    }
  }

  function stopSpeaking() {
    if (utterance) { utterance.onend = null; utterance.onerror = null; window.speechSynthesis.cancel(); utterance = null; }
    if (audio) {
      send({ action: 'stop-dictionary', playbackId: audio.id }).catch(() => {});
      audio = null;
    }
    $('#audio')?.removeAttribute('aria-busy');
    updateSpeaking(false);
  }

  function speak(text) {
    stopSpeaking();
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      showHint('当前浏览器不支持语音朗读。'); return false;
    }
    const item = new SpeechSynthesisUtterance(text);
    item.lang = 'en-US';
    item.rate = settings.speechRate;
    const voice = speechSynthesis.getVoices().find(v => v.voiceURI === settings.speechVoice);
    if (voice) item.voice = voice;
    item.onend = () => { if (utterance === item) { utterance = null; updateSpeaking(false); } };
    item.onerror = event => {
      if (utterance !== item) return;
      utterance = null; updateSpeaking(false);
      if (!['canceled', 'interrupted'].includes(event.error)) showHint('语音暂时不可用，请在设置中尝试其他声音。');
    };
    utterance = item;
    speechSynthesis.speak(item);
    updateSpeaking(true);
    return true;
  }

  function fallbackToSpeech(query) {
    if (current !== query) return;
    audio = null; $('#audio')?.removeAttribute('aria-busy'); updateSpeaking(false);
    if (speak(query.text)) showHint('词典录音暂不可用，已切换为浏览器朗读。');
  }

  function close() {
    if (current) send({ action: 'cancel', requestId: current.id }).catch(() => {});
    current = null;
    sequence++;
    stopSpeaking();
    clearTimeout(toastTimer);
    host?.remove();
    host = shadow = null;
  }

  function toast(text) {
    close(); ensureHost();
    const message = document.createElement('div');
    message.className = 'toast'; message.setAttribute('role', 'status'); message.textContent = text;
    $('.mount').appendChild(message);
    toastTimer = setTimeout(close, 3500);
  }

  function showHint(text) {
    const hint = $('#hint');
    if (hint) { hint.hidden = false; hint.textContent = text; }
  }

  function activeElement() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    return element;
  }

  function selected() {
    const element = activeElement();
    if (element && /^(INPUT|TEXTAREA)$/.test(element.tagName)) {
      if (element.type === 'password') return { text: '', rect: null };
      if (typeof element.selectionStart === 'number') {
        return { text: element.value.slice(element.selectionStart, element.selectionEnd).trim(), rect: element.getBoundingClientRect() };
      }
    }
    const selection = window.getSelection();
    return { text: selection?.toString().trim() || '', rect: selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null };
  }

  function position() {
    const panel = $('.panel');
    if (!panel || !current) return;
    const rect = current.rect;
    const width = panel.getBoundingClientRect().width || 456;
    const height = panel.getBoundingClientRect().height;
    const viewWidth = window.innerWidth, viewHeight = window.innerHeight;
    let left = rect && rect.width + rect.height > 0 ? rect.left : (viewWidth - width) / 2;
    let top = rect && rect.width + rect.height > 0 ? rect.bottom + 12 : Math.min(100, viewHeight * .15);
    if (top + height > viewHeight - 12 && rect && rect.top - height - 12 >= 12) top = rect.top - height - 12;
    panel.style.left = `${Math.max(12, Math.min(left, viewWidth - width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(top, viewHeight - height - 12))}px`;
  }

  function render(query) {
    ensureHost();
    // This template contains constants only. All page and provider text uses textContent.
    $('.mount').innerHTML = `
      <section class="panel" role="dialog" tabindex="-1" aria-label="英汉翻译" aria-busy="true">
        <header class="header"><span class="brand-icon">${svg('book')}</span><span class="brand">英汉翻译</span>
          <span class="kind"></span><span class="spacer"></span>
          <button id="settings" class="icon" title="打开设置" aria-label="打开设置">${svg('settings')}</button>
          <button id="close" class="icon" title="关闭 · Esc" aria-label="关闭">${svg('close')}</button></header>
        <div class="scroll">
          <div class="eyebrow">ENGLISH<span class="line"></span><span id="count"></span></div>
          <p class="source" id="source" lang="en"></p>
          <div class="phonetic" id="phonetic" hidden><span class="phonetic-text"></span>
            <button id="audio" class="audio" title="播放词典发音" aria-label="播放词典发音" hidden>${svg('sound')}</button>
            <button id="phonetic-toggle" title="切换音标格式"></button></div>
          <div class="divider"></div>
          <div class="eyebrow target-label">简体中文<span class="line"></span></div>
          <div id="loading" class="loading" role="status"><span class="skeleton"></span><span class="skeleton"></span><span class="loading-caption">正在翻译，请稍候…</span></div>
          <p id="result" class="result" lang="zh-CN" aria-live="polite" hidden></p>
        </div>
        <div id="hint" class="hint" role="status" hidden></div>
        <footer class="footer"><button id="speak" class="action primary">${svg('sound')}朗读原文</button>
          <button id="copy" class="action" disabled>${svg('copy')}复制译文</button>
          <button id="retry" class="action" hidden>${svg('refresh')}重试</button>
          <span class="spacer"></span><span class="provider">Esc 关闭</span></footer>
      </section>`;
    $('#source').textContent = query.text;
    $('#source').classList.toggle('word', query.word);
    $('#result').classList.toggle('word', query.word);
    $('.kind').textContent = query.word ? '单词' : '句段';
    $('#count').textContent = `${query.text.length} 字符`;
    $('#close').onclick = close;
    $('#settings').onclick = () => send({ action: 'open-settings' }).then(response => {
      if (!response?.success) showHint('请点击浏览器工具栏的扩展图标打开设置。');
    }).catch(() => showHint('请点击浏览器工具栏的扩展图标打开设置。'));
    $('#speak').onclick = () => { if (utterance || audio) stopSpeaking(); else speak(query.text); };
    $('#copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(query.result);
        if (current !== query) return;
        showHint('译文已复制');
      } catch { if (current === query) showHint('复制失败，请直接选中译文复制。'); }
    };
    $('#retry').onclick = () => start(query.text, query.rect);
    $('#phonetic-toggle').onclick = async () => {
      settings.phoneticType = settings.phoneticType === 'dj' ? 'ipa' : 'dj';
      updatePhonetic(query);
      try {
        const stored = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...Core.normalizeSettings(stored.settings), phoneticType: settings.phoneticType } });
      } catch { if (current === query) showHint('设置未保存，请刷新页面后重试。'); }
    };
    $('#audio').onclick = async () => {
      if (audio) { stopSpeaking(); return; }
      stopSpeaking();
      const session = { id: `${query.id}-audio-${++sequence}` };
      audio = session;
      $('#hint').hidden = true;
      $('#audio').setAttribute('aria-busy', 'true');
      updateSpeaking(true);
      try {
        const response = await send({ action: 'play-dictionary', requestId: query.id, playbackId: session.id });
        if (current !== query || audio !== session) return;
        $('#audio').removeAttribute('aria-busy');
        if (!response?.success) {
          if (response?.cancelled) stopSpeaking();
          else fallbackToSpeech(query);
        }
      } catch { if (current === query && audio === session) fallbackToSpeech(query); }
    };
    position();
    $('.panel').focus({ preventScroll: true });
  }

  function updatePhonetic(query) {
    if (current !== query || !query.pron) return;
    $('#phonetic').hidden = false;
    $('.phonetic-text').textContent = `/${Core.normalizeIPA(query.pron, settings.phoneticType)}/`;
    $('#phonetic-toggle').textContent = settings.phoneticType === 'dj' ? '中国音标 ⇄' : '国际音标 ⇄';
    $('#audio').hidden = !query.audio;
    position();
  }

  async function start(text, rect) {
    close();
    if (!text.trim()) { toast('请先选中英文单词或句子，再按翻译快捷键。'); return; }
    if (text.length > Core.MAX_TEXT_LENGTH) { toast(`每次最多翻译 ${Core.MAX_TEXT_LENGTH} 个字符，请缩短选区。`); return; }
    const query = { id: `${Date.now()}-${++sequence}`, text: text.trim(), rect, word: Core.isWord(text), result: '' };
    current = query;
    render(query);
    const preferences = chrome.storage.local.get('settings').then(stored => {
      if (current === query) { settings = Core.normalizeSettings(stored.settings); updatePhonetic(query); }
    }).catch(() => {});
    if (query.word) {
      send({ action: 'dictionary', text: query.text, requestId: query.id }).then(data => {
        if (current !== query) return;
        query.pron = data?.pron; query.audio = data?.audio; updatePhonetic(query);
      }).catch(() => {});
    }
    try {
      const response = await send({ action: 'translate', text: query.text, requestId: query.id,
        language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (current !== query) return;
      $('#loading').hidden = true;
      $('#result').hidden = false;
      $('.panel').setAttribute('aria-busy', 'false');
      if (response?.success && typeof response.result === 'string') {
        query.result = response.result;
        $('#result').textContent = response.result;
        $('#copy').disabled = false;
        $('.provider').textContent = response.provider || '翻译完成';
        position();
        await preferences;
        if (current === query && settings.autoSpeak) speak(query.text);
      } else {
        $('#result').classList.add('error');
        $('#result').textContent = response?.error || '翻译失败，请稍后重试。';
        $('#retry').hidden = false;
        position();
      }
    } catch {
      if (current !== query) return;
      $('#loading').hidden = true; $('#result').hidden = false;
      $('#result').classList.add('error');
      $('#result').textContent = '扩展连接已断开，请刷新页面后重试。';
      $('.panel').setAttribute('aria-busy', 'false');
      $('#retry').hidden = false; position();
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.action === 'dictionary-audio-state') {
      if (current?.id !== message.requestId || audio?.id !== message.playbackId) return;
      if (message.state === 'error') fallbackToSpeech(current);
      else { audio = null; $('#audio')?.removeAttribute('aria-busy'); updateSpeaking(false); }
      return;
    }
    if (message.action !== 'show-selection') return;
    if (message.focusedOnly && (!document.hasFocus() || /^(IFRAME|FRAME)$/.test(document.activeElement?.tagName))) return;
    const selection = selected();
    const text = typeof message.text === 'string' ? message.text : selection.text;
    if (window.top !== window) {
      send({ action: 'selection-from-frame', text }).catch(() => {});
    } else {
      start(text, typeof message.text === 'string' ? null : selection.rect);
    }
    respond({ received: true });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && host) { event.preventDefault(); close(); }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (current && !event.composedPath().includes(host)) close();
  }, true);
  window.addEventListener('resize', position);
  window.addEventListener('pagehide', close);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = Core.normalizeSettings(changes.settings.newValue);
    if (current) updatePhonetic(current);
  });
})();
