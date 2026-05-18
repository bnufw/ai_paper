# 学术论文工作台

面向论文收集、阅读、笔记、对话和研究 Idea 生成的本地优先应用。前端负责论文管理和交互，后端负责会议论文抓取、索引、检索和 PDF 代理下载。

## 核心功能

### 论文导入

支持两种导入方式：

1. 本地上传 PDF。浏览器调用 Mistral OCR API，将 PDF 转为 Markdown，同时保存原始 PDF、图片和元数据。
2. 搜索导入论文。FastAPI 后端抓取并索引会议论文，前端按研究描述检索结果，再下载 PDF 并进入同一套 OCR 保存流程。

当前搜索源支持 `NeurIPS`、`ICLR`、`ICML`、`CVPR`、`ICCV`、`AAAI`。

### 阅读与对话

左侧显示论文 PDF 或笔记，右侧提供 Gemini 对话。对话支持流式输出、思考内容显示、联网搜索开关、图片输入、会话重命名、导出、上下文清空、消息编辑、将回复追加到论文笔记。

对话中可以输入 `@` 引用其他论文，也可以输入 `@领域知识` 引入当前分组的领域知识。

### 笔记与知识管理

每篇论文有独立 `note.md`，支持手动编辑、Markdown 预览、AI 生成和 AI 整理。每个分组支持 `group_note.md` 和 `domain_knowledge.md`，领域知识可通过 `.docx`、粘贴内容或分组论文笔记生成。

### Idea 工作流

分组级 Idea 工作流会读取领域知识、论文笔记和研究方向，依次执行：

1. 多模型并发生成候选 Idea。
2. 多模型评审候选 Idea。
3. 筛选器汇总评审并保存最佳 Idea。

支持 Gemini、OpenAI 兼容端点、阿里云 Qwen。结果保存到本地会话目录，并可继续围绕最佳 Idea 对话。

## 技术栈

前端：

```text
React 19
TypeScript
Vite 6
Tailwind CSS 3
Dexie / IndexedDB
File System Access API
react-markdown / KaTeX / Highlight.js / Mermaid
@google/genai
openai
mammoth
```

后端：

```text
FastAPI
Uvicorn
OpenReview / CVF / AAAI OJS 抓取
LangChain
ChromaDB
OpenAI 兼容 LLM 与 Embedding 客户端
Server-Sent Events
```

## 运行环境

基础要求：

```text
Node.js 18+
Python 3.10+
Chrome 或 Edge
```

浏览器需要支持 File System Access API。首次使用会要求选择一个本地目录，用于保存论文、笔记、领域知识和 Idea 结果。

## 配置

### 前端内配置

在应用设置中配置：

```text
Mistral API Key      用于 PDF OCR
Gemini API Key       用于论文对话、笔记生成、领域知识整理、Idea 对话
Gemini 模型参数       模型、温度、流式输出、联网搜索、思考模式
本地存储目录           论文和 Markdown 文件保存位置
```

Idea 工作流设置中额外配置：

```text
OpenAI 兼容端点 API Key
OpenAI 兼容端点 Base URL
阿里云 API Key
阿里云 Base URL
生成器、评审器、筛选器模型
生成、评审、筛选提示词
研究方向
```

### 后端 `.env`

搜索导入需要后端环境变量。首次运行 `start_backend.sh` 或 `start_all.sh` 时，如果缺少 `.env`，脚本会从 `.env.example` 复制一份并停止。填写后再次运行。

```bash
cp .env.example .env
```

关键字段：

```text
LLM_PROVIDER=openai 或 gemini
OPENAI_API_KEY / OPENAI_BASE_URL / LLM_MODEL
GEMINI_API_KEY / GEMINI_BASE_URL / LLM_MODEL
EMBEDDING_API_KEY / EMBEDDING_BASE_URL / EMBEDDING_MODEL
```

`EMBEDDING_*` 用于构建论文向量索引。LLM 配置用于关键词扩展、相关性评审和翻译。

## 安装与运行

安装前端依赖：

```bash
npm install
```

启动前端和后端：

```bash
npm run dev:all
```

默认地址：

```text
前端 http://localhost:5173
后端 http://localhost:8000
```

只启动前端：

```bash
npm run dev:frontend
```

只启动后端：

```bash
npm run backend
```

生产构建：

```bash
npm run build
npm run preview
```

## 使用流程

### 本地上传论文

1. 打开应用并选择本地存储目录。
2. 在全局设置中填写 Mistral API Key。
3. 点击“导入论文”，选择“本地上传”。
4. 选择 PDF 和分组，等待 OCR 与保存完成。

### 搜索导入论文

1. 启动后端并完成 `.env` 配置。
2. 进入“导入论文”，选择“搜索导入”。
3. 获取指定会议年份的数据并构建索引。
4. 输入研究描述，运行检索。
5. 从结果中导入论文。

搜索结果会优先直接下载 PDF；直接下载失败时，前端会改用后端 `/api/download-pdf` 代理。

### 论文阅读和笔记

论文视图显示 `source.pdf`。笔记视图读取和保存 `note.md`，支持编辑和预览。AI 生成笔记、AI 整理笔记、从对话追加到笔记都依赖 Gemini API Key。

### Idea 生成

1. 为分组内论文生成或编写笔记。
2. 可选：维护分组领域知识。
3. 打开 Idea 工作流设置，确认模型、密钥、提示词和研究方向。
4. 在分组操作中启动 Idea 工作流。
5. 完成后在 Idea 历史中查看结果，并继续对话。

## 数据存储

应用采用本地优先存储：

```text
IndexedDB
  PaperReaderDB        论文、分组、对话、设置、Idea 会话元数据
  FileSystemHandles    本地目录授权句柄

本地目录
  {分组名}/
    {论文标题}_{timestamp}/
      source.pdf
      paper.md
      note.md
      images/
        image_0.png
    group_note.md
    domain_knowledge.md
    ideas/
      {YYYY-MM-DD-HH-MM-SS}/
        best_idea.md
        chat_history.md
        ideas/
          idea_1_{model}.md
        reviews/
          review_{model}.md
```

论文正文、笔记、领域知识和 Idea 结果保存在用户选择的本地目录。IndexedDB 保存索引元数据、对话历史、设置和本地目录句柄。

## 项目结构

```text
backend/
  main.py                  FastAPI 应用入口
  api/routes.py            搜索、抓取、索引、PDF 代理接口
  core/                    会议抓取、索引、检索、评审、翻译、LLM 客户端

public/prompts/            笔记、领域知识、Idea 工作流提示词

src/
  App.tsx                  应用主布局
  components/import/       本地上传和搜索导入
  components/pdf/          PDF 上传和 PDF 查看
  components/chat/         论文对话
  components/note/         论文笔记和分组笔记
  components/knowledge/    领域知识管理
  components/idea/         Idea 工作流和 Idea 对话
  components/layout/       侧边栏、分组、会话列表
  services/pdf/            Mistral OCR 和 PDF 获取
  services/search/         后端搜索 API 和搜索历史
  services/storage/        IndexedDB 与本地文件系统
  services/ai/             Gemini、OpenAI 兼容端点、阿里云提供商
  services/idea/           Idea 工作流引擎和本地结果存储
  services/note/           论文笔记生成与整理
  services/knowledge/      领域知识解析、保存与整理
```

## 限制

1. 本地文件系统能力依赖 Chrome 或 Edge。
2. Mistral 和 Gemini 调用发生在浏览器侧，API Key 会存在于本地浏览器环境。
3. 搜索导入依赖后端服务、LLM 配置和 Embedding 配置。
4. Mistral OCR 可能受浏览器 CORS 策略影响。
5. IndexedDB 和本地文件授权受浏览器策略限制，换浏览器或清理站点数据会影响访问。

## License

MIT
