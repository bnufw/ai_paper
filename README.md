# 📚 学术论文阅读器

基于纯前端技术栈的学术论文阅读和AI对话系统。

## ✨ 功能特性

- **PDF上传与OCR转换**：上传PDF论文，通过Mistral Vision API自动转换为Markdown格式
- **智能渲染**：支持数学公式(KaTeX)、代码高亮(Highlight.js)、流程图(Mermaid)
- **AI对话**：基于论文内容与Google Gemini或OpenAI GPT进行智能对话
- **本地存储**：使用IndexedDB存储论文和对话历史，无需后端服务器
- **纯前端应用**：所有功能完全在浏览器中运行

## 🛠️ 技术栈

- **框架**：React 19 + TypeScript
- **构建工具**：Vite 6
- **样式**：Tailwind CSS 3
- **AI SDK**：
  - @google/generative-ai (Gemini)
  - openai (OpenAI GPT)
- **存储**：Dexie.js (IndexedDB)
- **Markdown渲染**：
  - react-markdown
  - rehype-katex (数学公式)
  - rehype-highlight (代码高亮)
  - remark-gfm (GitHub Flavored Markdown)
  - mermaid (流程图)
- **PDF处理**：Mistral OCR API (专用 OCR 端点)

## 📦 安装与运行

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 3. 构建生产版本

```bash
npm run build
npm run preview
```

## 🚀 使用指南

### 第一步：配置API密钥

1. 点击右上角的"⚙️ 设置"按钮
2. 配置以下API密钥：
   - **Mistral API Key**：用于PDF OCR转换
   - **Google Gemini API Key**：用于AI对话（可选）
   - **OpenAI API Key**：用于AI对话（可选）

### 第二步：上传论文

1. 点击左侧边栏的"+ 上传新论文"按钮
2. 选择PDF文件（限制50MB以内）
3. 等待处理完成（进度会实时显示）

**注意事项**：
- PDF处理时间取决于页数，通常每10页需要30-60秒
- 大型PDF会自动分批处理，确保稳定性

### 第三步：阅读与对话

- **左侧**：Markdown格式的论文内容，支持公式、图表、代码高亮
- **右侧**：AI对话面板，可以向AI提问关于论文的任何问题

## 📁 项目结构

```
src/
├── components/          # UI组件
│   ├── layout/         # Header, Sidebar
│   ├── pdf/            # PDFUploader
│   ├── markdown/       # MarkdownViewer, MermaidChart
│   ├── chat/           # ChatPanel
│   └── settings/       # APIKeySettings
├── services/           # 业务逻辑
│   ├── pdf/           # mistralOCR.ts (OCR转换)
│   ├── ai/            # geminiClient.ts, openaiClient.ts
│   └── storage/       # db.ts (IndexedDB)
├── hooks/             # useChat.ts (对话逻辑)
├── utils/             # pdfExtractor.ts (PDF图片提取)
└── App.tsx            # 主应用
```

## 🔐 安全说明

- **API密钥存储**：所有API密钥仅存储在浏览器的本地IndexedDB中，不会上传到任何服务器
- **隐私保护**：论文内容和对话历史完全在本地存储
- **建议**：
  - 使用个人开发API密钥
  - 在API提供商处设置使用限额
  - 不要在公共或共享设备上保存密钥

## ⚠️ 已知限制

1. **CORS问题**：如果遇到Mistral API跨域错误：
   - 安装浏览器CORS扩展（如"CORS Unblock"）
   - 或使用CORS代理服务

2. **浏览器API密钥暴露**：
   - OpenAI官方不推荐在浏览器中直接调用API
   - 建议仅在个人开发环境使用

3. **IndexedDB容量限制**：
   - 浏览器对IndexedDB有容量限制（通常几百MB到几GB）
   - 图片已压缩（JPEG质量0.8）以节省空间

## 🎯 技术亮点

### 1. 分批处理策略
PDF转Markdown采用每10页一批的分批处理，避免API超时，同时支持并发提高速度。

### 2. 渐进式错误提示
CORS等常见错误有专门的友好提示和解决方案引导。

### 3. 类型安全
全程使用TypeScript，IndexedDB操作通过Dexie.js实现类型安全。

### 4. 组件化架构
React组件按功能模块划分，逻辑与UI分离，易于维护和扩展。

## 📝 开发计划

完整的实施计划见 `.claude/plans/zazzy-chasing-kurzweil.md`

## 📄 License

MIT

## 🙏 致谢

- [Mistral AI](https://mistral.ai/) - Vision API
- [Google Gemini](https://ai.google.dev/) - Generative AI
- [OpenAI](https://openai.com/) - GPT API
- [Vite](https://vitejs.dev/) - 构建工具
- [React](https://react.dev/) - UI框架
- [Dexie.js](https://dexie.org/) - IndexedDB封装
