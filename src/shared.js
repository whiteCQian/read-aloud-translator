/* Shared by the service worker, content script and settings page. */
(() => {
  const DEFAULT_SETTINGS = Object.freeze({
    autoSpeak: false, speechRate: 1, speechVoice: '', phoneticType: 'dj', translationProvider: 'auto'
  });
  const MAX_TEXT_LENGTH = 5000;

  function normalizeSettings(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return {
      autoSpeak: value.autoSpeak === true,
      speechRate: Math.max(0.5, Math.min(1.5, Number(value.speechRate) || 1)),
      speechVoice: typeof value.speechVoice === 'string' ? value.speechVoice : '',
      phoneticType: value.phoneticType === 'ipa' ? 'ipa' : 'dj',
      translationProvider: ['auto', 'google', 'chinese'].includes(value.translationProvider)
        ? value.translationProvider : 'auto'
    };
  }

  function detectChineseUser(language = '', timezone = '') {
    return /^zh\b/i.test(language) && [
      'Asia/Shanghai', 'Asia/Urumqi', 'Asia/Harbin', 'Asia/Chongqing',
      'Asia/Kashgar', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei'
    ].includes(timezone);
  }

  function isWord(text) { return /^[a-z]+(?:['’\-][a-z]+)*$/i.test(text.trim()); }

  // MyMemory limits each query by UTF-8 bytes. Never split a surrogate pair.
  function splitText(text, maxBytes = 450) {
    const encoder = new TextEncoder();
    const chunks = [];
    let remaining = text;
    while (remaining) {
      let bytes = 0, end = 0, boundary = 0;
      for (const character of remaining) {
        const size = encoder.encode(character).length;
        if (bytes + size > maxBytes) break;
        bytes += size;
        end += character.length;
        if (/[\s.!?;。！？；]/u.test(character)) boundary = end;
      }
      if (!end) throw new Error('分段长度过小');
      if (end < remaining.length && boundary > end / 3) end = boundary;
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    return chunks;
  }

  function parseGoogle(data) {
    if (!Array.isArray(data?.[0])) return null;
    const text = data[0].map(part => typeof part?.[0] === 'string' ? part[0] : '').join('');
    return text.trim() || null;
  }
  function parseBaidu(data) {
    if (!data?.success || !Array.isArray(data.data)) return null;
    return data.data.map(part => typeof part?.dst === 'string' ? part.dst : '').join('\n').trim() || null;
  }
  function parseMyMemory(data) {
    if (Number(data?.responseStatus || 200) !== 200) return null;
    const value = data?.responseData?.translatedText;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  function parseDictionary(data) {
    const phonetics = Array.isArray(data) ? data.flatMap(entry => Array.isArray(entry?.phonetics) ? entry.phonetics : []) : [];
    const pron = phonetics.find(item => typeof item?.text === 'string' && item.text)?.text || '';
    const audios = [...new Set(phonetics.map(item => normalizeAudioUrl(item?.audio)).filter(Boolean))].slice(0, 4);
    return { pron, audio: audios[0] || '', audios };
  }
  function normalizeAudioUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.startsWith('//') ? `https:${value}` : value);
      const allowed = {
        'https://api.dictionaryapi.dev': '/media/pronunciations/',
        'https://ssl.gstatic.com': '/dictionary/static/',
        'https://upload.wikimedia.org': '/wikipedia/commons/'
      };
      return !url.username && !url.password && allowed[url.origin] && url.pathname.startsWith(allowed[url.origin])
        ? url.href : '';
    } catch { return ''; }
  }
  function normalizeIPA(ipa, type = 'dj') {
    let s = String(ipa || '').replace(/[\/\[\]]/g, '');
    if (type === 'ipa') return s.replace(/\s+/g, ' ').trim();
    return s.replace(/\(([^)]+)\)/g, '$1')
      .replace(/l\u0329/g, 'əl').replace(/n\u0329/g, 'ən').replace(/m\u0329/g, 'əm')
      .replace(/ɹ/g, 'r').replace(/ɾ/g, 't').replace(/ɘ/g, 'i')
      .replace(/ɒ/g, 'ɔ').replace(/ɜː/g, 'ə:').replace(/ɜ/g, 'ə').replace(/ɡ/g, 'g')
      .replace(/d͡ʒ|dʒ/g, 'ʤ').replace(/t͡ʃ|tʃ/g, 'ʧ')
      .replace(/ʊ/g, 'u').replace(/ɪ/g, 'i').replace(/ɑː/g, 'ɑ:')
      .replace(/ɔː/g, 'ɔ:').replace(/uː/g, 'u:').replace(/iː/g, 'i:')
      .replace(/əʊ/g, 'əu').replace(/oʊ/g, 'ou').replace(/ɛ/g, 'e').replace(/ɫ/g, 'l')
      .replace(/[.\s]/g, '').trim();
  }
  const api = { DEFAULT_SETTINGS, MAX_TEXT_LENGTH, normalizeSettings, detectChineseUser,
    isWord, splitText, parseGoogle, parseBaidu, parseMyMemory, parseDictionary, normalizeAudioUrl, normalizeIPA };
  globalThis.TranslationCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
