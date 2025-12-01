# 架构设计: add-chat-enhancements

## 概览
本文档描述聊天增强功能的技术架构设计，涵盖图片上传和论文引用(@功能)两个能力。

---

## 功能1: 图片上传

### 数据流
```
用户选择图片 → 压缩处理 → base64编码 → 存入Message → 发送到Gemini(多模态)
```

### 类型扩展

```typescript
// Message类型扩展
interface Message {
  // ...现有字段
  images?: MessageImage[]  // 新增：消息附带的图片
}

interface MessageImage {
  data: string       // base64编码的图片数据
  mimeType: string   // 'image/jpeg' | 'image/png' | 'image/webp'
  width?: number     // 可选：图片宽度
  height?: number    // 可选：图片高度
}
```

### 组件结构

```
ChatPanel.tsx
├── MessageInput (扩展)
│   ├── 文本输入框
│   ├── 图片上传按钮 (新增)
│   └── 图片预览区 (新增)
└── MessageList
    └── MessageItem
        └── ImageGallery (新增) - 显示消息中的图片
```

### Gemini API调用调整

```typescript
// geminiClient.ts 调整
// 当前：仅发送文本
parts: [{ text: userMessage }]

// 调整后：支持图片+文本
parts: [
  { text: userMessage },
  ...images.map(img => ({
    inlineData: {
      mimeType: img.mimeType,
      data: img.data  // base64，不含data:前缀
    }
  }))
]
```

### 图片处理策略
- **压缩**: 使用Canvas API将图片压缩到最大1024px宽度，JPEG质量0.8
- **大小限制**: 单张图片压缩后不超过1MB，单条消息最多4张图片
- **格式支持**: JPEG、PNG、WebP、GIF

---

## 功能2: 论文引用(@功能)

### 数据流
```
用户输入@ → 触发论文搜索 → 显示选择器 → 选择论文 → 读取paper.md → 注入上下文
```

### 设计决策

#### 引用标记格式
```
@[论文标题](paperId:123)
```
- 使用类Markdown链接语法，便于解析和显示
- paperId用于唯一标识论文

#### 上下文注入策略
- **位置**: 在系统提示词中追加引用论文内容
- **格式**: 
  ```
  [引用论文: {标题}]
  {paper.md内容}
  [/引用论文]
  ```
- **限制**: 单条消息最多引用3篇论文，避免token超限

### 组件结构

```
ChatPanel.tsx
├── MessageInput (扩展)
│   ├── 文本输入框 (监听@输入)
│   └── PaperMentionPopup (新增) - @提及选择器
│       ├── 搜索框
│       └── 论文列表
└── MessageList
    └── MessageItem
        └── PaperMentionChip (新增) - 显示引用的论文标签
```

### 论文内容读取

```typescript
// 新增服务函数
async function getPaperMarkdown(paperId: number): Promise<string> {
  const paper = await db.papers.get(paperId)
  if (!paper) throw new Error('论文不存在')
  
  // 优先从本地文件读取
  if (paper.localPath) {
    const rootPath = await getStorageRootPath()
    if (rootPath) {
      // 读取 {rootPath}/{localPath}/paper.md
      const paperMdPath = `${rootPath}/${paper.localPath}/paper.md`
      // 使用File System API读取
      return await readLocalFile(paperMdPath)
    }
  }
  
  // 回退到数据库中的markdown
  return paper.markdown
}
```

### @检测与解析

```typescript
// 输入检测正则
const MENTION_TRIGGER = /@(\S*)$/  // 检测输入中的@

// 引用解析正则
const MENTION_PATTERN = /@\[([^\]]+)\]\(paperId:(\d+)\)/g

// 解析函数
function parseMentions(content: string): { paperId: number; title: string }[] {
  const mentions: { paperId: number; title: string }[] = []
  let match
  while ((match = MENTION_PATTERN.exec(content)) !== null) {
    mentions.push({ title: match[1], paperId: parseInt(match[2]) })
  }
  return mentions
}
```

---

## 数据库迁移

需要升级Dexie数据库版本以支持消息图片字段：

```typescript
// db.ts 版本升级
this.version(4).stores({
  // 保持现有索引不变
  groups: '++id, createdAt',
  papers: '++id, groupId, createdAt',
  images: '++id, paperId, imageIndex',
  conversations: '++id, paperId, createdAt',
  messages: '++id, conversationId, timestamp',
  settings: 'key'
}).upgrade(tx => {
  // 无需数据迁移，新字段为可选
})
```

---

## 性能考量

### 图片上传
- 使用Web Worker进行图片压缩，避免阻塞UI
- 图片预览使用Object URL，避免重复base64编码
- 发送后再转换为base64存储

### 论文引用
- 论文列表使用防抖搜索（300ms）
- paper.md内容按需加载，不预加载
- 大文件截断处理（超过50KB时取前50KB并提示）

---

## 错误处理

### 图片上传错误
- 文件类型不支持 → 提示"仅支持JPG、PNG、WebP、GIF格式"
- 文件过大 → 提示"图片过大，请选择小于10MB的图片"
- 压缩失败 → 提示"图片处理失败，请重试"

### 论文引用错误
- 论文不存在 → 提示"引用的论文不存在或已删除"
- paper.md读取失败 → 提示"无法读取论文内容，请检查文件是否存在"
- 引用过多 → 提示"单条消息最多引用3篇论文"
