# 枝知 · 本地学习工具箱

一个在本机运行的 React + TypeScript 学习应用。导入视频后，用 FFmpeg 拆分音轨与代表画面、本地 Qwen3-ASR 转写和强制对齐，再通过本机 Codex 登录整理章节、回答问题与检查作答证据。

## 功能

- 按课程文件夹组织视频与讲义，支持搜索、返回和刷新。来源版本分别标注，保留原学习记录。
- 原视频时间戳可追溯；滚动时播放器置顶，展开/收起沿用同一个视频节点。
- 按场景变化和间隔抽帧，必要时补抽。整理最多6张、问答最多3张图片，不把整段视频每帧送给模型。
- 从任意消息 Fork，继承祖先上下文，分支后续隔离，可查看完整树并返回主线。
- 安全渲染 Markdown、固定流程、对比和知识导图；概念支持原资料中的多层分类与子项、直接原文定位和逐节点折叠，不执行模型生成代码。
- 可选章节小测：选择题核对答案，解释和迁移题逐评分点验证答案引用，服务端计算分数。90分是本次作答阈值，不是客观掌握概率。
- 本地持久化、重复导入检测、进度、取消、失败重试及转写断点复用。

## 快速启动

需要 **Node.js 24+**、npm。基础页面和明确标注的自建样例不需要模型权重。

```bash
git clone https://github.com/Stxr/zhizhi-learning-toolbox.git
cd zhizhi-learning-toolbox
npm ci
npm run dev
```

打开 **http://127.0.0.1:5187/**。此命令同时启动 Vite 前端（5187）和 Express 后端（4387），只监听本机。按 `Ctrl+C` 停止这次启动的两个进程。

构建后可只运行后端：

```bash
npm run build
npm start
```

打开 **http://127.0.0.1:4387/**。这是本地运行方式，不是公网网站部署。

可选配置：复制 `.env.example` 为 `.env`。`PORT`、`VITE_PORT` 可避免端口冲突，`LEARNING_DATA_DIR` 可选择本地数据位置；`.env` 不进入 Git。无需填写独立付费 API key。

## 启用真实视频处理

1. 安装 FFmpeg，并确保 `ffmpeg`、`ffprobe` 在 PATH 中。
2. 安装 Python，创建项目专属环境：

```bash
python3 -m venv .local/qwen-env
.local/qwen-env/bin/python -m pip install -r docs/qwen-requirements.lock.txt
.local/qwen-env/bin/python scripts/qwen_asr.py --prepare
```

依赖锁来自验证环境，其他平台的 PyTorch 安装可能需要按官方平台说明调整。权重是官方公开模型，下载到 `.local/hf-cache`，需要联网与数 GB 空间，不包含在仓库中。脚本选择实际可用的 CUDA、Apple MPS 或 CPU；不会因失败静默替换模型。

3. 安装并正常登录 [Codex CLI](https://developers.openai.com/codex/cli/)，使 `codex` 在 PATH 中（也可配置 `CODEX_BIN`）。本应用使用 `codex app-server --stdio`，由 Codex 管理登录；不读取或复制认证文件、Token 或 Cookie。
4. 打开“模型设置”，从本机实际返回的模型名单选择各阶段模型。默认标识未必适用于所有账号或版本，应以真实接口为准。AI 整理、图片理解、问答和开放题评估会联网并消耗当前订阅额度。
5. 点击“导入视频”。直接上传上限1GB、30分钟；更长视频需自行切分。处理前确保依赖和空间充足，批处理保留8GiB可用空间门槛。

本地 Whisper 作为手动选择的另一条路径：自行安装 `whisper-cli` 和模型，并配置 `WHISPER_BIN`、`WHISPER_MODEL`。仓库不打包可执行文件或模型。

## 下载 Bilibili 分 P 视频

先确认你有权下载并用于本地学习。使用 [yt-dlp 官方项目](https://github.com/yt-dlp/yt-dlp) 与 FFmpeg；下面命令不依赖本项目私有下载脚本，也不读取浏览器 Cookie。本次验证环境中，yt-dlp **2026.08.19** 成功，旧 **2025.02.19** 曾返回 HTTP 412；这不是永久版本下限。遇到接口兼容错误先核对版本，有限重试，不循环请求。

在项目中创建独立下载环境（FFmpeg/ffprobe 仍需在 PATH）：

```bash
python3 -m venv .local/download-env
.local/download-env/bin/python -m pip install --upgrade yt-dlp
.local/download-env/bin/python -m yt_dlp --version
ffmpeg -version
ffprobe -version
```

**先查范围和格式，再下载。** 从目标 BV 的分 P 列表确认标题、年份和实际分集数；外层“合集”可能包含其他课程。下面把 `BV目标编号` 和 `p=1` 换成已确认的同一 BV 与分 P，`--no-playlist` 限制本次请求，不用外层合集的序号代替分 P。

```bash
.local/download-env/bin/python -m yt_dlp --ignore-config --no-cache-dir \
  --no-playlist -F 'https://www.bilibili.com/video/BV目标编号/?p=1'

.local/download-env/bin/python -m yt_dlp --ignore-config --no-cache-dir \
  --no-playlist --list-subs 'https://www.bilibili.com/video/BV目标编号/?p=1'
```

只有格式表实际提供 1080P H.264 和 AAC 时，才执行严格选择。`height=1080` 不会降到 720P/480P；`height<=1080` 或带低清备用分支的选择会允许降级。没有所需格式时应停止并说明原因。**匿名 1080P 并非所有视频都可用**：正常访问需要登录时由用户在网站登录；本说明不提供导出凭据、绕过验证或会员限制的方法。

```bash
mkdir -p downloads
.local/download-env/bin/python -m yt_dlp --ignore-config --no-cache-dir \
  --no-playlist --continue --retries 2 --socket-timeout 15 \
  --concurrent-fragments 1 \
  -f 'bestvideo[height=1080][vcodec^=avc1]+bestaudio[ext=m4a]' \
  --merge-output-format mp4 \
  --write-subs --sub-langs 'all,-danmaku' --sub-format srt \
  -P downloads -o 'P001_%(id)s.%(ext)s' \
  'https://www.bilibili.com/video/BV目标编号/?p=1'
```

FFmpeg 将视频和音频合为 MP4。下载下一集时同时改 `p=2` 和输出前缀 `P002`，按已确认的有限清单处理；不要只换文件名仍请求同一集。允许最多 **3 个分集任务** 同时下载，每个任务保持一个片段下载并发。`--continue` 复用同目录、同格式和同文件名的 `.part`；取消后保留断点，重试前确认没有另一个任务正在写同一文件。

下载前用 `df -h .` 检查空间，按格式表大小预算全部目标文件，还要计入并发中的独立视频、音轨及合并临时副本；完成后至少保留 **8GiB** 可用空间和额外缓冲。空间不足先停新任务，保留源文件、断点和模型，不降低保护门槛。页面上传上限不是下载空间预算。

**字幕单独核实。** `--write-subs` 只请求该视频公开提供的独立字幕；提示登录受限或没有字幕时，记录这一事实，不将弹幕或画面烧录字幕当作 SRT/VTT。公开字幕要保留原始字节、来源 URL、类型及时间码；需要自动字幕时另查 `--list-subs` 的实际可用项，明确其来源。没有独立字幕仍可在应用中使用本地 Qwen3-ASR 转写。

完成后验证实际容器信息，不从文件名推断清晰度：

```bash
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height \
  -show_entries format=duration,size -of json downloads/P001_实际文件名.mp4
shasum -a 256 downloads/P001_实际文件名.mp4
# 完整解码检查；长视频也可分别对开头、中段和末段做有限抽样检查。
ffmpeg -v error -i downloads/P001_实际文件名.mp4 -f null -
```

应检查真实高度1080、H.264/AAC、时长和音视频可解码，并记录 SHA256。标题、配音、上传者和年份只按核实来源标注，第三方配音版不标为官方原声，也不默认与讲义逐讲对应。

**导入枝知：** 页面点击“导入视频”，选择已验证的本地文件。直接上传限1GB、30分钟；超过任一限制先切为更小的片段，再逐个导入，不绕过限制。保留原片和片段起始偏移：切分后的引用时间是片段内时间。批量清单须按下方受限接口的实际合同登记，仓库不附带私人清单，也不接受任意文件路径。先完整处理一集，确认转写、画面和原片定位后再扩批。

## 知识导图的来源层级

课程概念使用递归 `children`，原资料中明确的分类会保留为父子节点；短标题可点击查看完整解释和原文，折叠一个父节点会隐藏其全部后代。既有顶层节点 ID 保持兼容，避免丢失导图选择记录。

启动时对旧的平面概念做一次幂等修复：仅扩展已有解释中的单个明确列表，且每一项都必须在真实原文找到。不会把未匹配项、转写不确定项或多个分组压成一个完整列表。修复前原课程和摘要留在本机 `audits`，只新增有证据的子节点，不重跑 ASR、模型、题目或学习记录；证据不足的旧内容仍需人工核对或显式重新整理。

## 数据与安全边界

仓库只有程序、自建样例和合成测试，不包含任何用户课程视频、转写、第三方课程正文、真实问答、学习记录、模型缓存或私人截图。首次启动只生成自建样例，第三方课程入口不会凭空出现。

本地状态默认保存到 `.local/data`。媒体、转写和断点也保留在本机；状态通过临时文件与原子重命名写入。不要把 `.local`、`media`、`.env` 或个人数据提交到公开仓库。

HTTP 拒绝非本机 Host、跨站写入和未标记的写请求，媒体路由只读取登记的视频及画面。模型以只读临时会话工作，shell、apps、搜索与已配置 MCP 被禁用，模型工具/权限请求被拒绝。正文和历史作为不可信数据处理。Markdown 不执行 HTML、脚本或任意生成代码。

这仍是本地工具：同一台机器上的程序可以访问本地接口和文件，不应将接口反向代理到公网。

## 批量与跨设备接口

普通使用先从页面上传。高级用户可自行准备受限本地 manifest，使用 `/api/collections/register-v2` 登记文章或 Windows 媒体；定义见 [manifest 示例说明](examples/README.md)。固定 MIT/旧合集兼容入口保留在源码，但仓库不含对应素材或清单，也不负责下载第三方课程。

Windows 协作支持单 worker 领取、心跳、取消和经过 SHA/时间戳校验的幂等成果接收。它需要自行配置 worker、固定目录及只读媒体服务；本仓库不包含 SSH 身份、设备地址或控制器，不会唤醒或关机任何机器。未接通远端时显示原视频不可用，本机已保存学习内容仍可读。

## 开发检查

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

测试覆盖 Fork 隔离、证据评分、持久化和损坏文件保护、进程取消、时间戳/帧校验、课程文件夹、递归导图与引用/迁移保护、幂等登记及公开字幕来源。测试素材为合成内容，不把替身测试描述成真实视频处理成功。

## 技术与来源

React、TypeScript、Vite、Express、Zod、ReactFlow、Dagre；Markdown 使用 react-markdown 与 remark-gfm。

- [Codex app-server](https://developers.openai.com/codex/app-server/)
- [Qwen3-ASR 官方项目](https://github.com/QwenLM/Qwen3-ASR)
- [官方 ASR 权重](https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf)
- [官方强制对齐权重](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf)

第三方依赖和模型遵循各自许可证。本仓库公开可见不代表附带第三方课程内容的再分发许可。
