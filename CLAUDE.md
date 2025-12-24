# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

学术论文阅读器 - 纯前端应用，支持 PDF 上传、OCR 转换、AI 对话和笔记管理。
- 1. 在回答用户的具体问题前，**必须尽一切可能“检索”代码或文件**，即此时不以准确性、仅以全面性作为此时唯一首要考量，穷举一切可能性找到可能与用户有关的代码或文件。在这一步中，**必须使用英文与** ，auggie-mcp提供的`mcp__auggie-mcp__codebase-retrieval` 工具交互，以获取完整、全面的项目上下文。

    **关键：** 不要依赖内部知识库或假设。
    1.1  **首选工具：** 必须将 `mcp__auggie-mcp__codebase-retrieval` 作为代码库搜索的**第一选择**。
    1.2  **语义理解：** 不要一开始就用 grep/find。使用自然语言向 Auggie 提问，搞清楚 "Where", "What", "How"。
    1.3  **编辑前强制动作：** 在计划编辑任何文件前，必须调用 Auggie 获取涉及的符号、类或函数的详细信息。
        - *规则：* 尽可能在一次调用中询问所有相关符号。
        - *目标：* 确保你拥有当前磁盘状态的完整上下文。
    1.4  **迭代：** 如果检索到的上下文不足，重复搜索直到获得全貌。
- 运行的conda环境为 diff
- conda是在**miniconda**里的，而不是anaconda里的
- 跑完整的，大规模的实验请使用screen
- 预训练的dit模型在/home/zhu/dd/DD_IGD/pretrained_models/DiT-XL-2-256x256.pt
- log文件统一放在logs文件夹下
- 保持工作区的整洁

## 常用命令

```bash
npm run dev      # 启动开发服务器 (http://localhost:5173)
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览生产构建
```

## 技术栈

- **框架**: React 19 + TypeScript + Vite 6
- **样式**: Tailwind CSS 3
- **存储**: Dexie.js (IndexedDB) + File System Access API
- **AI**: Google Gemini SDK (@google/generative-ai)
- **渲染**: react-markdown + KaTeX + Mermaid + Highlight.js

## 核心架构

### 数据流

```
用户上传PDF → Mistral OCR API → Markdown + 图片 → 本地文件系统存储
                                                  ↓
                                    IndexedDB (元数据 + 对话历史)
```

### 存储策略

1. **File System Access API** (`services/storage/fileSystem.ts`): 论文文件存储
   - 每篇论文独立目录: `{root}/{paperId}/`
   - 包含: `paper.md`, `paper.pdf`, 图片文件

2. **IndexedDB** (`services/storage/db.ts`): 元数据和对话
   - `papers`: 论文元数据 (标题、分组、localPath)
   - `conversations`: 对话会话
   - `messages`: 消息记录 (支持图片、思考过程)
   - `settings`: API 密钥、Gemini 配置

### 关键模块

- **`hooks/useChat.ts`**: 对话状态管理，支持论文引用 (`@[标题](paperId:123)`)、消息编辑、流式输出
- **`services/ai/geminiClient.ts`**: Gemini API 封装，支持思考模式 (thinkingBudget/thinkingLevel)、联网搜索
- **`services/pdf/mistralOCR.ts`**: PDF 转 Markdown，分批处理 (每 10 页一批)
- **`services/note/noteService.ts`**: 笔记服务，AI 整理和生成功能

### 组件结构

```
App.tsx
├── Sidebar (论文列表、分组管理)
├── ResizablePanel
│   ├── Left: PDFViewer / NotePanel (标签切换)
│   └── Right: ChatPanel (对话面板)
└── Modal: APIKeySettings / StorageSetupDialog
```

## 开发注意事项

- 保持项目简洁，删除未使用的代码
- IndexedDB 数据库版本管理在 `db.ts` 中，修改表结构需升级版本号
- 图片压缩使用 `utils/imageCompressor.ts`，JPEG 质量 0.8
- 首次使用需用户授权本地目录访问
