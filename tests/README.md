# 测试说明

## 离线回归

```bash
node tests/run-tests.js
# 或 npm test
```

测试直接导入 `src/shared.js`，并在模拟 Chrome API 的 VM 中执行真正的 `src/background.js`，不再复制生产实现。全部离线，不以接口报错作为通过条件。

- Google 多片段结果拼接、百度多段结果、MyMemory 配额错误。
- 英文单词/句段识别、UTF-8 分段完整性、路由和设置校验。
- HTTP 失败与备用服务、标签页隔离、3 小时到期、标签页关闭清理。
- 超时、取消、旧请求取消消息不能取消新请求、超长输入拒绝。
- 多录音地址、旧版音频 URL、音频来源校验、查询与录音请求关联、音频文档创建期间关闭查询。
- 118 个音标样本和 IPA 模式回归。
- Manifest 快捷键、资源、版本及嵌套网页配置。

`individual` 的旧样本将不完整的 `/ˌɘndɘˈvɘd͡ʒɘl/` 与另一种读音写法配对，导致探索时已有一项失败。现按 [Oxford 的 IPA](https://www.oxfordlearnersdictionaries.com/us/definition/english/individual_1) 修正输入，并按项目通用规则得出 DJ 显示值；没有添加单词特判。

## 浏览器交互回归

单独安装 `playwright`，并提供可加载本地扩展的 Chromium 浏览器。默认使用 Windows 上安装的 Microsoft Edge；测试会创建独立临时配置，关闭后释放浏览器。

```bash
npm run test:browser
```

可通过环境变量 `BROWSER_PATH` 指定浏览器路径，`PLAYWRIGHT_MODULE` 指定 Playwright 包路径。测试启动本地 HTTP 阅读页面并加载真实扩展，再模拟外部翻译和词典响应。

覆盖快捷键注册、移除双击触发、完整句子、单词音标、复制、朗读与停止、Esc、错误及重试入口、迟到响应、文本安全、输入框、嵌套网页、窄窗口滚动、长度限制和设置持久化。

`audio-browser.test.js` 另外在设置了 `media-src 'none'` 的网页上加载真实扩展。只替换音频 HTTP 响应，保留真实音频解码和播放（静音 WAV），验证录音地址失效后的回退、停止并释放播放器、全部失败后明确切换到浏览器朗读，以及加载中关闭不触发迟到声音。

无头浏览器不派发操作系统级扩展快捷键，测试检查真实注册结果后，使用与快捷键相同的消息路径触发查询。仍需在个人浏览器中验证快捷键是否与系统或其他扩展冲突。朗读和剪贴板在扩展隔离环境内被替换，测试不会出声或写入系统剪贴板。

界面截图写入被 Git 忽略的 `.artifacts/` 目录。测试通过不代表外部服务当前可达；在线可用性和真实声音需要人工验证。

## 在线基准

```bash
node tests/benchmark_cn_providers.js --runs=1 --timeout=8000
```

会向真实百度代理及 MyMemory 服务发送预设测试文本。它与离线回归独立，不作为常规测试前提。
