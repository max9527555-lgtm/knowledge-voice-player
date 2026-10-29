import {createRequire} from 'node:module';
import {resolve,extname,sep} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from '../vendor/fflate.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('work/browsers');process.env.TEMP=process.env.TMP=resolve('work/tmp');
const req=createRequire(process.env.KVP_NODE_MODULES?resolve(process.env.KVP_NODE_MODULES,'_entry.js'):import.meta.url);
const {chromium}=req('playwright');const {PDFDocument,PDFName}=req('pdf-lib');
const pdf=await PDFDocument.create();const page=pdf.addPage();
const cmap=pdf.context.register(pdf.context.flateStream('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end'));
const descendant=pdf.context.register(pdf.context.obj({Type:'Font',Subtype:'CIDFontType0',BaseFont:'STSong-Light',CIDSystemInfo:{Registry:'Adobe',Ordering:'Identity',Supplement:0},DW:1000}));
const font=pdf.context.register(pdf.context.obj({Type:'Font',Subtype:'Type0',BaseFont:'STSong-Light',Encoding:'Identity-H',DescendantFonts:[descendant],ToUnicode:cmap}));
page.node.set(PDFName.of('Resources'),pdf.context.obj({Font:{F1:font}}));
const hex=s=>[...s].map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
page.node.addContentStream(pdf.context.register(pdf.context.flateStream(`BT /F1 18 Tf 50 740 Td <${hex('第一章 中文')}> Tj 0 -40 Td <${hex('知识需要持续学习。')}> Tj ET`)));
const pdfBytes=await pdf.save();
const epub=zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>无标题正文电子书</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav"/><item id="a" href="a.xhtml"/></manifest><spine><itemref idref="a"/></spine></package>'),'nav.xhtml':strToU8('<html><body><nav><a href="a.xhtml#start">目录给出的章节</a></nav></body></html>'),'a.xhtml':strToU8('<html><body><p>没有标题标签，仍应按目录分章。</p></body></html>')});
const root=resolve('dist');const prefix='/knowledge-player/';
const server=createServer(async(request,response)=>{try{const url=new URL(request.url,'http://localhost');if(!url.pathname.startsWith(prefix)){response.writeHead(404).end();return;}const name=resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');if(!name.startsWith(root+sep)){response.writeHead(403).end();return;}const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}[extname(name)]||'application/octet-stream';response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'}).end(await readFile(name));}catch{response.writeHead(404).end();}});await new Promise(r=>server.listen(4174,'127.0.0.1',r));
let browser;const report=[];const ok=s=>{report.push(s);console.log('PASS',s);};
try{
 browser=await chromium.launchPersistentContext(resolve('work/parser-profile-'+Date.now()),{headless:true,args:['--disable-crash-reporter','--disable-breakpad']});const tab=await browser.newPage();await tab.goto('http://127.0.0.1:4174'+prefix);await tab.waitForFunction(()=>!!window.mammoth);
 async function parse(bytes,name){return tab.evaluate(async({bytes,name})=>{const {parseFile}=await import('./src/parsers.js');const book=await parseFile(new File([new Uint8Array(bytes)],name));return {chapters:book.chapters,title:book.title};},{bytes:[...bytes],name});}
 const result=await parse(pdfBytes,'中文.pdf');assert.ok(JSON.stringify(result).includes('知识需要持续学习'));assert.equal(result.chapters[0].title,'第一章 中文');ok('Chinese PDF ToUnicode text and chapter extraction');
 const book=await parse(epub,'目录.epub');assert.equal(book.chapters[0].title,'目录给出的章节');ok('EPUB nav chapter label when body has no heading');
 const utf=Buffer.concat([Buffer.from([255,254]),Buffer.from('第一章 编码\n中文正文。','utf16le')]);assert.equal((await parse(utf,'编码.txt')).chapters[0].paragraphs[0].text,'中文正文。');ok('UTF-16 TXT BOM decoding');
 await tab.evaluate(()=>navigator.serviceWorker.ready);await tab.waitForFunction(()=>!!navigator.serviceWorker.controller);await browser.setOffline(true);await tab.reload();await tab.waitForFunction(()=>!!window.mammoth);assert.equal(await tab.locator('title').textContent(),'知听 · 知识语音播放器');ok('GitHub Pages repository subpath shell and offline resource scope');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await writeFile('work/parser-report.json',JSON.stringify({passed:report},null,2));}
