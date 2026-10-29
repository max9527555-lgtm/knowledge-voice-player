import { unzipSync, strFromU8 } from '../vendor/fflate.mjs';
import { normalize, structure } from './structure.js';
export const ocr = { async recognizePage() { throw Error('此 PDF 页面没有可提取文字；OCR 接口已预留，首版未安装识别引擎。请先转换为文本型 PDF。'); } };
const MAX_EXPANDED = 120 * 1024 * 1024;
function unzip(data) {
  let total = 0;
  return unzipSync(new Uint8Array(data), { filter(file) {
    total += file.originalSize;
    if (file.originalSize > MAX_EXPANDED || total > MAX_EXPANDED) throw Error('解压后文档过大，请拆分文件后导入');
    return true;
  } });
}
function xml(text, type = 'application/xml') {
  const doc = new DOMParser().parseFromString(text, type);
  if (type !== 'text/html' && doc.querySelector('parsererror')) throw Error('文档结构损坏，无法解析');
  return doc;
}
function blocksFromHTML(text) {
  const doc = xml(text, 'text/html');
  doc.querySelectorAll('script,style,nav,header,footer,noscript,iframe,object').forEach(n => n.remove());
  const blocks = [];
  function visit(node) {
    if (node.nodeType === 3) { if (node.textContent.trim()) blocks.push({ text: node.textContent }); return; }
    if (/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|TR)$/.test(node.tagName)) {
      blocks.push({ text: node.textContent, heading: /^H[1-3]$/.test(node.tagName) }); return;
    }
    for (const child of node.childNodes) visit(child);
  }
  visit(doc.body); return blocks;
}
function resolvePath(base, href) {
  const path = new URL(href, 'https://epub.invalid/' + base).pathname.slice(1);
  return decodeURIComponent(path);
}
function nodes(doc, name) { return [...doc.getElementsByTagNameNS('*', name)]; }
async function epub(data) {
  const files = unzip(data);
  const read = path => { if (!files[path]) throw Error('EPUB 缺少文件：' + path); return strFromU8(files[path]); };
  const container = xml(read('META-INF/container.xml'));
  const opfPath = nodes(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw Error('EPUB 缺少主目录');
  const opf = xml(read(opfPath));
  const items = new Map(nodes(opf, 'item').map(n => [n.getAttribute('id'), n]));
  const labels = new Map();
  for (const item of items.values()) {
    const type = item.getAttribute('media-type');
    const path = resolvePath(opfPath, item.getAttribute('href'));
    if ((item.getAttribute('properties') || '').split(' ').includes('nav')) {
      const nav = xml(read(path), 'text/html');
      for (const a of nav.querySelectorAll('nav a[href]')) labels.set(resolvePath(path, a.getAttribute('href')), a.textContent.trim());
    } else if (type === 'application/x-dtbncx+xml') {
      for (const point of nodes(xml(read(path)), 'navPoint')) {
        const src = nodes(point, 'content')[0]?.getAttribute('src');
        const label = nodes(point, 'text')[0]?.textContent;
        if (src && label) labels.set(resolvePath(path, src), label.trim());
      }
    }
  }
  const blocks = [];
  let spineIndex = 0;
  for (const ref of nodes(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = items.get(ref.getAttribute('idref')); if (!item) continue;
    const path = resolvePath(opfPath, item.getAttribute('href'));
    const extracted = blocksFromHTML(read(path));
    if (!extracted.some(b => b.heading)) blocks.push({ text: labels.get(path) || '第 ' + (++spineIndex) + ' 章', heading: true });
    else spineIndex++;
    blocks.push(...extracted);
  }
  let cover;
  const coverId = nodes(opf, 'meta').find(n => n.getAttribute('name') === 'cover')?.getAttribute('content');
  const image = [...items.values()].find(n => (n.getAttribute('properties') || '').split(' ').includes('cover-image')) || items.get(coverId);
  if (image && /image\/(jpeg|png|webp)/.test(image.getAttribute('media-type'))) {
    const bytes = files[resolvePath(opfPath, image.getAttribute('href'))];
    if (bytes && bytes.length < 4 * 1024 * 1024) cover = new Blob([bytes], { type: image.getAttribute('media-type') });
  }
  return { title: nodes(opf, 'title')[0]?.textContent, blocks, cover };
}
async function pdf(data, notify) {
  const lib = await import('../vendor/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
  const task = lib.getDocument({ data, isEvalSupported: false, useSystemFonts: true, cMapUrl: new URL('../vendor/cmaps/', import.meta.url).href, cMapPacked: true });
  task.onPassword = () => { task.destroy(); };
  const doc = await task.promise;
  try {
    const outlineTitles = new Map();
    for (const entry of await doc.getOutline() || []) {
      try {
        const dest = typeof entry.dest === 'string' ? await doc.getDestination(entry.dest) : entry.dest;
        if (!dest) continue;
        const index = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0]);
        if (!outlineTitles.has(index)) outlineTitles.set(index, entry.title);
      } catch { /* Malformed optional outline does not block text extraction. */ }
    }
    const pages = []; let empty = 0;
    for (let number = 1; number <= doc.numPages; number++) {
      notify(`正在解析 PDF：${number} / ${doc.numPages} 页`);
      const page = await doc.getPage(number); const content = await page.getTextContent();
      const lines = []; let line = '', y;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        if (y !== undefined && Math.abs(item.transform[5] - y) > 3 && line.trim()) { lines.push(line.trim()); line = ''; }
        if (line && !/[\u3400-\u9fff]$/.test(line) && !/^[\u3400-\u9fff，。]/.test(item.str)) line += ' ';
        line += item.str; y = item.transform[5];
        if (item.hasEOL && line.trim()) { lines.push(line.trim()); line = ''; y = undefined; }
      }
      if (line.trim()) lines.push(line.trim());
      if (lines.join('').trim().length < 5) empty++;
      pages.push(lines); page.cleanup();
    }
    if (empty === doc.numPages) await ocr.recognizePage({ document: doc, page: 1 });
    // Only repeated outer lines qualify as page furniture; interior repetition is retained.
    const frequency = new Map();
    for (const lines of pages) for (const line of new Set([lines[0], lines.at(-1)])) if (line) frequency.set(line, (frequency.get(line) || 0) + 1);
    const blocks = [];
    for (const [pageIndex, lines] of pages.entries()) {
      if (outlineTitles.has(pageIndex)) blocks.push({ text: outlineTitles.get(pageIndex), heading: true });
      const clean = lines.filter((line, index) => !((index === 0 || index === lines.length - 1) && ((pages.length >= 3 && frequency.get(line) >= Math.max(3, pages.length * .6)) || /^[-—]?\s*\d{1,5}\s*[-—]?$/.test(line))));
      let paragraph = '';
      for (const line of clean) {
        if (/^(第.{1,15}[章节篇部卷]|chapter\s+\w+)/i.test(line) && line.length < 100) {
          if (paragraph) blocks.push({ text: paragraph }); paragraph = ''; blocks.push({ text: line, heading: true });
        } else { paragraph += (/\w$/.test(paragraph) && /^\w/.test(line) ? ' ' : '') + line; if (/[。！？.!?]$/.test(line) || paragraph.length > 1200) { blocks.push({ text: paragraph }); paragraph = ''; } }
      }
      if (paragraph) blocks.push({ text: paragraph });
    }
    const metadata = await doc.getMetadata().catch(() => ({}));
    return { title: metadata.info?.Title, blocks, warning: empty ? `${empty} 页无文字层，未识别其内容。` : 'PDF 多栏、表格及复杂版式的阅读顺序可能需要核对。' };
  } finally { await task.destroy(); }
}
export async function parseFile(file, notify = () => {}) {
  if (file.size > 60 * 1024 * 1024) throw Error('单文件限 60 MB，请先拆分，避免手机内存不足');
  const data = await file.arrayBuffer(); const extension = file.name.split('.').pop().toLowerCase(); let result;
  if (extension === 'txt') {
    let text; const bytes = new Uint8Array(data);
    if (bytes[0] === 255 && bytes[1] === 254) text = new TextDecoder('utf-16le').decode(data);
    else if (bytes[0] === 254 && bytes[1] === 255) text = new TextDecoder('utf-16be').decode(data);
    else try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { text = new TextDecoder('gb18030').decode(data); }
    result = { blocks: normalize(text).split('\n').filter(Boolean).map(text => ({ text })) };
  } else if (extension === 'docx') {
    unzip(data); // Check expanded size before invoking Mammoth.
    const converted = await window.mammoth.convertToHtml({ arrayBuffer: data }, { externalFileAccess: false, convertImage: window.mammoth.images.imgElement(() => Promise.resolve({ src: '' })) });
    result = { blocks: blocksFromHTML(converted.value), warning: converted.messages.length ? 'DOCX 中部分格式未转换，请核对正文。' : '' };
  } else if (extension === 'epub') result = await epub(data);
  else if (extension === 'pdf') result = await pdf(data, notify);
  else throw Error('仅支持 TXT、DOCX、EPUB、PDF');
  const chapters = structure(result.blocks);
  if (!chapters.length) throw Error('未提取到正文；文件可能损坏、受 DRM 保护或没有文字层。');
  return { id: crypto.randomUUID(), title: normalize(result.title || '').slice(0, 160) || file.name.replace(/\.[^.]+$/, ''), chapters, cover: result.cover, warning: result.warning || '', importedAt: Date.now(), format: extension.toUpperCase(), source: file };
}

