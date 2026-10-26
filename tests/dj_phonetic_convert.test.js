const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeIPA } = require('../src/shared.js');

// individual previously paired an incomplete IPA input with an unrelated expected
// output. Input corrected against Oxford; expected output uses the same mapping
// as all other rows: https://www.oxfordlearnersdictionaries.com/us/definition/english/individual_1
for (const line of fs.readFileSync(path.join(__dirname, 'dj_phonetic_list.txt'), 'utf8').split('\n')) {
  const [word, ipa, expected] = line.split(/\t|\s{2,}/);
  if (!word || !ipa || !expected) continue;
  test(`DJ conversion: ${word}`, () => assert.equal(normalizeIPA(ipa), expected.trim()));
}
test('IPA mode preserves the original pronunciation symbols', () => {
  assert.equal(normalizeIPA('/ˈhɛləʊ/', 'ipa'), 'ˈhɛləʊ');
});
