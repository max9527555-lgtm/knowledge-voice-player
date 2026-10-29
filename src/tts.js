import { get, put } from './db.js';
import { escapeXML } from './structure.js';
export function makeSSML(text, settings) {
  const voice = settings.voice === 'zh-CN-XiaoyiNeural' ? settings.voice : 'zh-CN-XiaoxiaoNeural';
  const style = ['general', 'gentle', 'cheerful'].includes(settings.style) ? settings.style : 'general';
  const content = escapeXML(text);
  // Xiaoyi has a different style set; expose styles only for Xiaoxiao.
  const expression = voice === 'zh-CN-XiaoxiaoNeural' && style !== 'general' ? `<mstts:express-as style="${style}">${content}</mstts:express-as>` : content;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${voice}">${expression}</voice></speak>`;
}
export class AzureTTS {
  key = ''; pending = new Map();
  async cacheId(bookId, text, settings) {
    const bytes = new TextEncoder().encode(JSON.stringify(['azure-mp3-v1', settings.voice, settings.style, text]));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return bookId + ':' + [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  async cached(bookId, text, settings) { return get('audio', await this.cacheId(bookId, text, settings)); }
  async audio(bookId, text, settings, signal) {
    const id = await this.cacheId(bookId, text, settings);
    const cached = await get('audio', id); if (cached) return cached.blob;
    if (!navigator.onLine) throw Error('这段尚未缓存，请联网生成，或切换系统语音');
    if (!this.key.trim()) throw Error('请先在声音设置填写 Azure 密钥；已缓存的同音色音频无需密钥');
    if (!/^[a-z][a-z0-9]{1,35}$/.test(settings.region)) throw Error('请填写有效的 Azure 区域，如 eastasia');
    if (this.pending.has(id)) return this.pending.get(id);
    const promise = (async () => {
      const response = await fetch(`https://${settings.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST', signal, headers: { 'Ocp-Apim-Subscription-Key': this.key.trim(), 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' }, body: makeSSML(text, settings)
      });
      if (!response.ok) throw Error(`Azure 生成失败 (${response.status})，请检查区域、密钥、额度和音色支持`);
      const blob = new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' });
      if (!blob.size) throw Error('语音服务返回空音频');
      await put('audio', { id, bookId, blob, voice: settings.voice, style: settings.style, createdAt: Date.now() });
      return blob;
    })();
    this.pending.set(id, promise);
    try { return await promise; } finally { this.pending.delete(id); }
  }
}
