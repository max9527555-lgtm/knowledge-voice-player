import { flatten, progressIndex } from './structure.js';
import { storeProgress } from './db.js';
export class Player extends EventTarget {
  constructor(tts, settings) {
    super(); this.tts = tts; this.settings = settings; this.audio = new Audio(); this.audio.preload = 'auto';
    this.index = 0; this.time = 0; this.char = 0; this.state = 'paused'; this.token = 0; this.lastSave = 0;
    this.audio.addEventListener('timeupdate', () => { this.time = this.audio.currentTime; this.emit(); if (Date.now() - this.lastSave > 800) this.save(); });
    this.audio.addEventListener('ended', () => { if (this.state === 'playing') this.advance(); });
    this.audio.addEventListener('error', () => { if (this.state === 'playing') this.fail(Error('音频无法解码或播放，请换一段重试')); });
    this.audio.addEventListener('pause', () => { if (this.state === 'playing' && !this.audio.ended && this.settings.provider === 'azure') { this.state = 'paused'; this.save(); this.emit(); } });
    window.addEventListener('pagehide', () => { this.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    if ('mediaSession' in navigator) {
      for (const [action, handler] of Object.entries({ play: () => this.play(), pause: () => this.pause(), previoustrack: () => this.moveParagraph(-1), nexttrack: () => this.moveParagraph(1), seekto: e => this.seek(e.seekTime) })) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* platform dependent */ }
      }
    }
  }
  emit() { this.dispatchEvent(new Event('change')); }
  fail(error) { this.pause(); this.dispatchEvent(new CustomEvent('failure', { detail: error })); }
  load(book, progress) {
    this.pause(); this.release(); this.book = book; this.queue = flatten(book);
    this.index = progressIndex(this.queue, progress); this.time = Math.max(0, progress?.time || 0); this.char = Math.min(this.current.text.length, Math.max(0, progress?.char || 0));
    this.completed = !!progress?.completed; this.emit();
    if ('mediaSession' in navigator && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: book.title, artist: '知识语音播放器' });
  }
  get current() { return this.queue?.[this.index]; }
  snapshot() {
    if (!this.book || !this.current) return;
    return { id: this.book.id, ...this.current, text: undefined, time: this.time, char: this.char, index: this.index, total: this.queue.length, provider: this.settings.provider, voice: this.settings.voice, style: this.settings.style, completed: !!this.completed, at: Date.now() };
  }
  save() {
    const data = this.snapshot(); if (!data) return Promise.resolve(); this.lastSave = data.at;
    return storeProgress(data).catch(error => this.dispatchEvent(new CustomEvent('failure', { detail: error })));
  }
  release() {
    this.audio.removeAttribute('src'); this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url); this.url = null; this.loadedIdentity = null; this.loadedSignature = null;
  }
  pause() {
    ++this.token; this.abort?.abort(); this.abort = null; this.state = 'paused';
    this.audio.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); this.utterance = null; this.save(); this.emit();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }
  async play() {
    if (!this.current || this.state === 'playing' || this.state === 'loading') return;
    if (this.completed) { this.index = 0; this.time = this.char = 0; this.completed = false; this.release(); }
    const token = ++this.token; const same = () => token === this.token;
    try {
      if (this.settings.provider === 'azure') {
        const signature = JSON.stringify([this.book.id, this.current.text, this.settings.voice, this.settings.style]);
        // A prepared media element must play directly inside the click handler on Safari.
        if (this.loadedSignature === signature && this.audio.readyState >= 1) {
          this.audio.currentTime = Math.min(this.time, Math.max(0, this.audio.duration - .05));
          this.audio.playbackRate = this.settings.rate;
          const started = this.audio.play();
          await started;
          if (!same()) return;
          this.state = 'playing'; this.save(); this.emit();
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
          return;
        }
        this.state = 'loading'; this.emit(); this.abort = new AbortController();
        const identity = await this.tts.cacheId(this.book.id, this.current.text, this.settings);
        if (!same()) return;
        if (this.loadedIdentity !== identity) {
          const blob = await this.tts.audio(this.book.id, this.current.text, this.settings, this.abort.signal);
          if (!same()) return;
          const position = this.time; this.release(); this.time = position;
          this.url = URL.createObjectURL(blob); this.audio.src = this.url; this.loadedIdentity = identity; this.loadedSignature = signature;
          await new Promise((resolve, reject) => {
            if (this.audio.readyState >= 1) return resolve();
            const cleanup = () => { this.audio.removeEventListener('loadedmetadata', loaded); this.audio.removeEventListener('error', failed); this.abort?.signal.removeEventListener('abort', failed); };
            const loaded = () => { cleanup(); resolve(); }; const failed = () => { cleanup(); reject(Error('音频加载已中止或失败')); };
            this.audio.addEventListener('loadedmetadata', loaded, { once: true }); this.audio.addEventListener('error', failed, { once: true }); this.abort.signal.addEventListener('abort', failed, { once: true });
          });
        }
        if (!same()) return;
        this.audio.currentTime = Math.min(this.time, Math.max(0, this.audio.duration - .05)); this.audio.playbackRate = this.settings.rate;
        await this.audio.play();
        if (!same()) { this.audio.pause(); return; }
      } else {
        if (!window.speechSynthesis) throw Error('此浏览器没有系统朗读接口，请选择 AI 语音');
        const utterance = new SpeechSynthesisUtterance(this.current.text.slice(this.char));
        const start = this.char;
        const voices = speechSynthesis.getVoices();
        utterance.voice = voices.find(v => v.voiceURI === this.settings.systemVoice) || voices.find(v => /^zh[-_]CN$/i.test(v.lang) && v.localService) || voices.find(v => /^zh/i.test(v.lang)) || null;
        utterance.lang = 'zh-CN'; utterance.rate = this.settings.rate;
        utterance.onboundary = event => { if (same()) { this.char = start + event.charIndex; this.save(); this.emit(); } };
        utterance.onend = () => { if (same()) this.advance(); };
        utterance.onerror = event => { if (same() && !['canceled', 'interrupted'].includes(event.error)) this.fail(Error('系统朗读失败：' + event.error)); };
        this.utterance = utterance; speechSynthesis.speak(utterance);
      }
      this.state = 'playing'; this.save(); this.emit();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } catch (error) { if (same()) this.fail(error.name === 'NotAllowedError' ? Error('音频已准备好，请再点一次播放。浏览器需要手动授权播放。') : error); }
  }
  async advance() {
    if (this.index + 1 >= this.queue.length) { this.pause(); this.completed = true; this.save(); this.emit(); return; }
    this.jump(this.index + 1, true);
  }
  jump(index, resume = this.state === 'playing') {
    this.pause(); this.release(); this.index = Math.max(0, Math.min(this.queue.length - 1, Number(index)));
    this.time = this.char = 0; this.completed = false; this.save(); this.emit(); if (resume) this.play();
  }
  moveParagraph(direction) {
    if (!this.current) return;
    const { ci, pi } = this.current;
    let i = this.index;
    if (direction > 0) { while (i < this.queue.length - 1 && this.queue[i].ci === ci && this.queue[i].pi === pi) i++; }
    else { while (i > 0 && this.queue[i - 1].ci === ci && this.queue[i - 1].pi === pi) i--; if (i > 0) { i--; const prev = this.queue[i]; while (i > 0 && this.queue[i - 1].ci === prev.ci && this.queue[i - 1].pi === prev.pi) i--; } }
    this.jump(i);
  }
  seek(value) {
    if (!this.current) return;
    if (this.settings.provider === 'azure') { this.time = Math.max(0, Math.min(Number(value), Number.isFinite(this.audio.duration) ? this.audio.duration : Number(value))); if (this.audio.readyState) this.audio.currentTime = this.time; this.save(); this.emit(); }
    else { const resume = this.state === 'playing'; this.pause(); this.char = Math.max(0, Math.min(this.current.text.length - 1, Math.floor(Number(value)))); this.save(); this.emit(); if (resume) this.play(); }
  }
  updateSettings(settings) {
    const resume = this.state === 'playing'; const previous = this.settings;
    const changed = ['provider', 'voice', 'style', 'systemVoice'].some(k => settings[k] !== previous[k]);
    this.pause(); this.settings = settings;
    if (changed) { this.release(); this.time = this.char = 0; }
    this.save(); this.emit(); if (resume) this.play();
  }
}
