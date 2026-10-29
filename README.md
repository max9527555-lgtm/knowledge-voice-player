# 知听 · 知识语音播放器

本地优先、移动端优先的静态 PWA。基础书库和阅读不依赖后端。原创应用代码不使用框架；解析器复用成熟开源库。所有本次开发文件、下载和浏览器测试数据均位于 `D:\Codex\knowledge-voice-player`，没有向 C 盘安装新依赖；复用了 Codex 已存在的 Node 运行时。

## 开始使用

1. 双击项目根目录的 `启动.cmd`，保持窗口打开。
2. 在浏览器访问 `http://127.0.0.1:4173`。不要双击 HTML 用 `file://` 打开。
3. 导入 TXT、DOCX、EPUB 或文本型 PDF，关闭导入结果窗口后开始阅读。
4. 打开「声音与存储」，选择 Azure AI，填写自己的 Speech 资源区域和密钥，音色选「晓晓」。自然、温柔、轻快三种风格可选。
5. 播放时只生成当前短句；「缓存本章」会显示未缓存短句数和正文字符数，确认后顺序生成。中止会保留已生成部分。改变音色或风格会生成另一份缓存。
6. 没有密钥时选择系统 TTS。普通话音色由系统提供，离线前请确认已下载。系统引擎不能导出音频缓存。
7. 通过「导出完整备份」保存原文、结构化书籍、播放进度和缓存音频。不要把唯一副本留在浏览器里。

首次使用先等阅读区出现「应用资源已就绪 · 可离线打开」。应用能离线运行，但未生成的 AI 音频需要联网和密钥。退出后自动定位上次书籍，点击播放继续，遵循浏览器自动播放限制。

本地 HTTP 地址只用于本机测试，手机应使用 HTTPS 部署地址。关闭启动窗口即可停止本地服务器。启动脚本优先使用系统 Node，找不到时使用此电脑现有的 Codex Node；换电脑可使用 Node 24 或更新版本。

## GitHub Pages 部署

已提供 `.github/workflows/pages.yml`。将源代码上传到你自己的 GitHub 仓库的 `main` 分支；不需要上传 `work/`、`outputs/` 或安装 `node_modules`。

进入仓库 Settings → Pages → Build and deployment → Source，选择 GitHub Actions。工作流会测试核心逻辑、构建 `dist/` 并发布。部署到 `https://用户名.github.io/仓库名/` 或自定义域名均使用相对资源路径。也可以直接将 `dist/` 内容部署到任意 HTTPS 静态服务器。

源码仓库：[knowledge-voice-player](https://github.com/max9527555-lgtm/knowledge-voice-player)。访问地址：[知听](https://max9527555-lgtm.github.io/knowledge-voice-player/)。仓库工作流负责自动构建并发布。工作流参考 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。本地构建不需要 npm 安装：

```powershell
cd D:\Codex\knowledge-voice-player
node build.mjs
node server.mjs --dist
```

## 数据与更新

- IndexedDB `knowledge-voice-player` 版本 1，分别使用 `books`、`progress`、`audio`、`settings` 四个 object store。
- `books` 存原始 File、可选封面、章节 → 段落 → 句子。TXT 支持 UTF-8、带 BOM 的 UTF-16、GB18030 回退。EPUB 按 OPF spine 顺序读取，使用正文标题、导航或 NCX 目录。PDF 使用文本层、书签和标题；复杂版式没有可靠的通用阅读顺序。
- 进度包含书籍 ID、章/段/句、当前音频秒数或系统语音字符边界、完成状态和时间；每个音频时间更新周期保存，暂停、跳转和隐藏页面立即保存。localStorage 只保存小型同步进度日志，缓解关闭页面时异步事务被挂起的风险。
- 缓存键包含书籍 ID、正文哈希、音色、风格、引擎/编码版本。倍速使用播放器调整，不重复生成。音频 Blob 保存在 IndexedDB，应用更新不会清理它。
- Service Worker 仅维护带部署路径命名空间的程序资源缓存。新版等待用户点击「保存进度后更新」；只删除自己的旧程序缓存，不删除数据库。
- 持久存储请求可能被拒绝。浏览器清理、卸载、隐私模式、系统存储压力仍可能影响数据；程序无法承诺永久保存。[WebKit 存储政策](https://webkit.org/blog/14403/updates-to-storage-policy/)
- 域名、协议或端口改变后属于另一个存储来源；数据不会自动跟随迁移。Safari 与主屏幕应用也可能隔离存储，请先安装再导入，用备份迁移。
- 备份恢复采用单事务合并，已存在同 ID 书籍不会覆盖。首次恢复到新设备后，声音设置需重新选择，密钥需重新填写。

## 兼容与精度边界

目标为现代 Android/Windows 浏览器和 iPhone Safari/PWA（建议 iOS 17 或更新）。已经验证 Chromium 桌面和 390px 移动布局，没有 iPhone/Android 真机验收，不能视为已验证所有 Safari 行为。

- 缓存音频：按媒体时间定位，可调速、拖动当前短句音频进度；章节下拉和点正文切换位置；上一段/下一段跨短句定位到段落开头。Media Session 已接入，锁屏显示/控制和跨块连续播放依设备而异。
- 系统 TTS：按最新可用字符边界恢复；若音色不报告边界，则当前短句重读。进度条以字符近似定位；不是精确的音频秒数。[boundary 事件兼容性](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event)
- 每个短句单独合成。未缓存时，短句之间可能出现网络生成等待，不承诺无缝播放。长时间离线学习建议提前缓存所需章节。退出后不自动出声，需要手动播放。首次生成音频后，若 Safari 提示手动授权，请再点击播放；应用保留已准备音频，不重复生成。播放手势实现依据 [WebKit 官方策略](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/)。
- Azure 直接连接官方区域端点；只向它发送当前生成块的正文和认证。地区网络、跨域限制、资源类型和服务额度需用真实账户确认。密钥仅在当前页面内存，不进入 IndexedDB、备份或代码。生成失败明确提示，不会默默切换音色或引擎。
- 已提供晓晓/晓伊中文女声；风格仅对晓晓开放。真人感和长时听感属于主观验收，仍需你试听决定。[Azure 音色支持](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)、[REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)
- 扫描 PDF 的 `ocr.recognizePage` 是待实现接口，会明确拒绝纯扫描件；混合型 PDF 会提醒有页面缺少文字层。没有偷偷安装 OCR 模型。
- 单文件上限 60 MB、ZIP 解压总量上限 120 MB；完整备份 Blob 总量上限 180 MB，避免首版内存打包压垮手机。这是实现限制，不是浏览器容量的精确上限。
- 暂不支持 DRM、旧 `.doc`、跨设备同步。没有新增账号、云书库、AI 摘要等无关功能。

## 模块

| 文件 | 责任 |
| --- | --- |
| `src/db.js` | IndexedDB、进度日志、原子恢复、删除级联 |
| `src/parsers.js` | TXT/DOCX/EPUB/PDF 解析、OCR 预留对象 |
| `src/structure.js` | 清理、分章、分段、句子/短块 |
| `src/tts.js` | Azure 适配、SSML、分块本地缓存 |
| `src/player.js` | 系统 TTS/音频播放、跳转、进度、Media Session |
| `src/app.js` | 书库、界面、备份、更新提示 |
| `build.mjs` | 构建静态文件与版本化 Service Worker |

增加另一种 TTS 时，沿用 `audio(bookId, text, settings, signal)` 与 `cacheId` 接口；基础书库不依赖任何 TTS 服务。OCR 未来可替换 `ocr.recognizePage`。不要通过修改数据库名来发布更新；新增字段优先兼容旧数据，变更结构需增加数据库版本并编写迁移。

## 开源方案核查与取舍

先核查了 [Readest](https://github.com/readest/readest)、[Voicebook](https://github.com/NeoVand/voicebook)、[Foliate.js](https://github.com/johnfactotum/foliate-js)。Readest 功能成熟，但 Next.js/Tauri 整套应用及既有功能超出本项目范围；Voicebook 接近本地听读方向，但仍在开发且没有 EPUB/OCR。选择复用成熟组件，保留小型静态应用，不把候选项目宣传为已经满足本项目验收。

- [PDF.js](https://github.com/mozilla/pdf.js) / pdfjs-dist **6.4.299**：Apache-2.0，使用 legacy 构建和内置 CJK CMap，禁用动态求值。对应 npm 包已校验 SHA-512。
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) **1.13.0**：BSD-2-Clause，保留段落和标题，转换 HTML 只提取文字，不插入页面执行。
- [fflate](https://github.com/101arrowz/fflate) **0.8.3**：MIT，EPUB ZIP、备份 ZIP。

版本在开发时查询 npm registry 核实，依赖本地随包分发，运行时没有 CDN。原始许可证位于 `vendor/`，见 `THIRD_PARTY_NOTICES.md`。项目本身的发布许可由所有者决定。

## 验证

`node --test tests/core.test.mjs` 无依赖即可运行核心测试。完整浏览器测试使用 Playwright 1.62.1 和 pdf-lib 1.17.1（只用于开发），不参与线上应用。

若自行安装测试工具，请在 D 盘项目目录内安装，并指定下载路径，避免 npm/浏览器缓存落在 C 盘：

```powershell
$env:TEMP = 'D:\Codex\knowledge-voice-player\work\tmp'
$env:TMP = $env:TEMP
$env:PLAYWRIGHT_BROWSERS_PATH = 'D:\Codex\knowledge-voice-player\work\browsers'
New-Item -ItemType Directory -Path $env:TEMP -Force
npm install --cache D:\Codex\knowledge-voice-player\work\npm-cache
npx --cache D:\Codex\knowledge-voice-player\work\npm-cache playwright install chromium
node build.mjs
# 另开终端运行 node server.mjs --dist，然后：
node tests/fixtures.mjs
node tests/browser.mjs
node tests/reliability.mjs
node tests/parsers-browser.mjs
```

完整重启、断网、备份恢复、程序更新保留数据、磁盘配额异常与删除级联已测试。Azure 仅模拟服务响应，系统 TTS 仅模拟边界事件；这些测试不等于实际云端音质或设备发声测试。详细结果在 `outputs/验收说明.md`。
