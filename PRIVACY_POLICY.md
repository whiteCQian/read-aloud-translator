# Privacy Policy

Last updated: October 23, 2026

This policy describes the network and local data handling in the English-Chinese Translation Chrome Extension.

## Text sent to external services

When you trigger a lookup with the keyboard shortcut or the selection context menu, the extension sends the selected text to translation services. Each lookup is limited to 5,000 characters:

- In automatic mode, the extension checks the browser language and time zone locally. A Chinese language and a configured mainland China, Hong Kong, Macau or Taipei time zone select `https://api.yun.info/api/translate`; other combinations select `https://translate.googleapis.com/translate_a/single`. You can override this preference in settings. Either route can fall back to `https://api.mymemory.translated.net/get` on failure. Longer selections are split into smaller requests when needed.
- For single English words, it also sends the selected word to `https://api.dictionaryapi.dev` to look up pronunciation and audio. Sentences do not trigger dictionary requests. Clicking dictionary pronunciation loads a recording in the extension's own audio document, independently of the website's audio policy. Allowed recording sources are the pronunciation paths on `api.dictionaryapi.dev`, `ssl.gstatic.com` and `upload.wikimedia.org`; legacy protocol-relative URLs are upgraded to HTTPS. Failed recordings can be retried using other URLs from the same lookup. If all recordings fail, the extension clearly indicates a switch to browser speech synthesis. Recording addresses are held in memory for the active lookup, not saved as history.

The translation and dictionary providers receive the text included in each request and may receive normal connection metadata, such as your IP address. Their handling of this information is governed by their own policies. The extension does not automatically send the full page. It does not use device geolocation or log selected text, request URLs, or translations in production.

## Speech and local storage

- Text-to-speech uses the browser's `SpeechSynthesis` API. Whether a selected voice works offline depends on the browser, operating system, and voice provider.
- Auto-speech, speech rate, selected voice, phonetic display and translation route preferences are stored in the extension's `chrome.storage.local`, shared across websites. Query text and translation history are not saved. The previous website-specific phonetic preference is no longer read or written; an existing value may remain until the website's storage is cleared.
- Copying a translation writes that translation to the system clipboard only when you click the copy button. The extension does not read the clipboard.
- The extension source contains no analytics or account service. It does not send browsing history to the developer.

## Contact

For questions, contact the maintainers through [GitHub Issues](https://github.com/whiteCQian/read-aloud-translator/issues).

---

# 隐私政策

最后更新：2026 年 10 月 23 日

本政策说明英汉翻译 Chrome 插件的网络请求和本地数据处理方式。

## 发往外部服务的文本

使用快捷键或右键菜单触发查询时，插件会将选中文字发送给翻译服务。每次最多 5,000 个字符：

- 自动模式在本地检查浏览器语言和时区。中文语言与配置的中国大陆、香港、澳门或台北时区组合会优先使用 `https://api.yun.info/api/translate`；其他组合优先使用 `https://translate.googleapis.com/translate_a/single`。可以在设置中手动选择。两条路由失败时都可改用 `https://api.mymemory.translated.net/get`；长文本按需要拆分成多次请求。
- 只有单个英文单词会额外发送到 `https://api.dictionaryapi.dev` 查询音标和发音，句段不查询词典。点击词典发音时，扩展自己的音频文档会请求录音，独立于网页的音频策略。仅允许 `api.dictionaryapi.dev`、`ssl.gstatic.com` 和 `upload.wikimedia.org` 上配置的录音路径，旧版无协议地址会升级为 HTTPS。录音失败时可尝试同次词典查询中的其他地址；全部失败后会明确提示并切换为浏览器朗读。录音地址仅为当前查询暂存在内存中，不保存为历史。

翻译和词典服务会收到请求中的文本，也可能收到 IP 地址等常规连接信息。它们如何处理这些数据由各自的政策决定。插件不会自动上传整页内容，不读取设备地理位置，生产日志不输出选中文字、请求 URL 或译文。

## 语音和本地存储

- 文本朗读使用浏览器的 `SpeechSynthesis` API。所选语音能否离线使用，取决于浏览器、操作系统和语音提供方。
- 自动朗读、语速、所选声音、音标格式和翻译路由保存在扩展自己的 `chrome.storage.local` 中，跨网站通用；不保存查询文字或翻译历史。旧版网站内的音标偏好不再读取或写入，已有值可能保留至网站存储被清除。
- 只有点击复制按钮时，才将当前译文写入系统剪贴板；插件不读取剪贴板。
- 插件源码中没有分析统计或账户服务，也不会向开发者发送浏览历史。

## 联系方式

如有疑问，可通过 [GitHub Issues](https://github.com/whiteCQian/read-aloud-translator/issues)联系维护者；请勿公开个人信息或敏感选文。
