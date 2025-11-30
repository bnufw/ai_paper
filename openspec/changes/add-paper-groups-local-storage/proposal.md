# Proposal: add-paper-groups-local-storage

## Summary
为学术论文阅读器添加论文分组管理功能，并将 OCR 转换后的 Markdown 文件（包含图片）自动存储到用户本地文件系统，不再存储到 IndexedDB。AI 模型仅接收纯文本 Markdown（不含图片）。

## Motivation
当前系统存在以下问题：
1. **论文组织困难** - 所有论文以扁平列表展示，随着论文数量增加难以管理
2. **存储限制** - IndexedDB 存储大量 base64 图片占用浏览器存储空间
3. **无法外部访问** - 用户无法在其他应用中使用转换后的 Markdown 文件
4. **图片冗余传递** - AI 模型不需要图片，但目前图片数据也存储在 DB 中

## Goals
1. 实现单层分组管理，用户可创建、重命名、删除分组
2. 使用 File System Access API 将 Markdown 和图片存储到用户指定的本地目录
3. 优化数据流：DB 仅存储元数据和纯文本 Markdown，图片文件存储在本地
4. 首次使用时引导用户授权并选择存储目录

## Non-Goals
- 不实现多层嵌套文件夹结构
- 不实现多标签系统
- 不实现云同步功能
- 不修改现有的 AI 对话功能

## Approach

### 1. 数据模型变更

**新增 PaperGroup 表：**
```typescript
interface PaperGroup {
  id?: number
  name: string
  createdAt: Date
}
```

**修改 Paper 表：**
```typescript
interface Paper {
  id?: number
  title: string
  markdown: string          // 纯文本 Markdown（不含图片 base64）
  groupId?: number          // 所属分组 ID（可选，未分组则为 null）
  localPath?: string        // 本地文件夹路径（相对于用户设置的根目录）
  createdAt: Date
  updatedAt: Date
}
// 移除: pdfData, 移除 PaperImage 表
```

**新增存储设置：**
```typescript
interface StorageSettings {
  rootDirectoryHandle?: FileSystemDirectoryHandle  // 用户授权的根目录
  rootPath?: string                                 // 根目录路径（仅用于显示）
}
```

### 2. 本地存储结构

用户选择的根目录下，按以下结构存储：
```
<用户选择的目录>/
├── 分组名称1/
│   ├── 论文标题1/
│   │   ├── paper.md          # Markdown 文件
│   │   ├── source.pdf        # PDF 原文
│   │   └── images/           # 图片目录
│   │       ├── image_0.png
│   │       └── image_1.png
│   └── 论文标题2/
│       ├── paper.md
│       ├── source.pdf
│       └── images/
└── 分组名称2/
    └── ...
```

未分组的论文存储在根目录下的 `未分类/` 文件夹中。

### 3. 核心流程变更

**PDF 上传流程：**
1. 用户选择 PDF 并选择目标分组
2. Mistral OCR 返回 `{markdown, images[]}`
3. 创建本地文件夹结构，写入 PDF 原文、Markdown 和图片文件
4. Markdown 中的图片引用改为相对路径 `![alt](images/image_0.png)`
5. DB 仅存储元数据和纯文本 Markdown（图片引用保留但不含 base64）

**阅读流程：**
- 从本地文件系统读取 PDF 原文用于显示
- 从 DB 读取纯文本 Markdown 用于 AI 对话
- 从本地文件系统读取完整 Markdown（含图片）用于渲染显示

### 4. UI 变更

**侧边栏改造：**
- 显示分组列表，支持展开/折叠
- 支持新建、重命名、删除分组
- 支持拖拽论文到不同分组

**设置页面新增：**
- 存储目录选择/更换
- 显示当前已用空间（可选）

**首次使用引导：**
- 检测到未设置存储目录时，弹出引导对话框
- 使用 `showDirectoryPicker()` 让用户选择目录

## Risks & Mitigations

| 风险 | 缓解措施 |
|------|----------|
| File System Access API 兼容性 | 仅 Chromium 内核浏览器支持，需提示用户使用 Chrome/Edge |
| 用户可能意外删除本地文件 | DB 保留纯文本 Markdown，可重新导出（无图片） |
| 目录授权过期 | 每次启动时检查权限，必要时重新请求授权 |
| 文件名冲突 | 使用时间戳或 ID 后缀确保唯一性 |

## Dependencies
- File System Access API（Chrome 86+, Edge 86+）
- 现有 Mistral OCR 处理流程
- 现有 Dexie.js 数据库

## Success Criteria
1. 用户可以创建分组并将论文归类
2. 转换后的 Markdown 和图片成功保存到用户指定的本地目录
3. 本地 Markdown 文件可以被其他应用正常打开和查看
4. AI 对话仍能正常工作（使用 DB 中的纯文本 Markdown）
