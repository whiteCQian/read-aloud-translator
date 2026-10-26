const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function backgroundHarness(fetch, options = {}) {
  const listeners = {};
  const event = name => ({ addListener: listener => { listeners[name] = listener; } });
  const settings = options.settings || {};
  const badge = [];
  const audioMessages = [];
  let hasAudioDocument = false;
  const chrome = {
    runtime: { onMessage: event('message'), onInstalled: event('installed'), openOptionsPage: async () => {},
      getURL: file => `chrome-extension://test/${file}`,
      getContexts: async () => hasAudioDocument ? [{}] : [],
      sendMessage: async message => { audioMessages.push(message); return { success: true }; } },
    offscreen: { createDocument: async () => { hasAudioDocument = true; } },
    storage: { local: { get: async () => ({ settings }) } },
    commands: { onCommand: event('command') },
    tabs: { onRemoved: event('removed'), query: async () => [{ id: 1 }], sendMessage: async (...args) => badge.push(args) },
    contextMenus: { onClicked: event('context'), removeAll: callback => callback(), create: item => badge.push(item) },
    action: { setBadgeText: async item => badge.push(item), setBadgeBackgroundColor: async () => {}, setTitle: async () => {} }
  };
  const context = vm.createContext({ chrome, fetch, AbortController, TextEncoder, URL, console,
    setTimeout: options.setTimeout || setTimeout, clearTimeout, Date });
  context.importScripts = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  context.importScripts('background.js');
  return {
    context, listeners, badge, audioMessages,
    run: expression => vm.runInContext(expression, context),
    message: (request, sender = { tab: { id: 1 }, frameId: 0 }) => new Promise(resolve => listeners.message(request, sender, resolve))
  };
}
const response = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
module.exports = { backgroundHarness, response };
