const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require('../src/manifest.json');

test('Every manifest entry exists, including shared code and settings assets', () => {
  const files = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(entry => entry.js), 'popup.css', 'audio.html', 'audio.js'];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, 'src', file)), file);
});
test('Extension declares a configurable shortcut, context menu and frame support', () => {
  assert.equal(manifest.commands['translate-selection'].suggested_key.default, 'Alt+Shift+Y');
  assert.ok(manifest.permissions.includes('contextMenus'));
  assert.equal(manifest.content_scripts[0].all_frames, true);
  assert.equal(manifest.version, require('../package.json').version);
});
