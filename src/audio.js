// A privileged extension document keeps playback independent of the page's media-src policy.
(() => {
  let current = null;
  const Core = globalThis.TranslationCore;

  function disposeSound(session) {
    if (session.audio) {
      session.audio.onended = session.audio.onerror = null;
      session.audio.pause(); session.audio.removeAttribute('src'); session.audio.load();
      session.audio = null;
    }
    if (session.blobUrl) { URL.revokeObjectURL(session.blobUrl); session.blobUrl = ''; }
  }
  function stop() {
    if (!current) return;
    const session = current; current = null;
    session.controller.abort(); clearTimeout(session.timer); disposeSound(session);
  }
  function notify(session, state) {
    chrome.runtime.sendMessage({ target: 'background', action: 'dictionary-audio-state',
      playbackId: session.id, state }).catch(() => {});
  }
  async function play(urls, playbackId) {
    stop();
    const session = { id: playbackId, controller: new AbortController(), audio: null, blobUrl: '' };
    current = session;
    // A dead server or a decoder that never starts must not leave the loading state stuck.
    session.timer = setTimeout(() => {
      session.controller.abort(); disposeSound(session);
    }, 12000);
    try {
      for (const candidate of urls) {
        if (current !== session || session.controller.signal.aborted) break;
        const url = Core.normalizeAudioUrl(candidate);
        if (!url) continue;
        const controller = new AbortController();
        const cancel = () => controller.abort();
        session.controller.signal.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, 3500);
        try {
          const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error' });
          if (!response.ok) continue;
          const type = response.headers.get('content-type') || '';
          if (type && !/^(audio\/|application\/ogg|application\/octet-stream|binary\/octet-stream)/i.test(type)) continue;
          if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024) continue;
          const blob = await response.blob();
          if (!blob.size || blob.size > 2 * 1024 * 1024 || current !== session || controller.signal.aborted) continue;
          session.blobUrl = URL.createObjectURL(blob);
          const sound = new Audio(session.blobUrl);
          session.audio = sound;
          const cancelled = new Promise((resolve, reject) => {
            controller.signal.addEventListener('abort', () => {
              disposeSound(session); reject(new Error('cancelled'));
            }, { once: true });
          });
          await Promise.race([sound.play(), cancelled]);
          if (current !== session || controller.signal.aborted) continue;
          sound.onended = () => { if (current === session) { stop(); notify(session, 'ended'); } };
          sound.onerror = () => { if (current === session) { stop(); notify(session, 'error'); } };
          clearTimeout(session.timer);
          return { success: true };
        } catch { /* Try the next recording before falling back to speech synthesis. */ }
        finally {
          clearTimeout(timer);
          session.controller.signal.removeEventListener('abort', cancel);
        }
        disposeSound(session);
      }
      return { success: false, cancelled: current !== session };
    } finally {
      if (current === session && (!session.audio || session.audio.paused)) stop();
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.target !== 'dictionary-player') return false;
    // Only the worker chooses the URLs; this document is never web-accessible.
    if (message.action === 'stop') {
      if (current?.id === message.playbackId) stop();
      respond({ success: true }); return false;
    }
    if (message.action !== 'play' || !Array.isArray(message.urls)) return false;
    play(message.urls, message.playbackId).then(respond).catch(() => respond({ success: false }));
    return true;
  });
})();
