(() => {
  const Core = globalThis.TranslationCore;
  const $ = id => document.getElementById(id);
  let settings = { ...Core.DEFAULT_SETTINGS };
  let saving = Promise.resolve();
  let preview = null;

  function voiceOptions() {
    const voices = window.speechSynthesis?.getVoices().filter(voice => /^en\b/i.test(voice.lang)) || [];
    $('speechVoice').replaceChildren(new Option('浏览器默认英文声音', ''));
    for (const voice of voices) $('speechVoice').add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI));
    if (settings.speechVoice && !voices.some(voice => voice.voiceURI === settings.speechVoice)) {
      $('speechVoice').add(new Option('已保存的声音（当前不可用）', settings.speechVoice));
    }
    $('speechVoice').value = settings.speechVoice;
  }

  function render() {
    $('autoSpeak').checked = settings.autoSpeak;
    $('speechRate').value = settings.speechRate;
    $('rate-value').textContent = `${settings.speechRate.toFixed(1)}×`;
    $('phoneticType').value = settings.phoneticType;
    $('translationProvider').value = settings.translationProvider;
    voiceOptions();
  }

  function save(key, value) {
    settings = Core.normalizeSettings({ ...settings, [key]: value });
    $('save-status').textContent = '保存中…';
    $('save-status').classList.remove('error');
    saving = saving.catch(() => {}).then(async () => {
      const stored = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: Core.normalizeSettings({ ...Core.normalizeSettings(stored.settings), [key]: value }) });
      $('save-status').textContent = '已保存';
    }).catch(() => {
      $('save-status').textContent = '保存失败，请重试';
      $('save-status').classList.add('error');
    });
  }

  async function initialize() {
    const controls = ['autoSpeak', 'speechRate', 'speechVoice', 'phoneticType', 'translationProvider'];
    for (const id of controls) $(id).disabled = true;
    try {
      const stored = await chrome.storage.local.get('settings');
      settings = Core.normalizeSettings(stored.settings);
      render();
      $('save-status').textContent = '自动保存';
    } catch {
      $('save-status').textContent = '设置读取失败';
      $('save-status').classList.add('error');
    }
    for (const id of controls) $(id).disabled = false;
    try {
      const commands = await chrome.commands.getAll();
      const shortcut = commands.find(command => command.name === 'translate-selection')?.shortcut;
      $('shortcut').replaceChildren();
      if (!shortcut) $('shortcut').textContent = '尚未设置快捷键，请点击下方设置';
      else shortcut.split('+').forEach((key, index) => {
        if (index) { const plus = document.createElement('span'); plus.className = 'plus'; plus.textContent = '+'; $('shortcut').appendChild(plus); }
        const keycap = document.createElement('kbd'); keycap.textContent = key; $('shortcut').appendChild(keycap);
      });
    } catch { $('shortcut').textContent = '请在扩展快捷键页面查看或设置'; }
  }

  $('autoSpeak').addEventListener('change', event => save('autoSpeak', event.target.checked));
  $('speechRate').addEventListener('input', event => { $('rate-value').textContent = `${Number(event.target.value).toFixed(1)}×`; });
  $('speechRate').addEventListener('change', event => save('speechRate', Number(event.target.value)));
  for (const id of ['speechVoice', 'phoneticType', 'translationProvider']) $(id).addEventListener('change', event => save(id, event.target.value));
  $('configure-shortcut').onclick = () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(() => {
      $('save-status').textContent = '请打开 chrome://extensions/shortcuts';
    });
  };
  $('preview-voice').onclick = () => {
    if (!window.speechSynthesis) return;
    if (preview) { speechSynthesis.cancel(); preview = null; $('preview-voice').textContent = '试听声音'; return; }
    const utter = new SpeechSynthesisUtterance('A little curiosity can take you a long way.');
    utter.lang = 'en-US'; utter.rate = settings.speechRate;
    const voice = speechSynthesis.getVoices().find(item => item.voiceURI === settings.speechVoice);
    if (voice) utter.voice = voice;
    utter.onend = utter.onerror = () => { preview = null; $('preview-voice').textContent = '试听声音'; };
    preview = utter;
    speechSynthesis.speak(utter);
    $('preview-voice').textContent = '停止试听';
  };
  window.speechSynthesis?.addEventListener('voiceschanged', voiceOptions);
  window.addEventListener('pagehide', () => { if (preview) speechSynthesis.cancel(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) { settings = Core.normalizeSettings(changes.settings.newValue); render(); }
  });
  initialize();
})();
