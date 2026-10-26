const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test',
  'tests/translation.test.js', 'tests/translation_api_config.test.js',
  'tests/dj_phonetic_convert.test.js', 'tests/refactoring.test.js'
], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
process.exitCode = result.status ?? 1;
