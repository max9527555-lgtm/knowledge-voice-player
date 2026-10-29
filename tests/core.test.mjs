import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, structure, sentences, flatten, progressIndex } from '../src/structure.js';
import { makeSSML } from '../src/tts.js';
test('中文章节、段落、句子保留正文顺序',()=>{const chapters=structure([{text:'第一章 学习'},{text:'第一段。继续学习！'},{text:'第二段。'},{text:'第二章 复习'},{text:'记忆需要复习。'}]);assert.equal(chapters.length,2);assert.equal(chapters[0].paragraphs.length,2);assert.equal(chapters[0].paragraphs[0].sentences.length,2);const q=flatten({chapters});assert.equal(progressIndex(q,{ci:1,pi:0,si:0}),3);});
test('长文本分块不丢失内容',()=>{const text='知识'.repeat(500)+'。';const chunks=sentences(text);assert.ok(chunks.every(s=>s.length<=220));assert.equal(chunks.join(''),text);});
test('清理格式字符但保留实际内容',()=>assert.equal(normalize('\uFEFF题目\r\n\r\n  正文\u200b。 '),'题目\n\n正文。'));
test('SSML 注入转义与风格',()=>{const xml=makeSSML('A < B & “学习”',{voice:'zh-CN-XiaoxiaoNeural',style:'gentle'});assert.ok(xml.includes('A &lt; B &amp;'));assert.ok(xml.includes('style="gentle"'));assert.ok(!makeSSML('正文',{voice:'x" injected=',style:'bad'}).includes('injected'));});
