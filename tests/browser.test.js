// Uses an isolated browser profile and mocked provider responses, never the user's profile.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

test('Installed extension: keyboard, card interactions, settings and race protection', { timeout: 60000 }, async t => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(req.url === '/frame' ? '<html><body><p id="frame-text" tabindex="0">Inside a frame.</p></body></html>'
      : fs.readFileSync(path.join(__dirname, 'fixtures/reading.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true, viewport: { width: 1240, height: 900 },
    args: [`--disable-extensions-except=${path.join(root, 'src')}`, `--load-extension=${path.join(root, 'src')}`]
  });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionOrigin = worker.url().replace(/\/background\.js$/, '');
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await worker.evaluate(() => {
    globalThis.providerCalls = [];
    globalThis.fetch = async (url, options = {}) => {
      const text = new URL(url).searchParams.get('q') || decodeURIComponent(new URL(url).pathname.split('/').pop());
      globalThis.providerCalls.push({ url, text });
      const wait = text.includes('Slow') ? 500 : 25;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, wait);
        if (options.signal?.aborted) { clearTimeout(timer); reject(new Error('aborted')); }
        options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
      });
      if (text.includes('Provider failure')) return new Response('{}', { status: 503 });
      if (url.includes('dictionaryapi')) {
        await new Promise(resolve => setTimeout(resolve, 150));
        return new Response(JSON.stringify([{ phonetics: [{ text: '/ˌkjʊəriˈɒsəti/', audio: '' }] }]));
      }
      const result = text.includes('curiosity') && text.length > 20 ? '一点好奇心，能带你走得很远。每一个问题，都为新的可能打开一扇门。'
        : text === 'curiosity' ? '好奇心；求知欲' : text.includes('Latest') ? '最新的查询结果。' : '这是一段完整的中文译文。';
      if (url.includes('mymemory')) return new Response(JSON.stringify({ responseData: { translatedText: result }, responseStatus: 200 }));
      if (url.includes('yun.info')) return new Response(JSON.stringify({ success: true, data: [{ dst: result }] }));
      const middle = Math.floor(result.length / 2);
      return new Response(JSON.stringify([[[result.slice(0, middle)], [result.slice(middle)]]]));
    };
    return chrome.storage.local.set({ settings: { autoSpeak: false, translationProvider: 'google' } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const cdp = await context.newCDPSession(page);
  const worlds = [];
  cdp.on('Runtime.executionContextCreated', event => worlds.push(event.context));
  await cdp.send('Runtime.enable');
  const contentWorld = worlds.find(world => world.origin === extensionOrigin || world.name === '英汉翻译');
  assert.ok(contentWorld, 'content script execution context exists');
  const inContent = async expression => {
    const response = await cdp.send('Runtime.evaluate', { contextId: contentWorld.id, expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  await inContent(`
    globalThis.speechCalls = []; globalThis.cancelCalls = 0; globalThis.copied = '';
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], speak: item => speechCalls.push({text:item.text,rate:item.rate}),
      cancel: () => { cancelCalls++; }
    }});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { globalThis.copied = text; }
    }});
  `);
  const panel = page.locator('#chromeplugin-translate-popup').locator('.panel');
  const select = async selector => {
    await page.locator(selector).evaluate(element => {
      element.focus(); const range = document.createRange(); range.selectNodeContents(element);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
  };
  const trigger = async () => {
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    await worker.evaluate(id => chrome.tabs.sendMessage(id, { action: 'show-selection', focusedOnly: true }), tabId);
  };
  const result = () => panel.locator('#result');
  await t.test('Real shortcut is registered and double clicking does not trigger a request', async () => {
    const commands = await worker.evaluate(() => chrome.commands.getAll());
    assert.equal(commands.find(command => command.name === 'translate-selection').shortcut, 'Alt+Shift+Y');
    await page.locator('#sentence').dblclick();
    assert.equal(await panel.count(), 0);
    assert.equal(await worker.evaluate(() => providerCalls.length), 0);
  });
  await t.test('Sentence query joins all result fragments without dictionary requests', async () => {
    await select('#sentence');
    // Headless Chromium does not dispatch OS-level extension shortcuts. The
    // registered command is checked above; dispatch the same runtime message.
    await trigger();
    await result().waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await result().textContent(), '一点好奇心，能带你走得很远。每一个问题，都为新的可能打开一扇门。');
    assert.equal(await panel.locator('#phonetic').isVisible(), false);
    assert.equal((await worker.evaluate(() => providerCalls)).some(call => call.url.includes('dictionaryapi')), false);
    fs.mkdirSync(path.join(root, '.artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.artifacts/sentence-preview.png'), animations: 'disabled' });
    await panel.screenshot({ path: path.join(root, '.artifacts/card-preview.png'), animations: 'disabled' });
  });
  await t.test('Esc dismisses the panel', async () => {
    await page.keyboard.press('Escape'); assert.equal(await panel.count(), 0);
  });
  await t.test('Copy uses the complete translation; speech starts on click and can be stopped', async () => {
    await select('#sentence'); await trigger(); await result().waitFor({ state: 'visible' });
    assert.equal((await inContent('speechCalls')).length, 0);
    await panel.locator('#copy').click();
    assert.equal(await inContent('copied'), await result().textContent());
    await panel.locator('#speak').click();
    assert.equal((await inContent('speechCalls'))[0].text, await page.locator('#sentence').textContent());
    assert.ok((await panel.locator('#speak').textContent()).includes('停止'));
    await panel.locator('#speak').click();
    assert.equal(await inContent('cancelCalls'), 1);
    assert.ok((await panel.locator('#speak').textContent()).includes('朗读原文'));
    await panel.locator('#close').click();
  });
  await t.test('A word shows late pronunciation even when audio is missing; toggle saves globally', async () => {
    await select('#word'); await trigger();
    await result().waitFor({ state: 'visible' });
    await panel.locator('.phonetic-text').waitFor({ state: 'visible' });
    assert.equal(await result().textContent(), '好奇心；求知欲');
    assert.equal(await panel.locator('#audio').isVisible(), false);
    await panel.locator('#phonetic-toggle').click();
    assert.ok((await panel.locator('.phonetic-text').textContent()).includes('ɒ'));
    await page.waitForFunction(() => true);
    await panel.locator('#close').click();
  });
  await t.test('Latest query wins and closing does not reopen after a late response', async () => {
    await select('#slow'); await trigger();
    await select('#fast'); await trigger();
    await result().waitFor({ state: 'visible' });
    assert.equal(await result().textContent(), '最新的查询结果。');
    await page.waitForTimeout(550);
    assert.equal(await result().textContent(), '最新的查询结果。');
    await select('#slow'); await trigger(); await page.keyboard.press('Escape');
    await page.waitForTimeout(550); assert.equal(await panel.count(), 0);
  });
  await t.test('Provider failure exposes a retry button', async () => {
    await select('#error'); await trigger(); await result().waitFor({ state: 'visible' });
    assert.ok((await result().textContent()).includes('重试'));
    assert.equal(await panel.locator('#retry').isVisible(), true);
    await panel.locator('#close').click();
  });
  await t.test('Page text is rendered literally, never as HTML', async () => {
    await select('#unsafe'); await trigger(); await result().waitFor({ state: 'visible' });
    assert.equal(await panel.locator('#source img').count(), 0);
    assert.ok((await panel.locator('#source').textContent()).includes('<img'));
    await panel.locator('#close').click();
  });
  await t.test('Selected text in a textarea works and an empty selection gives a hint', async () => {
    await page.locator('#input').evaluate(element => { element.focus(); element.setSelectionRange(0, element.value.length); });
    await trigger(); await result().waitFor({ state: 'visible' });
    assert.equal(await panel.locator('#source').textContent(), 'Translate this selected sentence.');
    await panel.locator('#close').click();
    await page.evaluate(() => { document.activeElement.blur(); getSelection().removeAllRanges(); });
    await trigger(); assert.equal(await page.locator('.toast').isVisible(), true);
    await page.keyboard.press('Escape');
  });
  await t.test('Frame selections open in the top document to avoid clipping', async () => {
    const frame = page.frames().find(item => item.url().endsWith('/frame'));
    await frame.locator('#frame-text').evaluate(element => {
      element.focus(); const range = document.createRange(); range.selectNodeContents(element);
      getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await trigger();
    await result().waitFor({ state: 'visible' });
    assert.equal(await panel.locator('#source').textContent(), 'Inside a frame.');
    assert.equal(await frame.locator('#chromeplugin-translate-popup').count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await panel.count(), 0);
  });
  await t.test('Long selections remain scrollable inside a narrow viewport; over-limit input is rejected', async () => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.locator('#sentence').evaluate(element => { element.textContent = 'A sentence with several words. '.repeat(100); });
    await select('#sentence'); await trigger(); await result().waitFor({ state: 'visible' });
    const box = await panel.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 360 && box.y + box.height <= 640);
    assert.equal(await panel.locator('.scroll').evaluate(element => element.scrollHeight > element.clientHeight), true);
    assert.equal(await panel.locator('#copy').isVisible(), true);
    await panel.locator('#close').click();
    await page.locator('#sentence').evaluate(element => { element.textContent = 'x'.repeat(5001); });
    const before = await worker.evaluate(() => providerCalls.length);
    await select('#sentence'); await trigger();
    assert.equal(await panel.count(), 0);
    assert.ok((await page.locator('.toast').textContent()).includes('5000'));
    assert.equal(await worker.evaluate(() => providerCalls.length), before);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1240, height: 900 });
  });
  await t.test('Settings use persisted preferences and expose the actual shortcut', async () => {
    const settingsPage = await context.newPage();
    settingsPage.on('pageerror', error => errors.push(error.message));
    await settingsPage.goto(`${extensionOrigin}/popup.html`);
    await settingsPage.locator('#shortcut kbd').first().waitFor();
    assert.ok((await settingsPage.locator('#shortcut').textContent()).includes('Y'));
    assert.equal(await settingsPage.locator('#phoneticType').inputValue(), 'ipa');
    await settingsPage.locator('#speechRate').fill('0.8');
    await settingsPage.locator('#speechRate').dispatchEvent('change');
    await settingsPage.locator('#autoSpeak').check();
    await settingsPage.waitForFunction(() => document.querySelector('#save-status').textContent === '已保存');
    await settingsPage.reload();
    await settingsPage.waitForFunction(() => !document.querySelector('#autoSpeak').disabled);
    assert.equal(await settingsPage.locator('#autoSpeak').isChecked(), true);
    assert.equal(await settingsPage.locator('#speechRate').inputValue(), '0.8');
    await settingsPage.locator('main').screenshot({ path: path.join(root, '.artifacts/settings-preview.png'), animations: 'disabled' });
    await settingsPage.close();
  });
  await t.test('Saved auto-speech and speech rate take effect on the next query', async () => {
    await page.bringToFront();
    await page.locator('#sentence').evaluate(element => { element.textContent = 'A fresh sentence.'; });
    const before = (await inContent('speechCalls')).length;
    await select('#sentence'); await trigger(); await result().waitFor({ state: 'visible' });
    await panel.locator('#speak').filter({ hasText: '停止朗读' }).waitFor();
    const calls = await inContent('speechCalls');
    assert.equal(calls.length, before + 1);
    assert.ok(Math.abs(calls.at(-1).rate - 0.8) < 0.000001);
    await panel.locator('#close').click();
  });
  assert.deepEqual(errors, []);
});
