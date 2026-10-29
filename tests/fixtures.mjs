import {resolve} from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from '../vendor/fflate.mjs';
const req=createRequire(process.env.KVP_NODE_MODULES ? resolve(process.env.KVP_NODE_MODULES,'_entry.js') : import.meta.url);
const {PDFDocument,StandardFonts}=req('pdf-lib');
const text='第一章 学习\n知识来自持续学习。复习帮助长期记忆。\n每天听读一段。\n第二章 复习\n在间隔之后重新回忆。';
await writeFile('work/学习.txt',text);
const docx={
 '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
 '_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
 'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 DOCX 学习</w:t></w:r></w:p><w:p><w:r><w:t>这是中文文档正文。第二句话。</w:t></w:r></w:p></w:body></w:document>')};
await writeFile('work/文档.docx',zipSync(docx));
const epub={
 'mimetype':strToU8('application/epub+zip'),
 'META-INF/container.xml':strToU8('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
 'OEBPS/book.opf':strToU8('<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB 中文测试</dc:title></metadata><manifest><item id="second" href="b.xhtml" media-type="application/xhtml+xml"/><item id="first" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>'),
 'OEBPS/a.xhtml':strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章 电子书</h1><p>这是电子书第一章正文。</p><script>alert("unsafe")</script></body></html>'),
 'OEBPS/b.xhtml':strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章 顺序</h1><p>应按 spine 顺序排列。</p></body></html>')};
await writeFile('work/电子书.epub',zipSync(epub));
const pdf=await PDFDocument.create(); const font=await pdf.embedFont(StandardFonts.Helvetica);
const page=pdf.addPage(); page.drawText('Chapter 1 Memory',{x:50,y:740,size:18,font}); page.drawText('Learning requires review.',{x:50,y:700,size:12,font});
await writeFile('work/文本.pdf',await pdf.save());
const scanned=await PDFDocument.create();scanned.addPage();await writeFile('work/扫描.pdf',await scanned.save());
console.log('Generated TXT, DOCX, EPUB, text PDF, empty PDF in D:/Codex.');
