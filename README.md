# 枝知 · 本地学习工具箱

一个在本机运行的 React + TypeScript 学习应用。导入视频后，用 FFmpeg 拆分音轨与代表画面、本地 Qwen3-ASR 转写和强制对齐，再通过本机 Codex 登录整理章节、回答问题与检查作答证据。

## 功能

- 按课程文件夹组织视频与讲义，支持搜索、返回和刷新。来源版本分别标注，保留原学习记录。
- 原视频时间戳可追溯；滚动时播放器置顶，展开/收起沿用同一个视频节点。
- 按场景变化和间隔抽帧，必要时补抽。整理最多6张、问答最多3张图片，不把整段视频每帧送给模型。
- 从任意消息 Fork，继承祖先上下文，分支后续隔离，可查看完整树并返回主线。
- 安全渲染 Markdown、固定流程、对比和知识导图；不执行模型生成代码。
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

测试覆盖 Fork 隔离、证据评分、持久化和损坏文件保护、进程取消、时间戳/帧校验、课程文件夹、幂等登记及公开字幕来源。测试素材为合成内容，不把替身测试描述成真实视频处理成功。

## 技术与来源

React、TypeScript、Vite、Express、Zod、ReactFlow、Dagre；Markdown 使用 react-markdown 与 remark-gfm。

- [Codex app-server](https://developers.openai.com/codex/app-server/)
- [Qwen3-ASR 官方项目](https://github.com/QwenLM/Qwen3-ASR)
- [官方 ASR 权重](https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf)
- [官方强制对齐权重](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf)

第三方依赖和模型遵循各自许可证。本仓库公开可见不代表附带第三方课程内容的再分发许可。
