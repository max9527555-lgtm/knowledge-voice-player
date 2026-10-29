# 知听 · 系统 TTS 版

个人知识语音播放器，静态 PWA + IndexedDB。当前只使用设备提供的系统 TTS，无需 Azure 账号、区域、密钥或模型下载。

线上地址：https://max9527555-lgtm.github.io/knowledge-voice-player/
源码仓库：https://github.com/max9527555-lgtm/knowledge-voice-player

## 使用

1. iPhone 用 Safari 打开线上应用，先通过「分享 → 添加到主屏幕」安装，再在应用内导入。
2. 导入 TXT、DOCX、EPUB 或文本型 PDF；扫描 PDF 会提示需要 OCR，首版仅预留接口。
3. 在「声音与存储」选择设备提供的中文音色。自动选择优先采用本地普通话音色；音质、性别和可用音色由设备决定，以列表实际显示为准。
4. 播放、暂停、上一段/下一段、章节跳转、点击句子定位、0.75–2 倍速均可使用。
5. 进度条按当前短句的字符定位，不是音频秒数。退出后恢复书籍、章节、段落、句子和最后可用的字符边界；设备不报告边界时会重读当前短句。
6. 定期导出完整备份。书库、原文、进度保存在本机，不会上传到 GitHub。

系统语音的离线能力取决于所选音色是否已在设备上下载。iPhone 可在系统的「辅助功能 → 朗读内容」或「阅读与朗读 → 声音」中查看、下载中文语音，菜单名称依 iOS 版本而异。并非所有系统声音都会提供给浏览器，应用以系统 TTS 返回的列表为准。

## 功能和限制

- 本地解析 TXT（UTF-8、BOM UTF-16、GB18030 回退）、DOCX、EPUB、文本 PDF。
- 按章节 → 段落 → 句子存储。EPUB 按 OPF spine 排序，支持标题、导航和 NCX；PDF 使用文本层、书签与标题，复杂多栏/表格请核对正文顺序。
- 书库支持搜索正文、删除、封面、进度和最近阅读时间。
- 基础书库与阅读可离线运行；系统 TTS 不通过应用调用第三方付费语音服务。
- 系统 TTS 不提供音频导出接口，当前版本没有生成音频缓存的入口。旧版已存的音频会保留在数据库和备份中，不会因切换到系统 TTS 被清空。
- 不保证浏览器锁屏后持续朗读。iPhone/Android 真机音色、边界事件、后台和耳机控制仍需设备实测。
- 无账号、云书库、联网 AI 语音或本地 AI 模型。

## 本机运行与部署

项目及本次开发资料都在 `D:\Codex\knowledge-voice-player`。双击 `启动.cmd`，然后打开 `http://127.0.0.1:4173`。首次启动没有 dist 时会自动构建。不要通过 file:// 打开。

```powershell
cd D:\Codex\knowledge-voice-player
node build.mjs
node server.mjs --dist
```

Node 24 即可；构建和运行不需要 npm 安装。测试工具是开发依赖，不包含在部署应用中。GitHub Pages 工作流 `.github/workflows/pages.yml` 会运行核心测试、构建 dist、发布；仓库 Settings → Pages 的发布来源为 GitHub Actions。相对路径同时支持仓库子路径和域名根目录。

## 数据可靠性

数据库仍为 `knowledge-voice-player` 版本 1，保留 books、progress、audio、settings 四个 store。旧语音配置自动迁移为 system，保留倍速和系统音色；旧音频进度无法换算为字符时，从原书同一短句开头继续。

播放边界、暂停、跳转、隐藏页面和退出时保存进度；小型 localStorage 日志补充页面退出时可能未完成的 IndexedDB 写入。Service Worker 更新只清理本应用旧程序缓存，不删除书库或音频 store。更新需要从设置点击「保存进度后更新」。

浏览器清理、隐私模式、卸载、存储压力、域名/协议/端口变化仍可能影响数据。持久存储请求不一定获准，因此必须保留外部备份。Safari 与主屏幕应用也可能隔离存储，应在最终使用的应用入口中导入。

备份包含原始文件、结构化书籍、进度和旧音频，恢复使用单事务合并；同 ID 书籍不会被覆盖。当前单文件上限 60 MB、ZIP 解压上限 120 MB、备份总 Blob 上限 180 MB，以控制手机内存。

## 实现与开源来源

在 GitHub 核查过 Readest、Voicebook、Foliate.js；本项目保留精简静态架构，复用以下解析组件，而非移植整套阅读器。

| 模块 | 责任 |
| --- | --- |
| src/db.js | IndexedDB、进度日志、原子恢复、删除级联 |
| src/parsers.js | 四种格式本地解析与 OCR 接口 |
| src/structure.js | 清理、章节、段落、句子 |
| src/player.js | 系统 TTS、段落跳转、字符续播、媒体控制 |
| src/app.js | 书库、设置、备份与更新 |
| build.mjs | 静态构建、按部署路径隔离的程序缓存 |

- PDF.js 6.4.299，Apache-2.0：https://github.com/mozilla/pdf.js
- Mammoth.js 1.13.0，BSD-2-Clause：https://github.com/mwilliamson/mammoth.js
- fflate 0.8.3，MIT：https://github.com/101arrowz/fflate

依赖随包分发，运行时不使用 CDN。许可证见 vendor 和 THIRD_PARTY_NOTICES.md。没有升级或删除 IndexedDB 结构。

## 验证

```powershell
node --test tests/core.test.mjs
# 先运行本地服务，再在另一个终端运行：
node tests/fixtures.mjs
node tests/browser.mjs
node tests/parsers-browser.mjs
```

浏览器测试使用 Playwright，文档样本使用 pdf-lib。需要自行安装时，请将 npm 缓存、TEMP/TMP 和 PLAYWRIGHT_BROWSERS_PATH 指定到 D 盘；当前开发复用已经存在的 Node/开发库，测试浏览器和配置保存在项目 work 下。

测试覆盖格式导入、系统语音调用、倍速、字符跳转、刷新续播、完整重启、离线应用、旧配置迁移、旧缓存保留、备份恢复、配额失败和程序更新保留数据。系统声音与边界事件在自动化测试中模拟，不等于真机音质或离线发声验收。机器报告位于 outputs/system-tts-test-report.json。
