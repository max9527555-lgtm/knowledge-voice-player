export function normalize(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\u00ad/g, '').replace(/[\u200B\uFEFF]/g, '')
    .split('\n').map(s => s.replace(/[\t \u00a0]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function isHeading(text) {
  return text.length < 100 && /^(第[零〇一二三四五六七八九十百千万两\d]+[章节篇部卷回]\s*.*|chapter\s+[\divxlc]+\b.*|序言|前言|引言|后记|结语|附录.*|#{1,3}\s+.+)$/i.test(text);
}
// Sentence boundaries retain punctuation; long sentences use bounded synthesis chunks.
export function sentences(text, limit = 220) {
  const result = [];
  for (const sentence of text.match(/[^。！？!?\n]+[。！？!?]?[”’」』]?|[。！？!?]/g) || []) {
    let rest = sentence.trim();
    while (rest.length > limit) {
      const candidate = rest.slice(0, limit);
      const at = Math.max(candidate.lastIndexOf('，'), candidate.lastIndexOf('；'), candidate.lastIndexOf(' '));
      const cut = at > limit / 2 ? at + 1 : limit;
      result.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart();
    }
    if (rest) result.push(rest);
  }
  return result;
}
export function structure(blocks, fallback = '正文') {
  const chapters = []; let current;
  const chapter = title => { current = { title: title.replace(/^#+\s*/, ''), paragraphs: [] }; chapters.push(current); };
  for (const block of blocks) {
    const text = normalize(block.text); if (!text) continue;
    if (block.heading || isHeading(text)) { chapter(text); continue; }
    if (!current) chapter(fallback);
    for (const paragraph of text.split(/\n\s*\n/)) {
      const content = paragraph.replace(/\n/g, ' ').trim();
      const parts = sentences(content);
      if (parts.length) current.paragraphs.push({ text: content, sentences: parts });
    }
  }
  return chapters.filter(c => c.paragraphs.length);
}
export function flatten(book) {
  return book.chapters.flatMap((c, ci) => c.paragraphs.flatMap((p, pi) => p.sentences.map((text, si) => ({ text, ci, pi, si }))));
}
export function progressIndex(queue, progress = {}) {
  const index = queue.findIndex(p => p.ci === progress.ci && p.pi === progress.pi && p.si === progress.si);
  return index < 0 ? 0 : index;
}
export function escapeXML(text) { return text.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
