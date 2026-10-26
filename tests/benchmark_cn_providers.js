/**
 * 中国用户翻译提供方基准测试
 * 评估 Baidu 代理 / MyMemory / Lingva 的成功率与响应时间
 *
 * 使用方式：
 *   node tests/benchmark_cn_providers.js [--runs=4] [--timeout=8000] [--json] [--quiet] [--only=baidu|mymemory|lingva]
 *   环境变量：
 *     BAIDU_PROXY_ENDPOINT 可覆盖默认的百度代理地址
 */

const DEFAULT_BAIDU_ENDPOINT = process.env.BAIDU_PROXY_ENDPOINT || 'https://api.yun.info/api/translate';
const DEFAULT_RUNS = Number(process.env.BENCH_RUNS || 4); // 5 texts * 4 runs = 20 per provider
const DEFAULT_TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS || 8000);

const cliArgs = process.argv.slice(2).reduce((acc, arg) => {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) acc[m[1]] = m[2];
  if (arg === '--json') acc.json = true;
  if (arg === '--quiet') acc.quiet = true;
  return acc;
}, {});

const runsPerText = Number(cliArgs.runs || DEFAULT_RUNS);
const requestTimeoutMs = Number(cliArgs.timeout || DEFAULT_TIMEOUT_MS);
const outputJson = Boolean(cliArgs.json);
const isQuiet = Boolean(cliArgs.quiet);
const onlyProvider = cliArgs.only ? String(cliArgs.only).toLowerCase() : '';

const sampleTexts = [
  'hello',
  'computer',
  'internationalization',
  'performance test',
  'matured'
];

const providers = {
  baidu: {
    name: 'Baidu Proxy',
    buildUrl: (text) => `${DEFAULT_BAIDU_ENDPOINT}?q=${encodeURIComponent(text)}&from=en&to=zh`,
    parse: (data) => Boolean(data && data.success && Array.isArray(data.data) && data.data[0]?.dst)
  },
  myMemory: {
    name: 'MyMemory',
    buildUrl: (text) => `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh`,
    parse: (data) => Boolean(data && data.responseData && typeof data.responseData.translatedText === 'string' && data.responseData.translatedText.length > 0)
  }
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const ok = res.ok;
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok, status: res.status, data };
  } finally {
    clearTimeout(id);
  }
}

async function runSingleRequest(providerKey, text) {
  const provider = providers[providerKey];
  const url = provider.buildUrl(text);
  const start = performance.now();
  try {
    const { ok, status, data } = await fetchWithTimeout(url, requestTimeoutMs);
    const parseOk = ok && provider.parse(data);
    const elapsedMs = Math.round(performance.now() - start);
    const preview = buildPreview(providerKey, data);
    return { providerKey, text, success: Boolean(parseOk), status, elapsedMs, error: parseOk ? null : 'parse_or_http_failed', preview };
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - start);
    const errName = error && error.name ? error.name : 'Error';
    const errMsg = error && error.message ? error.message : String(error);
    const errCode = (error && (error.code || (error.cause && error.cause.code))) || '';
    return { providerKey, text, success: false, status: 0, elapsedMs, error: errName, errorCode: errCode, errorMessage: errMsg, preview: '' };
  }
}

function buildPreview(providerKey, data) {
  try {
    if (providerKey === 'baidu') {
      const s = data && data.data && Array.isArray(data.data) && data.data[0] && data.data[0].dst ? data.data[0].dst : '';
      return truncate(String(s));
    }
    if (providerKey === 'myMemory') {
      const s = data && data.responseData && data.responseData.translatedText ? data.responseData.translatedText : '';
      return truncate(String(s));
    }
  } catch (_) {}
  return '';
}

function truncate(str, max = 120) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function summarize(results) {
  const byProvider = {};
  for (const r of results) {
    const bucket = byProvider[r.providerKey] || (byProvider[r.providerKey] = { total: 0, success: 0, times: [], failures: {} });
    bucket.total += 1;
    if (r.success) {
      bucket.success += 1;
      bucket.times.push(r.elapsedMs);
    } else {
      bucket.failures[r.error || 'unknown'] = (bucket.failures[r.error || 'unknown'] || 0) + 1;
    }
  }
  const summary = Object.entries(byProvider).map(([key, stat]) => {
    const successRate = stat.total ? (stat.success / stat.total) : 0;
    return {
      provider: key,
      name: providers[key].name,
      total: stat.total,
      success: stat.success,
      successRate: Number((successRate * 100).toFixed(1)),
      p50: percentile(stat.times, 50),
      p95: percentile(stat.times, 95),
      fastest: stat.times.length ? Math.min(...stat.times) : 0,
      slowest: stat.times.length ? Math.max(...stat.times) : 0,
      failures: stat.failures
    };
  }).sort((a, b) => b.successRate - a.successRate || a.p50 - b.p50);
  return summary;
}

async function runBenchmark() {
  const results = [];
  for (const text of sampleTexts) {
    for (let i = 0; i < runsPerText; i++) {
      for (const providerKey of Object.keys(providers)) {
        if (onlyProvider && providerKey.toLowerCase() !== onlyProvider) continue;
        const r = await runSingleRequest(providerKey, text);
        results.push(r);
        if (!outputJson && !isQuiet) {
          const name = providers[providerKey].name;
          const statusTxt = r.status ? r.status : 'ERR';
          const succTxt = r.success ? 'OK' : `FAIL(${r.error || ''})`;
          const preview = r.preview ? ` preview="${r.preview}"` : '';
          const codeTxt = r.errorCode ? ` code=${r.errorCode}` : '';
          const msgTxt = r.errorMessage ? ` msg="${truncate(r.errorMessage, 160)}"` : '';
          console.log(`[${name}] text="${text}" status=${statusTxt} time=${r.elapsedMs}ms ${succTxt}${codeTxt}${msgTxt}${preview}`);
        }
        // 避免过快请求同一服务
        await delay(200);
      }
    }
  }
  const summary = summarize(results);
  if (outputJson) {
    console.log(JSON.stringify({ runsPerText, requestTimeoutMs, texts: sampleTexts, summary }, null, 2));
  } else {
    console.log('\n===== 中国用户提供方基准测试 =====');
    console.log(`样本数: ${sampleTexts.length}，每个样本运行: ${runsPerText}，超时(ms): ${requestTimeoutMs}`);
    for (const s of summary) {
      console.log(`\n- 提供方: ${s.name} (${s.provider})`);
      console.log(`  成功率: ${s.success}/${s.total} (${s.successRate}%)`);
      console.log(`  延迟: p50=${s.p50}ms, p95=${s.p95}ms, min=${s.fastest}ms, max=${s.slowest}ms`);
      const failureKeys = Object.keys(s.failures || {});
      if (failureKeys.length) {
        console.log(`  失败原因: ${failureKeys.map(k => `${k}:${s.failures[k]}`).join(', ')}`);
      }
    }
    console.log('\n提示：可使用 --json 输出 JSON 结果，或设置 BAIDU_PROXY_ENDPOINT 覆盖默认百度代理地址。');
  }
}

if (require.main === module) {
  runBenchmark().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark };


