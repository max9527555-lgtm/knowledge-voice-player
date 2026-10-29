import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('work/browsers');
process.env.TEMP=process.env.TMP=resolve('work/tmp');
const req=createRequire(process.env.KVP_NODE_MODULES ? resolve(process.env.KVP_NODE_MODULES,'_entry.js') : import.meta.url);
const {chromium}=req('playwright');
const report=[];const errors=[];const browser=await chromium.launchPersistentContext(resolve('work/test-profile-')+Date.now(),{headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,args:['--disable-breakpad','--disable-crash-reporter']});
await browser.addInitScript(()=>{
 class Utterance{constructor(text){this.text=text;}}
 Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true});
 Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[{name:'测试普通话本地女声',lang:'zh-CN',voiceURI:'test-zh',localService:true}],addEventListener(){},speak(u){window.__utterance=u;setTimeout(()=>u.onboundary?.({charIndex:2}),50);},cancel(){window.__utterance=null;}},configurable:true});
});
const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const ok=(s)=>{report.push(s);console.log('PASS',s);};
try{
 await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>document.getElementById('bookCount').textContent==='0');
 await page.screenshot({path:'work/desktop-empty.png',fullPage:true});
 await page.click('#importButton');await page.setInputFiles('#fileInput',['work/学习.txt','work/文档.docx','work/电子书.epub','work/文本.pdf','work/扫描.pdf']);
 await page.waitForFunction(()=>document.getElementById('importStatus').textContent.includes('扫描.pdf：'),{},{timeout:60000});
 const status=await page.locator('#importStatus').innerText();await writeFile('work/import-status.txt',status);console.log(status);assert.ok(!status.includes('✕ 文本.pdf'));assert.equal(await page.locator('#bookCount').textContent(),'4');assert.ok(status.includes('OCR'));ok('TXT / DOCX / EPUB / text PDF imports; scanned PDF rejected with OCR message');
 await page.locator('#importDialog [data-close]').click();
 await page.getByRole('button',{name:'学习',exact:false}).filter({has:page.locator('strong')}).first().click();
 assert.equal(await page.locator('#chapterSelect option').count(),2);ok('Chinese chapter detection');
 await page.click('#play');await page.waitForTimeout(150);assert.equal(await page.locator('#positionLabel').innerText(),'2字');await page.click('#play');
 await page.selectOption('#chapterSelect','1');await page.waitForTimeout(100);await page.reload();await page.waitForFunction(()=>document.getElementById('chapterSelect').value==='1');ok('Chapter position restored across reload');
 await page.selectOption('#chapterSelect','0');await page.click('#play');await page.waitForTimeout(100);await page.click('#play');await page.reload();await page.waitForFunction(()=>document.getElementById('positionLabel').textContent==='2字');ok('System TTS boundary position restored');
 await page.click('#search');await page.fill('#search','spine');await page.waitForTimeout(150);assert.equal(await page.locator('.book-card').count(),1);assert.ok((await page.locator('.book-open strong').innerText()).includes('EPUB'));await page.fill('#search','');ok('Full-text library search');
 await page.locator('#settingsButton').click();await page.selectOption('#provider','azure');await page.fill('#apiKey','test-only-not-real');await page.locator('#settingsForm button[type=submit]').click();
 await page.evaluate(()=>{const original=HTMLMediaElement.prototype.play;let once=true;HTMLMediaElement.prototype.play=function(){if(once){once=false;return Promise.reject(new DOMException('Mock gesture restriction','NotAllowedError'));}return original.call(this);};});
 let requests=0;const wave=await readFile('work/test-audio.wav');
 await browser.route('https://*.tts.speech.microsoft.com/**',async route=>{requests++;assert.ok(route.request().postData().includes('zh-CN-XiaoxiaoNeural'));await route.fulfill({status:200,contentType:'audio/wav',body:wave});});
 await page.click('#play');await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('音频已准备好'));await page.click('#play');ok('Autoplay rejection preserves prepared audio for manual retry');await page.waitForFunction(()=>document.getElementById('play').getAttribute('aria-label')==='暂停' && Number(document.getElementById('seek').max)>10);await page.locator('#seek').fill('7.5');await page.locator('#seek').dispatchEvent('change');await page.click('#play');await page.waitForTimeout(250);assert.ok(parseFloat(await page.locator('#seek').inputValue())>=7);ok('AI adapter mock: bounded synthesis, audio decoding and seek');
 await page.reload();await page.waitForFunction(()=>document.getElementById('nowTitle').textContent==='学习');await page.click('#play');await page.waitForFunction(()=>Number(document.getElementById('seek').value)>=7);assert.equal(requests,1);await page.click('#play');ok('Cached audio resumes at saved seconds without API key or repeat generation');
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await browser.setOffline(true);await page.reload();await page.waitForFunction(()=>document.getElementById('bookCount').textContent==='4');await page.click('#play');await page.waitForFunction(()=>document.getElementById('play').textContent==='Ⅱ');await page.click('#play');ok('Offline shell / library / cached audio playback');
 await page.setInputFiles('#fileInput','work/电子书.epub');await page.waitForFunction(()=>document.getElementById('bookCount').textContent==='5');ok('Offline EPUB parser available');
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{value:false,configurable:true}));await page.click('#next');await page.click('#play');await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('尚未缓存'));ok('Uncached offline audio reports a recoverable error');
 await browser.setOffline(false);await page.evaluate(()=>delete navigator.onLine);await page.click('#previous');await page.click('#settingsButton');await page.fill('#apiKey','test-only-not-real');await page.locator('#settingsForm button[type=submit]').click();
 page.once('dialog',d=>d.accept());await page.click('#cacheChapter');await page.waitForFunction(()=>document.getElementById('cacheMessage').textContent.includes('本章可离线播放'));await page.click('#cancelCache');assert.equal(requests,3);ok('Chapter cache generates only missing bounded chunks sequentially');
 await browser.setOffline(true);await page.click('#play');await page.waitForFunction(()=>Number(document.getElementById('seek').max)>10);await page.locator('#seek').fill('29.9');await page.locator('#seek').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('.sentence.current')?.dataset.index==='1' && document.getElementById('play').textContent==='Ⅱ');await page.click('#play');assert.equal(requests,3);ok('Cached chunks advance automatically while offline');
 await browser.setOffline(false);await page.screenshot({path:'work/desktop-reader.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'work/mobile-reader.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));ok('390px mobile layout has no horizontal overflow');
 await page.click('#settingsButton');const downloadPromise=page.waitForEvent('download');await page.click('#export');const download=await downloadPromise;await download.saveAs(resolve('work/backup.zip'));ok('Backup ZIP exports originals, progress and cached audio');
 assert.equal(errors.length,0,errors.join('\n'));ok('No browser runtime errors');
}finally{await writeFile('work/browser-report.json',JSON.stringify({passed:report,errors},null,2));await browser.close();}

