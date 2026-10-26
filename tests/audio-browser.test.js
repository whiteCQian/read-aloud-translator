const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

function silentWave(seconds = 2) {
  const size = 8000 * seconds * 2;
  const wav = Buffer.alloc(44 + size);
  wav.write('RIFF'); wav.writeUInt32LE(36 + size, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(size, 40);
  return wav;
}

test('Dictionary recording works on a page that blocks media', { timeout: 30000 }, async t => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "media-src 'none'");
    res.end('<html><body><p id="word" tabindex="0">quantity</p></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const extension = path.resolve(__dirname, '../src');
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    globalThis.fetch = async url => new Response(JSON.stringify(url.includes('/entries/')
      ? [{ phonetics: [
        { text: '/ˈkwɑntəti/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/quantity-missing.mp3' },
        { text: '/ˈkwɒntəti/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/quantity-us.mp3' }
      ] }] : [[['数量']]]));
    return chrome.storage.local.set({ settings: { translationProvider: 'google', autoSpeak: false } });
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const pageCDP = await context.newCDPSession(page);
  const worlds = [];
  pageCDP.on('Runtime.executionContextCreated', event => worlds.push(event.context));
  await pageCDP.send('Runtime.enable');
  const world = worlds.find(item => item.name === '英汉翻译');
  assert.ok(world);
  const inContent = async expression => {
    const reply = await pageCDP.send('Runtime.evaluate', { contextId: world.id, expression,
      awaitPromise: true, returnByValue: true });
    assert.ok(!reply.exceptionDetails);
    return reply.result.value;
  };
  await inContent(`globalThis.speechCalls = []; Object.defineProperty(window, 'speechSynthesis', {value:{
    getVoices:()=>[], speak:item=>speechCalls.push(item.text), cancel:()=>{}
  }}); void 0;`);
  await page.locator('#word').evaluate(element => {
    element.focus(); const range = document.createRange(); range.selectNodeContents(element);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  });
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
  await worker.evaluate(id => chrome.tabs.sendMessage(id, { action: 'show-selection', focusedOnly: true }), tabId);
  const panel = page.locator('#chromeplugin-translate-popup').locator('.panel');
  await panel.locator('#audio').waitFor({ state: 'visible' });
  // Playwright does not route requests from OFFSCREEN_DOCUMENT targets. Attach
  // to that actual document to mock HTTP only, leaving Audio and decoding real.
  await worker.evaluate(() => ensureAudioDocument());
  const browserCDP = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCDP.send('Target.getTargets');
  const target = targetInfos.find(info => info.url.endsWith('/audio.html'));
  assert.ok(target, 'the extension has an offscreen audio document');
  const { sessionId } = await browserCDP.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  const pending = new Map(); let messageId = 0;
  browserCDP.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  });
  const evaluateAudio = async expression => {
    const id = ++messageId;
    const reply = new Promise(resolve => pending.set(id, resolve));
    await browserCDP.send('Target.sendMessageToTarget', { sessionId,
      message: JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }) });
    const result = await reply;
    assert.ok(!result.error && !result.result?.exceptionDetails, JSON.stringify(result));
    return result.result.result.value;
  };
  await evaluateAudio(`globalThis.playedSounds = []; const NativeAudio = Audio;
    globalThis.Audio = function(url) { const sound = new NativeAudio(url); playedSounds.push(sound); return sound; };
    globalThis.recordingRequests = []; globalThis.fetch = async url => {
    recordingRequests.push(url);
    if (url.includes('missing')) return new Response('not found', {status:404});
    return new Response(Uint8Array.from(atob('${silentWave().toString('base64')}'), c => c.charCodeAt(0)), {headers:{'content-type':'audio/wav'}});
  };`);
  await panel.locator('#audio').click();
  await page.waitForFunction(() => {
    const root = document.getElementById('chromeplugin-translate-popup')?.shadowRoot;
    return root?.querySelector('#speak')?.dataset.speaking === 'true'
      && !root.querySelector('#audio').hasAttribute('aria-busy');
  }, null, { timeout: 6000 });
  assert.equal((await evaluateAudio('recordingRequests')).length, 2, 'broken recording is skipped before the valid recording');
  assert.equal(await panel.locator('#hint').isVisible(), false);
  assert.deepEqual(await inContent('speechCalls'), [], 'successful recording does not use synthetic speech');
  await panel.locator('#speak').click();
  assert.equal(await panel.locator('#speak').getAttribute('data-speaking'), 'false');
  assert.equal(await evaluateAudio(`new Promise(resolve => {
    const timer = setInterval(() => { if (playedSounds.every(sound => sound.paused && !sound.getAttribute('src'))) {
      clearInterval(timer); resolve(true);
    } }, 10);
    setTimeout(() => { clearInterval(timer); resolve(false); }, 2000);
  })`), true, 'stop releases the real audio element');

  await evaluateAudio(`globalThis.fetch = async () => new Response('not found', {status:404})`);
  await panel.locator('#audio').click();
  await page.waitForFunction(() => document.getElementById('chromeplugin-translate-popup')?.shadowRoot
    .querySelector('#hint').textContent.includes('已切换为浏览器朗读'), null, {timeout:5000});
  assert.deepEqual(await inContent('speechCalls'), ['quantity']);
  await panel.locator('#speak').click();

  await evaluateAudio(`globalThis.waitingForAudio = false; globalThis.fetch = (url, {signal}) => {
    waitingForAudio = true;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled'))));
  };`);
  await panel.locator('#audio').click();
  assert.equal(await evaluateAudio(`new Promise(resolve => {
    const timer = setInterval(() => { if (waitingForAudio) { clearInterval(timer); resolve(true); } }, 10);
    setTimeout(() => { clearInterval(timer); resolve(false); }, 2000);
  })`), true);
  await panel.locator('#close').click();
  await page.waitForTimeout(200);
  assert.equal(await panel.count(), 0);
  assert.deepEqual(await inContent('speechCalls'), ['quantity'], 'closing during load never triggers delayed fallback speech');
});
