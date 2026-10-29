import { flatten, progressIndex } from './structure.js';
import { storeProgress } from './db.js';
export class Player extends EventTarget {
  constructor(settings) {
    super(); this.settings = settings; this.index = 0; this.char = 0; this.state = 'paused'; this.token = 0;
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    if ('mediaSession' in navigator) {
      for (const [action, handler] of Object.entries({ play: () => this.play(), pause: () => this.pause(), previoustrack: () => this.moveParagraph(-1), nexttrack: () => this.moveParagraph(1) })) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* optional platform controls */ }
      }
    }
  }
  get current() { return this.queue?.[this.index]; }
  emit() { this.dispatchEvent(new Event('change')); }
  load(book, progress) {
    this.pause(); this.book = book; this.queue = flatten(book); this.index = progressIndex(this.queue, progress);
    this.char = Math.min(this.current.text.length - 1, Math.max(0, Math.floor(Number(progress?.char) || 0)));
    this.completed = !!progress?.completed; this.emit();
    if ('mediaSession' in navigator && window.MediaMetadata) navigator.mediaSession.metadata = new MediaMetadata({ title: book.title, artist: '知识语音播放器' });
  }
  snapshot() {
    if (!this.book || !this.current) return;
    const { ci, pi, si } = this.current;
    return { id: this.book.id, ci, pi, si, char: this.char, time: 0, index: this.index, total: this.queue.length, provider: 'system', completed: !!this.completed, at: Date.now() };
  }
  save() {
    const data = this.snapshot();
    return data ? storeProgress(data).catch(error => this.dispatchEvent(new CustomEvent('failure', { detail: error }))) : Promise.resolve();
  }
  pause() {
    ++this.token; this.state = 'paused'; window.speechSynthesis?.cancel(); this.utterance = null; this.save(); this.emit();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }
  fail(error) { this.pause(); this.dispatchEvent(new CustomEvent('failure', { detail: error })); }
  play() {
    if (!this.current || this.state === 'playing') return;
    if (this.completed) { this.index = 0; this.char = 0; this.completed = false; }
    const token = ++this.token; const same = () => token === this.token;
    try {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) throw Error('此浏览器不支持系统 TTS，请使用 Safari、Chrome 或 Edge');
      const start = this.char; const utterance = new SpeechSynthesisUtterance(this.current.text.slice(start));
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find(v => v.voiceURI === this.settings.systemVoice) || voices.find(v => /^zh[-_]CN$/i.test(v.lang) && v.localService) || voices.find(v => /^zh/i.test(v.lang)) || null;
      utterance.lang = utterance.voice?.lang || 'zh-CN'; utterance.rate = this.settings.rate;
      utterance.onboundary = event => { if (same()) { this.char = start + event.charIndex; this.save(); this.emit(); } };
      utterance.onend = () => {
        if (!same()) return;
        if (this.index + 1 < this.queue.length) this.jump(this.index + 1, true);
        else { this.pause(); this.completed = true; this.save(); this.emit(); }
      };
      utterance.onerror = event => { if (same() && !['canceled', 'interrupted'].includes(event.error)) this.fail(Error('系统朗读失败：' + event.error)); };
      this.utterance = utterance; this.state = 'playing'; speechSynthesis.speak(utterance); this.save(); this.emit();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } catch (error) { if (same()) this.fail(error); }
  }
  jump(index, resume = this.state === 'playing') {
    this.pause(); this.index = Math.max(0, Math.min(this.queue.length - 1, Number(index))); this.char = 0; this.completed = false;
    this.save(); this.emit(); if (resume) this.play();
  }
  moveParagraph(direction) {
    if (!this.current) return;
    const { ci, pi } = this.current; let i = this.index;
    if (direction > 0) { while (i < this.queue.length - 1 && this.queue[i].ci === ci && this.queue[i].pi === pi) i++; }
    else {
      while (i > 0 && this.queue[i - 1].ci === ci && this.queue[i - 1].pi === pi) i--;
      if (i > 0) { i--; const previous = this.queue[i]; while (i > 0 && this.queue[i - 1].ci === previous.ci && this.queue[i - 1].pi === previous.pi) i--; }
    }
    this.jump(i);
  }
  seek(value) {
    if (!this.current) return;
    const resume = this.state === 'playing'; this.pause(); this.char = Math.max(0, Math.min(this.current.text.length - 1, Math.floor(Number(value))));
    this.save(); this.emit(); if (resume) this.play();
  }
  updateSettings(settings) { const resume = this.state === 'playing'; this.pause(); this.settings = settings; this.save(); this.emit(); if (resume) this.play(); }
}
