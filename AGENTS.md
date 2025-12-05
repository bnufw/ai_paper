# Repository Guidelines

本指南面向贡献者，概述仓库结构、开发流程与协作规则，确保变更简单、可验证、可维护。

## 项目结构与模块
- `src/` 核心代码：`components/`（layout、pdf、markdown、chat、settings）、`services/`（pdf OCR、AI 客户端、IndexedDB 存储）、`hooks/`（对话等复用逻辑）、`utils/`（PDF 提取）、`styles/`、`types/`。
- `public/` 静态资源；`dist/` 为 Vite 构建产物（仅发布场景更新）。
- `openspec/` 规范与变更提案；提交功能/架构改动前先查阅对应 spec 与 changes。
- `.claude/` 内含计划与代理配置，保持同步但勿提交敏感信息。

## 构建、测试与本地开发
- `npm install`：安装依赖（建议 Node ≥ 18）。
- `npm run dev`：启动 Vite 开发服务器，默认 `http://localhost:5173`。
- `npm run build`：`tsc` 类型检查后执行 `vite build`，产出 `dist/`。
- `npm run preview`：本地预览生产包。
- 当前未集成自动化测试；在提交前手动验证关键路径：PDF 上传与分批 OCR、Markdown 渲染（KaTeX/Mermaid/代码高亮）、AI 对话、IndexedDB 读写。

## 编码风格与命名
- TypeScript + React 19 函数组件；两空格缩进；尽量保持无状态 UI 组件与业务逻辑分层（hooks/services）。
- 组件与文件名使用 PascalCase（`MarkdownViewer.tsx`），hooks 以 `use` 前缀，工具函数 camelCase。
- 样式优先使用 Tailwind 原子类；复用样式集中在 `src/styles`，避免内联魔法数。
- 秉持“保持简洁”：删除未使用的组件、常量与样式，减少死代码。

## 提交与 Pull Request
- Commit 建议英文动词/类型开头（如 `feat: add pdf batch upload`, `fix: handle cors error`），粒度保持单一意图。
- PR 需包含：变更摘要、影响范围、验证方式（列出执行的命令或手测步骤。

## 安全与配置提示
- API Key 仅应在浏览器本地设置，切勿写入代码、Git 记录或日志；必要时在公开场景清空本地存储。
- 处理外部接口时注意 CORS，勿在控制台打印完整请求头/密钥。
- 若引入新依赖，评估包体积与浏览器权限，避免无谓的性能与安全开销。
