# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

学术论文阅读器 - 前端（React）+ 后端（FastAPI），支持 PDF 上传/OCR、论文搜索导入、AI 对话、笔记管理和 Idea 工作流。
- 1. 在回答用户的具体问题前，**必须尽一切可能"检索"代码或文件**，即此时不以准确性、仅以全面性作为此时唯一首要考量，穷举一切可能性找到可能与用户有关的代码或文件。在这一步中，**必须使用英文与** ，auggie-mcp提供的`mcp__auggie-mcp__codebase-retrieval` 工具交互，以获取完整、全面的项目上下文。

    **关键：** 不要依赖内部知识库或假设。
    1.1  **首选工具：** 必须将 `mcp__auggie-mcp__codebase-retrieval` 作为代码库搜索的**第一选择**。
    1.2  **语义理解：** 不要一开始就用 grep/find。使用自然语言向 Auggie 提问，搞清楚 "Where", "What", "How"。
    1.3  **编辑前强制动作：** 在计划编辑任何文件前，必须调用 Auggie 获取涉及的符号、类或函数的详细信息。
        - *规则：* 尽可能在一次调用中询问所有相关符号。
        - *目标：* 确保你拥有当前磁盘状态的完整上下文。
    1.4  **迭代：** 如果检索到的上下文不足，重复搜索直到获得全貌。
- 保持工作区的整洁

## 常用命令

```bash
npm run dev           # 启动前端开发服务器 (http://localhost:5173)
npm run dev:frontend  # 同上，仅启动前端
npm run backend       # 仅启动后端 (运行 start_backend.sh)
npm run dev:all       # 同时启动前端和后端 (运行 start_all.sh)
npm run build         # tsc 类型检查 + vite 生产构建
npm run preview       # 预览生产构建
```

后端启动依赖 `.env` 文件。首次运行 `start_backend.sh` 时，如缺少 `.env`，脚本会从 `.env.example` 复制一份并停止，需要用户填写 LLM 和 Embedding 配置后再次运行。

## 技术栈

- **框架**: React 19 + TypeScript + Vite 6
- **样式**: Tailwind CSS 3
- **存储**: Dexie.js (IndexedDB v7) + File System Access API
- **AI 前端**: Google Gemini SDK (@google/genai) + OpenAI SDK
- **AI 后端**: LangChain + ChromaDB + OpenAI 兼容 LLM/Embedding 客户端
- **渲染**: react-markdown + KaTeX + Mermaid + Highlight.js + mammoth

## 核心架构

### 数据流

```
用户上传PDF → Mistral OCR API → Markdown + 图片 → 本地文件系统存储
                                                  ↓
                                    IndexedDB (元数据 + 对话历史)

搜索导入: 后端抓取会议论文 → ChromaDB 索引 → 混合检索 → PDF 下载 → 前端 OCR → 同上
```

### 存储策略

1. **File System Access API** (`services/storage/fileSystem.ts`): 论文文件存储
   - 每篇论文独立目录: `{root}/{groupName}/{title}_{timestamp}/`
   - 包含: `source.pdf`, `paper.md`, `note.md`, `images/`
   - 分组级别: `group_note.md`, `domain_knowledge.md`, `ideas/`

2. **IndexedDB** (`services/storage/db.ts`): 元数据和对话 — 当前 **v7**
   - `groups`: 论文分组
   - `papers`: 论文元数据（标题、分组、localPath、来源去重字段 `sourceId`/`pdfUrl`）
   - `conversations`: 对话会话（支持 `lastClearAt` 上下文清除）
   - `messages`: 消息记录（支持图片、思考过程、联网搜索、添加到笔记）
   - `ideaSessions` / `ideaMessages`: Idea 工作流会话和对话
   - `settings`: API 密钥、Gemini 配置、Idea 工作流配置

### AI Provider 模式

`services/ai/` 采用统一的 provider 抽象层，支持三种 AI 后端：

```
callLLM(request) → 根据 provider 字段分发
  ├── 'google' → geminiProvider.ts   (Gemini 2.5 Pro / 3 Pro)
  ├── 'openai'  → openaiProvider.ts  (OpenAI 兼容端点，支持 GPT-5/5.1/5.2)
  └── 'aliyun'  → aliyunProvider.ts  (阿里云 Qwen)
```

关键接口（`services/ai/llmService.ts`）：
- `callLLM(request)` — 单模型调用
- `buildLLMRequest(config, systemPrompt, userMessage, signal?)` — 从 `ModelConfig` 构建请求
- `callMultipleModels(configs, ..., onModelStart?, onModelComplete?)` — 并发多模型调用，带进度回调

`ModelConfig` 中的 `ThinkingConfig` 字段按 provider 不同：Gemini 用 `thinkingBudget`/`thinkingLevel`，OpenAI 用 `reasoningEffort`，阿里云用 `enableThinking`。

### Idea 工作流引擎

三阶段流水线（`services/idea/workflowEngine.ts`）：

```
idle → generating → evaluating → summarizing → completed/failed
```

- **生成阶段**: 多个生成器模型并发生成候选 Idea，每个生成结果保存到 `{idea_dir}/ideas/idea_{N}_{slug}.md`
- **评审阶段**: 多个评审器模型并评审所有候选 Idea，保存到 `{idea_dir}/reviews/review_{slug}.md`
- **筛选阶段**: 单个筛选器模型汇总评审结果，选出最佳 Idea，保存 `best_idea.md`

`IdeaWorkflowEngine` 类通过 `StateListener` 回调暴露实时状态，每条消息都触发 UI 更新。工作流支持通过 `AbortSignal` 取消。相关 hooks：
- `useIdeaWorkflow.ts` — 启动/管理工作流
- `useIdeaConfig.ts` — 读取/保存工作流配置
- `useIdeaChat.ts` — 围绕最佳 Idea 的对话

### 后端架构

```
backend/main.py              FastAPI 入口
backend/api/routes.py        REST + SSE 流式端点
backend/core/
  fetcher.py                 论文抓取（OpenReview 通用）
  cvf_fetcher.py             CVF 专用抓取（CVPR/ICCV）
  aaai_ojs_fetcher.py        AAAI OJS 专用抓取
  semantic_scholar_fetcher.py Semantic Scholar 补充搜索
  indexer.py                 ChromaDB 向量索引构建
  search_engine.py           混合检索（关键词 + 向量）
  keyword_extractor.py       LLM 关键词扩展
  evaluator.py               LLM 相关性评审
  skill_search.py            基于研究技能的自动检索
  translator.py              论文双语翻译
  llm_client.py              LLM 调用客户端
  venues.py                  会议定义和元数据
```

搜索导入流程：`fetch → index → search → evaluate → download PDF → (前端 OCR)`

SSE 端点用于流式推送长任务进度（抓取、索引、检索）。

### 组件结构

```
App.tsx
├── Sidebar (论文列表、分组管理、Idea 会话)
├── ResizablePanel
│   ├── Left: PDFViewer / NotePanel (标签切换)
│   └── Right: ChatPanel / IdeaChatPanel (对话面板)
└── Modal: APIKeySettings / StorageSetupDialog / IdeaSettingsModal / IdeaWorkflowRunner
```

### 关键模块

- **`hooks/useChat.ts`**: 对话状态管理，支持论文引用 (`@[标题](paperId:123)`)、消息编辑、流式输出、联网搜索
- **`services/ai/geminiClient.ts`**: Gemini API 封装，支持思考模式 (thinkingBudget/thinkingLevel)、联网搜索
- **`services/pdf/mistralOCR.ts`**: PDF 转 Markdown，分批处理 (每 10 页一批)
- **`services/note/noteService.ts`**: AI 整理和生成笔记
- **`services/paper/importPaper.ts`**: 论文导入编排（OCR + 文件写入 + DB 记录）
- **`services/knowledge/domainKnowledgeService.ts`**: 领域知识管理

## 开发注意事项

- 保持项目简洁，删除未使用的代码
- IndexedDB 版本管理：修改表结构时在 `db.ts` 中新增 `this.version(N).stores({...})` 块，**不要修改已有版本号**
- `getPaperMarkdown()` 将 markdown 截断为 **50KB**，发送给 AI 时需留意
- `public/prompts/` 中的提示词文件是用户可自定义的 AI 提示词模板
- 论文导入去重：`findPaperBySource()` 优先按 `sourceId` 查，其次按 `pdfUrl`
- 图片压缩使用 `utils/imageCompressor.ts`，JPEG 质量 0.8
- 首次使用需用户授权本地目录访问
