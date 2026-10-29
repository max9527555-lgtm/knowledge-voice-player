const DB_NAME = 'knowledge-voice-player';
let database;
export function openDB() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['books', 'progress', 'settings']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' }).createIndex('bookId', 'bookId');
    };
    request.onerror = () => { database = null; reject(request.error); };
    request.onblocked = () => { database = null; reject(Error('请关闭其他旧版本页面后重试数据库更新')); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = null; }; resolve(request.result); };
  });
  return database;
}
export async function transaction(names, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode); let value;
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error || Error('本地写入失败，操作未保存'));
    try { action(tx, result => { value = result; }); } catch (error) { tx.abort(); reject(error); }
  });
}
export const put = (store, data) => transaction([store], 'readwrite', tx => tx.objectStore(store).put(data));
export const get = (store, id) => transaction([store], 'readonly', (tx, done) => { tx.objectStore(store).get(id).onsuccess = e => done(e.target.result); });
export const all = store => transaction([store], 'readonly', (tx, done) => { tx.objectStore(store).getAll().onsuccess = e => done(e.target.result); });
export function removeBook(id) {
  return transaction(['books', 'progress', 'audio'], 'readwrite', tx => {
    tx.objectStore('books').delete(id); tx.objectStore('progress').delete(id);
    tx.objectStore('audio').index('bookId').openKeyCursor(IDBKeyRange.only(id)).onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) { tx.objectStore('audio').delete(cursor.primaryKey); cursor.continue(); }
    };
  });
}
export function storeProgress(data) {
  // Tiny synchronous journal survives pagehide, when async IndexedDB may be suspended.
  try { localStorage.setItem('kvp-progress-' + data.id, JSON.stringify(data)); } catch { /* IndexedDB remains primary */ }
  return put('progress', data);
}
export async function readProgress(id) {
  const saved = await get('progress', id);
  let journal; try { journal = JSON.parse(localStorage.getItem('kvp-progress-' + id)); } catch { /* ignore corrupt journal */ }
  return journal?.at > (saved?.at || 0) ? journal : saved;
}
export async function restoreBackup(books, progress, audio) {
  // All-or-nothing merge. IDs preserve audio/progress links; existing IDs remain untouched.
  return transaction(['books', 'progress', 'audio'], 'readwrite', tx => {
    for (const book of books) {
      tx.objectStore('books').get(book.id).onsuccess = event => {
        if (event.target.result) return;
        tx.objectStore('books').add(book);
        for (const p of progress.filter(p => p.id === book.id)) tx.objectStore('progress').put(p);
        for (const a of audio.filter(a => a.bookId === book.id)) tx.objectStore('audio').put(a);
      };
    }
  });
}
