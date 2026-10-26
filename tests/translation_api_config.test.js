const { test } = require('node:test');
const assert = require('node:assert/strict');
const { backgroundHarness, response } = require('./background-harness');

test('Actual service worker combines Google fragments', async () => {
  const app = backgroundHarness(async () => response([[['一句。'], ['两句。']]]));
  const result = await app.run("handleTranslation('One. Two.', false, 1)");
  assert.equal(result.result, '一句。两句。');
});
test('HTTP errors fall back instead of displaying error bodies', async () => {
  const calls = [];
  const app = backgroundHarness(async url => {
    calls.push(url);
    return url.includes('googleapis') ? response([[['wrong']]], 503)
      : response({ responseStatus: 200, responseData: { translatedText: '备用译文' } });
  });
  assert.equal((await app.run("handleTranslation('hello', false, 1)")).result, '备用译文');
  assert.equal(calls.length, 2);
});
test('Disabled Baidu provider is isolated by tab, expires and is removed on tab close', async () => {
  const calls = [];
  const app = backgroundHarness(async url => {
    calls.push(new URL(url).hostname);
    return url.includes('yun.info') ? response({ errorCode: 'BAIDU_PROVIDER_DISABLED' }, 500)
      : response({ responseData: { translatedText: '你好' } });
  });
  await app.run("handleTranslation('hello', true, 0)");
  calls.length = 0;
  await app.run("handleTranslation('hello', true, 0)");
  assert.deepEqual(calls, ['api.mymemory.translated.net']);
  await app.run("handleTranslation('hello', true, 2)");
  assert.ok(calls.includes('api.yun.info'));
  app.run('tabBaiduDisabled.set(0, Date.now() - BAIDU_DISABLED_TIMEOUT - 1)');
  assert.equal(app.run('isTabBaiduDisabled(0)'), false);
  app.listeners.removed(2);
  assert.equal(app.run('isTabBaiduDisabled(2)'), false);
});
test('Long text is split within provider limits with no truncation', async () => {
  const inputs = [];
  const app = backgroundHarness(async url => {
    const text = new URL(url).searchParams.get('q'); inputs.push(text);
    return response({ success: true, data: [{ dst: text }] });
  });
  const original = 'internationalization'.repeat(80);
  const result = await app.run(`handleTranslation('${original}', true, 1)`);
  assert.equal(result.result, original);
  assert.ok(inputs.length > 1);
  assert.ok(inputs.every(text => Buffer.byteLength(text) <= 450));
});
test('Empty and oversized input never reaches a provider', async () => {
  let calls = 0;
  const app = backgroundHarness(async () => { calls++; });
  assert.equal((await app.run("handleTranslation('', false, 1)")).success, false);
  assert.equal((await app.run("handleTranslation('a'.repeat(5001), false, 1)")).success, false);
  assert.equal(calls, 0);
});
test('Dictionary returns pronunciation without audio and refuses sentences', async () => {
  let calls = 0;
  const app = backgroundHarness(async () => { calls++; return response([{ phonetics: [{ text: '/test/', audio: 'javascript:bad' }] }]); });
  const result = await app.run("getDictionary('test')");
  assert.equal(result.pron, '/test/'); assert.equal(result.audio, '');
  await app.run("getDictionary('a sentence')");
  assert.equal(calls, 1);
});
test('A new query cancels the old request; a stale cancel cannot cancel the new one', async () => {
  const requests = [];
  const app = backgroundHarness((url, options) => new Promise((resolve, reject) => {
    requests.push({ resolve, signal: options.signal });
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const first = app.message({ action: 'translate', text: 'first', requestId: 'a' });
  await new Promise(resolve => setImmediate(resolve));
  const second = app.message({ action: 'translate', text: 'second', requestId: 'b' });
  await new Promise(resolve => setImmediate(resolve));
  app.listeners.message({ action: 'cancel', requestId: 'a' }, { tab: { id: 1 }, frameId: 0 }, () => {});
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[1].signal.aborted, false);
  requests[1].resolve(response([[['最新结果']]]));
  assert.equal((await second).result, '最新结果');
  assert.equal((await first).success, false);
});
test('Requests time out and return a retryable failure', async () => {
  const app = backgroundHarness((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')));
  }), { setTimeout: (callback, ms) => setTimeout(callback, ms === 6500 ? 5 : 30) });
  const result = await app.run("handleTranslation('hello', false, 1)");
  assert.equal(result.success, false);
  assert.ok(result.error);
});
test('Saved provider setting overrides automatic routing', async () => {
  const calls = [];
  const app = backgroundHarness(async url => { calls.push(url); return response({ success: true, data: [{ dst: '你好' }] }); },
    { settings: { translationProvider: 'chinese' } });
  await app.message({ action: 'translate', requestId: '1', text: 'hello', language: 'en-US', timezone: 'America/New_York' });
  assert.ok(calls[0].includes('api.yun.info'));
});
test('Keyboard commands dispatch to the active tab; selection menus render in the top frame', async () => {
  const app = backgroundHarness(async () => response({}));
  await app.listeners.command('translate-selection', { id: 5 });
  assert.equal(app.badge[0][0], 5);
  assert.equal(app.badge[0][1].focusedOnly, true);
  app.listeners.context({ menuItemId: 'translate-selection', frameId: 3, selectionText: 'sentence' }, { id: 8 });
  await new Promise(resolve => setImmediate(resolve));
  const sent = app.badge.find(item => Array.isArray(item) && item[0] === 8);
  assert.equal(sent[1].text, 'sentence'); assert.equal(sent[2].frameId, 0);
});
test('Audio playback uses only the recordings from the matching dictionary lookup', async () => {
  const url = 'https://api.dictionaryapi.dev/media/pronunciations/en/quantity-us.mp3';
  const app = backgroundHarness(async () => response([{ phonetics: [{ text: '/test/', audio: url }] }]));
  await app.message({ action: 'dictionary', text: 'quantity', requestId: 'query' });
  assert.equal((await app.message({ action: 'play-dictionary', requestId: 'other', playbackId: 'a' })).success, false);
  const result = await app.message({ action: 'play-dictionary', requestId: 'query', playbackId: 'b', url: 'https://unrelated.example' });
  assert.equal(result.success, true);
  assert.equal(app.audioMessages[0].urls[0], url);
  assert.equal(app.audioMessages[0].playbackId, 'b');
  app.listeners.message({ action: 'cancel', requestId: 'query' }, { tab: { id: 1 }, frameId: 0 }, () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.audioMessages.at(-1).action, 'stop');
  assert.equal(app.run('dictionaryResults.size'), 0);
});
test('Closing while the audio document opens never starts a delayed recording', async () => {
  const app = backgroundHarness(async () => response([{ phonetics: [{ audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/quantity-us.mp3' }] }]));
  await app.message({ action: 'dictionary', text: 'quantity', requestId: 'query' });
  let finishOpening;
  app.context.chrome.offscreen.createDocument = () => new Promise(resolve => { finishOpening = resolve; });
  const playing = app.message({ action: 'play-dictionary', requestId: 'query', playbackId: 'audio' });
  await new Promise(resolve => setImmediate(resolve));
  app.listeners.message({ action: 'cancel', requestId: 'query' }, { tab: { id: 1 }, frameId: 0 }, () => {});
  finishOpening();
  assert.equal((await playing).cancelled, true);
  assert.equal(app.audioMessages.filter(message => message.action === 'play').length, 0);
});
