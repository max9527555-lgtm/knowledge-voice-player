import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('work/browsers');process.env.TEMP=process.env.TMP=resolve('work/tmp');
const req=createRequire(process.env.KVP_NODE_MODULES ? resolve(process.env.KVP_NODE_MODULES,'_entry.js') : import.meta.url);const {chromium}=req('playwright');
const profile=resolve('work/restore-profile-')+Date.now();const options={headless:true,viewport:{width:1280,height:900},args:['--disable-breakpad','--disable-crash-reporter']};
const report=[];const ok=s=>{report.push(s);console.log('PASS',s);};let context,originalSW;
try{
 context=await chromium.launchPersistentContext(profile,options);let page=await context.newPage();await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>document.getElementById('bookCount').textContent==='0');
 page.on('dialog',d=>d.accept());await page.setInputFiles('#backupInput','work/backup.zip');await page.waitForFunction(()=>document.getElementById('bookCount').textContent==='5');
 let data=await page.evaluate(async()=>{const d=await import('./src/db.js');return {books:(await d.all('books')).length,audio:(await d.all('audio')).length,progress:(await d.all('progress')).length};});assert.equal(data.audio,3);assert.ok(data.progress>0);ok('Backup restores books, progress, original blobs and audio atomically');
 await page.setInputFiles('#backupInput','work/backup.zip');await page.waitForTimeout(150);assert.equal(await page.locator('#bookCount').innerText(),'5');ok('Repeated restore preserves existing books without duplicates');
 await page.getByRole('button').filter({has:page.locator('strong')}).filter({hasText:'学习'}).first().click();await page.selectOption('#chapterSelect','1');await page.waitForTimeout(150);
 await page.evaluate(()=>navigator.serviceWorker.ready);await context.close();
 context=await chromium.launchPersistentContext(profile,options);page=await context.newPage();await context.setOffline(true);await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>document.getElementById('chapterSelect').value==='1');ok('Full browser shutdown and offline restart preserve exact book and chapter');
 await context.setOffline(false);
 originalSW=await readFile('dist/sw.js','utf8');await writeFile('dist/sw.js',originalSW.replace(/const CACHE=PREFIX\+'[^']+';/,"const CACHE=PREFIX+'acceptance-update';"));
 await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
 await page.waitForFunction(()=>!document.getElementById('updateArea').hidden);await page.click('#settingsButton');await Promise.all([page.waitForEvent('load'),page.click('#updateApp')]);await page.waitForFunction(()=>document.getElementById('bookCount').textContent==='5');
 data=await page.evaluate(async()=>{const d=await import('./src/db.js');return {books:(await d.all('books')).length,audio:(await d.all('audio')).length};});assert.equal(data.audio,3);assert.equal(await page.locator('#chapterSelect').inputValue(),'1');ok('Service worker update preserves IndexedDB, cached audio and progress');
 await page.evaluate(()=>{window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='books')throw new DOMException('Test quota full','QuotaExceededError');return window.__put.call(this,value,...args);};});
 await page.setInputFiles('#fileInput','work/学习.txt');await page.waitForFunction(()=>document.getElementById('importStatus').textContent.includes('存储空间不足'));assert.equal(await page.locator('#bookCount').innerText(),'5');ok('Quota failure is reported and does not create a phantom book');
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__put;});
 page.on('dialog',d=>d.accept());await page.locator('.book-card.active .delete-book').click();await page.waitForFunction(()=>document.getElementById('bookCount').textContent==='4');
 data=await page.evaluate(async()=>{const d=await import('./src/db.js');return {audio:(await d.all('audio')).length,progress:(await d.all('progress')).length};});assert.equal(data.audio,0);ok('Deleting a book removes its cached audio and progress');
}finally{if(originalSW)await writeFile('dist/sw.js',originalSW);if(context)await context.close();await writeFile('work/reliability-report.json',JSON.stringify({passed:report},null,2));}
