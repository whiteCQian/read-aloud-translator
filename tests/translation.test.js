const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/shared.js');

test('Google combines every sentence fragment and skips metadata', () => {
  assert.equal(Core.parseGoogle([[['你好。', 'Hello.'], ['明天见。', 'See you tomorrow.'], [null, 'metadata']]]), '你好。明天见。');
  assert.equal(Core.parseGoogle(null), null);
  assert.equal(Core.parseGoogle([[]]), null);
});
test('Baidu preserves every paragraph', () => {
  assert.equal(Core.parseBaidu({ success: true, data: [{ dst: '第一段' }, { dst: '第二段' }] }), '第一段\n第二段');
  assert.equal(Core.parseBaidu({ success: false, data: [{ dst: 'error' }] }), null);
});
test('MyMemory rejects quota and provider errors even with translatedText', () => {
  assert.equal(Core.parseMyMemory({ responseStatus: 429, responseData: { translatedText: 'quota exceeded' } }), null);
  assert.equal(Core.parseMyMemory({ responseStatus: 200, responseData: { translatedText: '你好' } }), '你好');
});
test('Word mode accepts contractions and hyphenated words, not sentences or markup', () => {
  for (const text of ['hello', "don't", 'well-known', 'we’re']) assert.equal(Core.isWord(text), true, text);
  for (const text of ['Hello world.', 'Hi!', '<img src=x>', '你好', '']) assert.equal(Core.isWord(text), false, text);
});
test('UTF-8 chunks preserve all characters, whitespace and Unicode pairs', () => {
  const text = ('A long sentence with punctuation!\n你好 😀 café. ').repeat(40);
  const chunks = Core.splitText(text);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(''), text);
  for (const chunk of chunks) {
    assert.ok(new TextEncoder().encode(chunk).length <= 450);
    assert.ok(!/[\uD800-\uDBFF]$/.test(chunk));
  }
});
test('Routing includes Hong Kong and requires Chinese language in auto mode', () => {
  assert.equal(Core.detectChineseUser('zh-HK', 'Asia/Hong_Kong'), true);
  assert.equal(Core.detectChineseUser('zh-CN', 'Asia/Shanghai'), true);
  assert.equal(Core.detectChineseUser('en-US', 'Asia/Shanghai'), false);
  assert.equal(Core.detectChineseUser('zh-CN', 'America/New_York'), false);
});
test('Settings validate saved input and preserve safe defaults', () => {
  assert.deepEqual(Core.normalizeSettings(), Core.DEFAULT_SETTINGS);
  assert.deepEqual(Core.normalizeSettings(null), Core.DEFAULT_SETTINGS);
  assert.equal(Core.normalizeSettings({ speechRate: 99 }).speechRate, 1.5);
  assert.equal(Core.normalizeSettings({ speechRate: -1 }).speechRate, 0.5);
  assert.equal(Core.normalizeSettings({ translationProvider: 'unknown', autoSpeak: 'true' }).autoSpeak, false);
});
test('Dictionary keeps alternate recordings, normalizes legacy URLs and rejects unrelated hosts', () => {
  const result = Core.parseDictionary([{ phonetics: [
    { text: '/test/', audio: '//ssl.gstatic.com/dictionary/static/sounds/test.mp3' },
    { audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/test-us.mp3' },
    { audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/test-us.mp3' },
    { audio: 'https://attacker.example/test.mp3' },
    { audio: 'https://api.dictionaryapi.dev/secret' }
  ] }]);
  assert.equal(result.pron, '/test/');
  assert.equal(result.audio, 'https://ssl.gstatic.com/dictionary/static/sounds/test.mp3');
  assert.equal(result.audios.length, 2);
  assert.equal(Core.normalizeAudioUrl('https://user:password@api.dictionaryapi.dev/media/pronunciations/test.mp3'), '');
});
