# Project Context

## Purpose
学术论文阅读器 - 基于纯前端技术栈的学术论文阅读和AI对话系统

**核心功能:**
- PDF上传与OCR转换:通过Mistral Vision API将PDF论文自动转换为Markdown格式
- 智能渲染:支持数学公式(KaTeX)、代码高亮(Highlight.js)、流程图(Mermaid)
- AI对话:基于论文内容与Google Gemini或OpenAI GPT进行智能问答
- 本地存储:使用IndexedDB存储论文和对话历史,无需后端服务器
- 纯前端应用:所有功能完全在浏览器中运行

## Tech Stack

### 核心框架
- **React 19**: UI框架(最新版本)
- **TypeScript 5.7**: 类型安全
- **Vite 6**: 构建工具和开发服务器

### AI SDK
- **@google/generative-ai**: Google Gemini API客户端
- **openai**: OpenAI GPT API客户端
- Mistral API: 用于PDF OCR(通过REST API调用)

### 数据存储
- **Dexie.js**: IndexedDB封装,提供类型安全的本地数据库操作
- **dexie-react-hooks**: React hooks集成

### 样式与UI
- **Tailwind CSS 3**: 实用优先的CSS框架
- **@tailwindcss/typography**: Markdown内容样式

### Markdown渲染引擎
- **react-markdown**: Markdown渲染
- **remark-gfm**: GitHub Flavored Markdown支持
- **remark-math**: 数学公式解析
- **rehype-katex**: 数学公式渲染(KaTeX)
- **rehype-highlight**: 代码语法高亮
- **mermaid**: 流程图和图表渲染

### PDF处理
- **Mistral OCR API**: 使用 Mistral 专用 OCR 端点进行 PDF 识别
  - 文件上传到 `/v1/files` 获取 file_id
  - 通过 file_id 获取签名 URL (24小时有效)
  - 调用 `/v1/ocr` 端点进行文档识别
  - 直接处理 PDF 文件,无需先转换为图片

## Project Conventions

### Code Style
- **语言**: TypeScript,全面使用类型注解,避免any类型
- **组件风格**: 函数式组件 + React Hooks,不使用类组件
- **命名规范**:
  - 组件文件: PascalCase (如 `ChatPanel.tsx`)
  - 工具函数: camelCase (如 `pdfExtractor.ts`)
  - Hooks: useXxx格式 (如 `useChat.ts`)
  - 服务类: camelCase + Client后缀 (如 `geminiClient.ts`)
- **导入顺序**: React相关 → 第三方库 → 本地组件 → 类型定义
- **格式化**: 使用Prettier默认配置(项目中隐式使用)

### Architecture Patterns

#### 目录结构
```
src/
├── components/          # UI组件(按功能模块划分)
│   ├── layout/         # Header, Sidebar
│   ├── pdf/            # PDFUploader
│   ├── markdown/       # MarkdownViewer, MermaidChart
│   ├── chat/           # ChatPanel
│   └── settings/       # APIKeySettings
├── services/           # 业务逻辑层(与UI分离)
│   ├── pdf/           # mistralOCR.ts - OCR转换
│   ├── ai/            # geminiClient.ts, openaiClient.ts - AI客户端
│   └── storage/       # db.ts - IndexedDB数据库定义
├── hooks/             # 自定义React Hooks
│   └── useChat.ts     # 对话逻辑
├── utils/             # 通用工具函数
├── types/             # TypeScript类型定义
└── App.tsx            # 主应用组件
```

#### 设计模式
- **服务层分离**: AI客户端、PDF处理、存储操作独立于UI组件
- **自定义Hooks**: 复杂状态逻辑封装(如useChat处理对话状态和流式响应)
- **组件化**: 功能模块独立,单一职责原则
- **类型安全**: 通过Dexie.js实现IndexedDB的类型安全操作

#### 数据流
1. 用户上传PDF → PDFUploader组件
2. PDF直接上传 → Mistral API `/v1/files` 端点
3. OCR转换 → `/v1/ocr` 端点(使用签名URL)
4. 存储到IndexedDB → db.ts(Dexie)
5. Markdown渲染 → MarkdownViewer + 多种rehype/remark插件
6. AI对话 → useChat hooks + geminiClient/openaiClient

### Testing Strategy
**当前状态**: 无测试,采用迭代开发模式
- 按照CLAUDE.md中的指令:不编写测试文件,直接运行实验,发现错误并改正
- 使用浏览器开发者工具进行调试
- 手动测试核心功能流程

### Git Workflow
- **分支策略**: 主分支master(单分支开发)
- **提交规范**: 遵循约定式提交(Conventional Commits)
  - `feat:` 新功能
  - `fix:` 错误修复
  - `refactor:` 重构
  - `docs:` 文档更新
- **开发模式**: 迭代开发,通过多轮对话完成需求

## Domain Context

### 学术论文处理
- **PDF特点**: 包含复杂的数学公式、图表、代码块、引用等
- **OCR挑战**: 公式识别、表格结构保持、图片描述
- **Markdown转换**: 需要保留论文的逻辑结构(章节、列表、引用)

### AI对话场景
- 用户询问论文中的概念、方法、结论
- AI需要基于论文全文内容进行回答(上下文注入)
- 支持多轮对话,保持上下文连贯性

### 浏览器存储
- **IndexedDB**: 适合存储大量结构化数据(论文、对话历史)
- **容量限制**: 浏览器通常允许几百MB到几GB的存储
- **图片压缩**: JPEG质量0.8以节省空间

## Important Constraints

### 技术约束
1. **纯前端架构**: 不使用后端服务器,所有逻辑在浏览器中运行
2. **API调用限制**:
   - Mistral API: 可能遇到CORS问题,需要CORS代理或浏览器扩展
   - OpenAI API: 官方不推荐在浏览器直接调用(API密钥暴露风险)
3. **PDF大小限制**: 建议50MB以内,避免浏览器内存溢出
4. **分批处理**: PDF转Markdown采用每10页一批,避免API超时

### 安全约束
- **API密钥存储**: 仅存储在浏览器IndexedDB,不上传服务器
- **隐私保护**: 论文内容和对话历史完全本地存储
- **使用建议**: 仅在个人开发环境使用,设置API使用限额

### 性能约束
- **PDF处理时间**: 使用 Mistral OCR API 专用端点,处理速度较快
- **API调用**: 带重试机制,自动处理 429 和 5xx 错误
- **浏览器限制**: IndexedDB容量、内存使用

## External Dependencies

### AI服务提供商
1. **Mistral AI**:
   - API 端点:
     - 文件上传: `https://api.mistral.ai/v1/files`
     - OCR 处理: `https://api.mistral.ai/v1/ocr`
   - 用途: PDF OCR 转 Markdown
   - 模型: mistral-ocr-latest
   - 优势: 专用 OCR 端点,速度更快,识别质量更好

2. **Google Gemini**:
   - SDK: `@google/generative-ai`
   - 用途: AI对话
   - 模型: gemini-pro系列

3. **OpenAI**:
   - SDK: `openai`
   - 用途: AI对话
   - 模型: gpt-3.5-turbo, gpt-4等

### 核心依赖库
- **KaTeX**: 数学公式渲染引擎
- **Mermaid**: 图表和流程图渲染
- **Highlight.js**: 代码语法高亮(通过rehype-highlight集成)

### 开发工具
- **Vite**: 现代化的前端构建工具,提供快速HMR
- **TypeScript**: 静态类型检查
- **Tailwind CSS**: 实用优先的CSS框架

## Known Issues
参考 `problems.md`:
1. Mistral API Key处理较慢,需要参考其他开源项目优化
2. Markdown论文显示有问题,显示了源代码形式而非渲染后的样式
3. 需要提供模型选择功能,对话中的Markdown也需要正确渲染
