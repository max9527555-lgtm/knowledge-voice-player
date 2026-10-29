import * as db from './db.js';
import { parseFile } from './parsers.js';
import { flatten } from './structure.js';
import { Player } from './player.js';
import { zipSync, unzipSync, strToU8, strFromU8 } from '../vendor/fflate.mjs';
const $ = id => document.getElementById(id);
let settings = { id: 'preferences', provider: 'system', systemVoice: '', rate: 1 };
const player = new Player(settings);
let books = [], renderedChapter = '', toastTimer, importing = false, waitingWorker;
const urls = [];
const element = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
function message(text, timeout = 6500) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, timeout); }
function errorMessage(error) { return error?.name === 'QuotaExceededError' ? '存储空间不足，操作未保存。请先备份，再释放设备空间。' : error?.message || String(error); }
function catchError(error) { message(errorMessage(error), 10000); }
function action(id, callback) { $(id).addEventListener('click', () => { try { Promise.resolve(callback()).catch(catchError); } catch (error) { catchError(error); } }); }
function closeDialog(dialog) { dialog.close(); }
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeDialog(button.closest('dialog')));
const fmtBytes = n => n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
async function renderLibrary() {
  const query = $('search').value.trim().toLocaleLowerCase();
  urls.splice(0).forEach(URL.revokeObjectURL);
  $('bookList').replaceChildren(); $('bookCount').textContent = books.length;
  const matches = books.filter(b => b.title.toLocaleLowerCase().includes(query) || (query && b.chapters.some(c => c.title.toLocaleLowerCase().includes(query) || c.paragraphs.some(p => p.text.toLocaleLowerCase().includes(query)))));
  const progress = await Promise.all(matches.map(b => db.readProgress(b.id)));
  for (const [index, book] of matches.entries()) {
    const saved = progress[index]; const percent = saved?.completed ? 100 : Math.floor((saved?.index || 0) / Math.max(1, saved?.total || flatten(book).length) * 100);
    const card = element('div', 'book-card' + (player.book?.id === book.id ? ' active' : '')); card.dataset.bookId = book.id;
    const cover = element('div', 'cover', book.title.slice(0, 2));
    if (book.cover) { const img = element('img'); img.src = URL.createObjectURL(book.cover); urls.push(img.src); img.alt = ''; cover.replaceChildren(img); }
    const open = element('button', 'book-open'); open.append(element('strong', '', book.title));
    open.append(element('small', '', `${book.format} · ${book.chapters.length} 章 · ${percent}%`));
    open.append(element('small', '', saved?.at ? '最近 ' + new Date(saved.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '尚未听读'));
    const bar = element('div', 'book-progress'); const fill = element('span'); fill.style.width = percent + '%'; bar.append(fill); open.append(bar);
    open.onclick = () => openBook(book).catch(catchError);
    const del = element('button', 'delete-book', '×'); del.setAttribute('aria-label', '删除 ' + book.title); del.title = '删除文档及缓存';
    del.onclick = async () => {
      if (!confirm(`删除《${book.title}》及其进度、语音缓存？此操作无法撤销，请先备份。`)) return;
      try {
        if (player.book?.id === book.id) { player.pause(); await player.save(); player.book = null; player.queue = null; renderedChapter = ''; }
        await db.removeBook(book.id); localStorage.removeItem('kvp-progress-' + book.id);
        books = books.filter(b => b.id !== book.id); await renderLibrary(); renderPlayer();
        if (!player.book) { $('reader').hidden = true; $('welcome').hidden = false; }
      } catch (error) { catchError(error); }
    };
    card.append(cover, open, del); $('bookList').append(card);
  }
  if (!matches.length) $('bookList').append(element('div', 'empty-library', query ? '没有找到匹配的文档' : '书库还是空的。导入一份文档，开始听读。'));
}
async function openBook(book) {
  if (player.book?.id !== book.id) {
    await player.save(); const saved = await db.readProgress(book.id);
    if (saved?.provider && saved.provider !== 'system') { saved.time = saved.char = 0; }
    player.load(book, saved); await player.save(); renderedChapter = ''; await db.put('settings', { id: 'lastBook', bookId: book.id });
  }
  $('welcome').hidden = true; $('reader').hidden = false; $('readerTitle').textContent = book.title; $('readerFormat').textContent = `${book.format} / 本地知识库`;
  $('documentWarning').textContent = book.warning; $('documentWarning').hidden = !book.warning;
  $('chapterSelect').replaceChildren(...book.chapters.map((c, i) => { const o = element('option', '', c.title); o.value = i; return o; }));
  renderPlayer(); await renderLibrary();
}
function renderText() {
  if (!player.current) return;
  const { ci } = player.current; const signature = player.book.id + ':' + ci;
  if (signature !== renderedChapter) {
    renderedChapter = signature; const chapter = player.book.chapters[ci];
    const content = document.createDocumentFragment(); content.append(element('h3', '', chapter.title));
    let offset = player.queue.findIndex(q => q.ci === ci);
    chapter.paragraphs.forEach(paragraph => {
      const p = element('p'); paragraph.sentences.forEach(sentence => {
        const index = offset++; const span = element('span', 'sentence', sentence); span.dataset.index = index; span.tabIndex = 0; span.setAttribute('role', 'button'); span.setAttribute('aria-label', '定位到：' + sentence.slice(0, 25));
        span.onclick = () => player.jump(index); span.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); player.jump(index); } };
        p.append(span);
      }); content.append(p);
    }); $('textContent').replaceChildren(content);
  }
  const old = $('textContent').querySelector('.current'); const current = $('textContent').querySelector(`[data-index="${player.index}"]`);
  if (old !== current) { old?.classList.remove('current'); old?.removeAttribute('aria-current'); current?.classList.add('current'); current?.setAttribute('aria-current', 'true');
    if (current) {
      const bounds = current.getBoundingClientRect();
      if (bounds.top < 75 || bounds.bottom > innerHeight - $('playerBar').offsetHeight - 24) current.scrollIntoView({block:'center', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }
  }
  $('chapterSelect').value = ci; $('chapterInfo').textContent = `${ci + 1} / ${player.book.chapters.length} 章`;
}
function renderPlayer() {
  const enabled = !!player.current;
  for (const id of ['play', 'previous', 'next', 'seek']) $(id).disabled = !enabled;
  $('play').textContent = player.state === 'loading' ? '⋯' : player.state === 'playing' ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', player.state === 'playing' || player.state === 'loading' ? '暂停' : '播放');
  $('voiceButton').textContent = '系统语音';
  if (!enabled) { $('nowTitle').textContent = '还没有正在听读的文档'; $('nowChapter').textContent = '从书库选择一本，继续你的学习'; return; }
  $('nowTitle').textContent = player.book.title;
  $('nowChapter').textContent = `${player.completed ? '已听完 · ' : ''}${player.book.chapters[player.current.ci].title} · 第 ${player.current.pi + 1} 段`;
  $('seek').max = player.current.text.length;
  $('seek').step = 1; $('seek').value = player.char;
  $('seek').setAttribute('aria-label', '当前短句字符位置（系统朗读近似定位）');
  $('positionLabel').textContent = player.char + '字';
  $('durationLabel').textContent = player.current.text.length + '字';
  renderText();
  const card = [...document.querySelectorAll('.book-card')].find(c => c.dataset.bookId === player.book.id);
  if (card) {
    const percent = player.completed ? 100 : Math.floor(player.index / player.queue.length * 100);
    card.querySelector('.book-open small').textContent = player.book.format + ' · ' + player.book.chapters.length + ' 章 · ' + percent + '%';
    card.querySelector('.book-progress span').style.width = percent + '%';
    card.querySelectorAll('.book-open small')[1].textContent = '最近 ' + new Date().toLocaleString('zh-CN', { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' });
  }
}
player.addEventListener('change', renderPlayer);
player.addEventListener('failure', e => catchError(e.detail));
$('search').oninput = () => renderLibrary().catch(catchError);
action('play', () => ['playing', 'loading'].includes(player.state) ? player.pause() : player.play());
action('previous', () => player.moveParagraph(-1)); action('next', () => player.moveParagraph(1));
$('chapterSelect').onchange = () => player.jump(player.queue.findIndex(q => q.ci === Number($('chapterSelect').value)));
$('seek').onchange = () => player.seek($('seek').value);
$('rate').onchange = async () => { settings = { ...settings, rate: Number($('rate').value) }; player.updateSettings(settings); try { await db.put('settings', settings); } catch (e) { catchError(e); } };
function importDialog() { if (!$('importDialog').open) $('importDialog').showModal(); }
action('importButton', importDialog); action('welcomeImport', importDialog);
async function importFiles(files) {
  if (importing) { message('正在导入，请稍候'); return; } importing = true; $('fileInput').disabled = true;
  const status = [];
  try {
    for (const file of files) {
      $('importStatus').textContent = [...status, '正在导入 ' + file.name].join('\n');
      try {
        const book = await parseFile(file, detail => { $('importStatus').textContent = [...status, detail].join('\n'); });
        await db.put('books', book); books.unshift(book); status.push('✓ ' + book.title + ' · ' + book.chapters.length + ' 章');
        await renderLibrary(); if (!player.book) await openBook(book);
      } catch (error) { status.push('✕ ' + file.name + '：' + errorMessage(error)); }
    }
  } finally { importing = false; $('fileInput').disabled = false; $('fileInput').value = ''; $('importStatus').textContent = status.join('\n'); }
}
$('fileInput').onchange = e => importFiles([...e.target.files]).catch(catchError);
$('dropZone').ondragover = e => { e.preventDefault(); $('dropZone').classList.add('drag'); };
$('dropZone').ondragleave = () => $('dropZone').classList.remove('drag');
$('dropZone').ondrop = e => { e.preventDefault(); $('dropZone').classList.remove('drag'); importFiles([...e.dataTransfer.files]).catch(catchError); };
function updateVoices() {
  const voices = window.speechSynthesis?.getVoices() || [];
  $('systemVoice').replaceChildren();
  const defaultOption = element('option', '', '自动选择普通话音色'); defaultOption.value = ''; $('systemVoice').append(defaultOption);
  voices.filter(v => /^zh/i.test(v.lang)).forEach(voice => { const o = element('option', '', voice.name + (voice.localService ? ' · 本地' : ' · 可能需联网')); o.value = voice.voiceURI; $('systemVoice').append(o); });
  $('systemVoice').value = settings.systemVoice;
}
window.speechSynthesis?.addEventListener('voiceschanged', updateVoices);
async function storageInfo() {
  const estimate = await navigator.storage?.estimate?.(); const persistent = await navigator.storage?.persisted?.();
  $('storageInfo').textContent = estimate ? `${fmtBytes(estimate.usage)} / ${fmtBytes(estimate.quota)}` : '浏览器未提供容量信息';
  $('persistInfo').textContent = persistent ? '已获持久存储。主动清理网站数据仍会删除书库。' : '尚未获得持久存储；浏览器可能在空间不足时清理数据。';
}
async function showSettings() {
  updateVoices(); $('settingsDialog').showModal(); await storageInfo();
}
action('settingsButton', showSettings); action('voiceButton', showSettings);
$('settingsForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const next = { id:'preferences', provider:'system', systemVoice:$('systemVoice').value, rate:settings.rate };
    await db.put('settings',next); settings=next; player.updateSettings(settings);
    $('settingsDialog').close(); message('系统音色已保存');
  } catch(error) { catchError(error); }
};
action('persist', async () => { const granted = await navigator.storage?.persist?.(); await storageInfo(); message(granted ? '已获得持久存储权限' : '浏览器未授予持久存储，请添加到主屏幕并保留备份'); });
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = element('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
action('export', async () => {
  await player.save(); message('正在打包备份，请保持页面打开', 60000);
  const allBooks = await db.all('books'); const audio = await db.all('audio'); const progress = (await Promise.all(allBooks.map(b => db.readProgress(b.id)))).filter(Boolean);
  let bytes = 0; const files = {}; const bookManifest = [];
  async function blobFile(blob, path) { bytes += blob.size; if (bytes > 180 * 1024 * 1024) throw Error('备份超过 180 MB，首版无法在手机内存中安全打包。请保留原文文件并分批管理书库。'); files[path] = new Uint8Array(await blob.arrayBuffer()); return path; }
  for (const b of allBooks) {
    const { cover, source, ...rest } = b;
    bookManifest.push({ ...rest, sourcePath: source ? await blobFile(source, `sources/${b.id}`) : null, coverPath: cover ? await blobFile(cover, `covers/${b.id}`) : null, coverType: cover?.type, sourceName: source?.name });
  }
  const audioManifest = [];
  for (const a of audio) { const { blob, ...rest } = a; audioManifest.push({ ...rest, path: await blobFile(blob, `audio/${audioManifest.length}.mp3`) }); }
  files['manifest.json'] = strToU8(JSON.stringify({ format: 'knowledge-voice-player', version: 1, books: bookManifest, progress, audio: audioManifest }));
  download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `知听备份-${new Date().toISOString().slice(0,10)}.zip`); message('完整备份已导出，请保存到安全位置');
});
action('restore', () => $('backupInput').click());
$('backupInput').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 200 * 1024 * 1024) throw Error('备份过大，请在原设备保留数据');
    let total = 0; const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter(f) { total += f.originalSize; if (total > 220 * 1024 * 1024) throw Error('备份解压容量超过上限'); return true; } });
    const manifest = JSON.parse(strFromU8(files['manifest.json'] || new Uint8Array()));
    if (manifest.format !== 'knowledge-voice-player' || manifest.version !== 1 || !Array.isArray(manifest.books) || !Array.isArray(manifest.progress) || !Array.isArray(manifest.audio)) throw Error('不是有效的知听备份');
    const restored = manifest.books.map(b => {
      if (typeof b.id !== 'string' || typeof b.title !== 'string' || !Array.isArray(b.chapters) || !b.chapters.length || b.chapters.some(c => typeof c.title !== 'string' || !Array.isArray(c.paragraphs) || c.paragraphs.some(p => typeof p.text !== 'string' || !Array.isArray(p.sentences) || p.sentences.some(s => typeof s !== 'string')))) throw Error('备份书籍结构无效');
      const { coverPath, sourcePath, coverType, sourceName, ...rest } = b;
      if ((coverPath && !files[coverPath]) || (sourcePath && !files[sourcePath])) throw Error('备份缺少原文或封面文件');
      return { ...rest, cover: coverPath ? new Blob([files[coverPath]], { type: coverType }) : undefined, source: sourcePath ? new File([files[sourcePath]], sourceName || b.title) : undefined };
    });
    const audios = manifest.audio.map(a => { if (!files[a.path] || typeof a.id !== 'string' || typeof a.bookId !== 'string') throw Error('备份缺少音频'); const { path, ...rest } = a; return { ...rest, blob: new Blob([files[path]], { type: 'audio/mpeg' }) }; });
    if (!confirm(`恢复 ${restored.length} 本书及 ${audios.length} 个语音块？已有同 ID 书籍将保留，不会覆盖。`)) return;
    await db.restoreBackup(restored, manifest.progress, audios); books = await db.all('books'); await renderLibrary(); await storageInfo(); message('备份恢复完成');
  } catch (error) { catchError(error); } finally { event.target.value = ''; }
};
function network() { $('network').textContent = navigator.onLine ? '本地优先' : '离线可用'; }
window.addEventListener('online', network); window.addEventListener('offline', network);
action('updateApp', async () => { if (importing) { message('请先完成文档导入'); return; } player.pause(); await player.save(); waitingWorker?.postMessage({ type: 'ACTIVATE' }); });
async function init() {
  const previous = await db.get('settings', 'preferences');
  settings = { id:'preferences', provider:'system', systemVoice:previous?.systemVoice || '', rate:Number(previous?.rate) || 1 };
  await db.put('settings',settings); player.settings = settings; $('rate').value = settings.rate;
  books = (await db.all('books')).sort((a,b) => b.importedAt - a.importedAt); await renderLibrary();
  const last = await db.get('settings', 'lastBook'); const book = books.find(b => b.id === last?.bookId); if (book) await openBook(book);
  network(); updateVoices();
  if ('serviceWorker' in navigator) {
    let controlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (controlled) location.reload(); controlled = true; });
    const registration = await navigator.serviceWorker.register('./sw.js');
    const showUpdate = () => { if (registration.waiting) { waitingWorker = registration.waiting; $('updateArea').hidden = false; message('有新版本，可在声音与存储中保存进度后更新'); } };
    showUpdate(); registration.addEventListener('updatefound', () => { registration.installing?.addEventListener('statechange', showUpdate); });
    navigator.serviceWorker.ready.then(() => { $('cacheInfo').textContent = '应用资源已就绪 · 可离线打开'; });
  }
}
window.addEventListener('unhandledrejection', e => { e.preventDefault(); catchError(e.reason); });
init().catch(catchError);
