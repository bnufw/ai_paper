# 任务列表: add-chat-enhancements

## 概述
实现聊天增强功能：图片上传和论文引用(@功能)

---

## 阶段1: 基础设施 (可并行)

### Task 1.1: 扩展Message类型
- [x] 在 `db.ts` 中为 Message 接口添加 `images?: MessageImage[]` 字段
- [x] 定义 `MessageImage` 接口（data, mimeType, width?, height?）
- [x] 升级数据库版本到v4
- **验证**: TypeScript编译通过，现有消息加载正常

### Task 1.2: 创建图片压缩工具
- [x] 创建 `src/utils/imageCompressor.ts`
- [x] 实现 `compressImage(file: File): Promise<MessageImage>` 函数
- [x] 支持最大宽度1024px，JPEG质量0.8
- [x] 处理过大文件拒绝逻辑
- **验证**: 10MB图片压缩后小于1MB

---

## 阶段2: 图片上传功能

### Task 2.1: 创建图片上传组件
- [x] 创建 `src/components/chat/ImageUploadButton.tsx`
- [x] 实现点击选择、拖拽上传、粘贴上传
- [x] 支持多选（最多4张）
- **依赖**: Task 1.2
- **验证**: 可通过三种方式添加图片

### Task 2.2: 创建图片预览组件
- [x] 创建 `src/components/chat/ImagePreview.tsx`
- [x] 显示待发送图片的缩略图网格
- [x] 支持删除单张图片
- **依赖**: Task 2.1
- **验证**: 预览正确显示，删除功能正常

### Task 2.3: 修改ChatPanel集成图片上传
- [x] 在输入区域添加图片上传按钮
- [x] 管理待发送图片状态
- [x] 在发送按钮逻辑中包含图片
- **依赖**: Task 2.1, 2.2
- **验证**: UI布局正确，图片与文本可同时输入

### Task 2.4: 修改geminiClient支持多模态
- [x] 调整 `sendMessageToGemini` 函数签名，添加images参数
- [x] 构建包含inlineData的parts数组
- [x] 处理仅图片无文本的情况
- **依赖**: Task 1.1
- **验证**: 发送图片消息，AI能识别图片内容

### Task 2.5: 修改useChat支持图片消息
- [x] 调整 `sendMessage` 函数签名
- [x] 保存图片到Message记录
- [x] 传递图片给geminiClient
- **依赖**: Task 2.4, 1.1
- **验证**: 图片消息存储并能正确加载历史

### Task 2.6: 消息列表显示图片
- [x] 修改消息渲染逻辑，显示消息中的图片
- [x] 创建 `ImageViewer.tsx` 图片查看器组件
- [x] 支持点击放大、多图切换
- **依赖**: Task 2.5
- **验证**: 历史消息图片正确显示，查看器功能正常

---

## 阶段3: 论文引用功能

### Task 3.1: 创建论文选择器组件
- [x] 创建 `src/components/chat/PaperMentionPopup.tsx`
- [x] 实现论文列表显示、搜索过滤
- [x] 支持键盘导航和选择
- [x] 排除当前论文
- **验证**: 选择器能正确显示和过滤论文

### Task 3.2: 实现@检测逻辑
- [x] 在ChatPanel中监听输入框的@输入
- [x] 触发论文选择器弹出
- [x] 处理选择后的标记插入
- **依赖**: Task 3.1
- **验证**: 输入@能弹出选择器，选择后正确插入标记

### Task 3.3: 创建引用标签组件
- [x] 创建 `src/components/chat/PaperMentionChip.tsx`
- [x] 将 `@[标题](paperId:N)` 渲染为可视化标签
- [x] 支持点击跳转到对应论文
- **验证**: 标签样式正确，跳转功能正常

### Task 3.4: 实现论文内容读取服务
- [x] 在 `db.ts` 或新文件中添加 `getPaperMarkdown(paperId)` 函数
- [x] 优先从本地文件读取paper.md
- [x] 回退到数据库markdown字段
- [x] 处理大文件截断
- **验证**: 能正确读取本地和数据库中的论文内容

### Task 3.5: 修改useChat处理引用注入
- [x] 在sendMessage中解析引用标记
- [x] 调用getPaperMarkdown获取内容
- [x] 构建带引用的系统提示词
- [x] 实现引用数量限制检查
- **依赖**: Task 3.4
- **验证**: 引用论文内容正确注入上下文，AI能引用内容回答

### Task 3.6: 消息列表显示引用标签
- [x] 修改用户消息渲染，识别并渲染引用标记
- [x] 使用PaperMentionChip组件显示
- **依赖**: Task 3.3
- **验证**: 历史消息中的引用显示为标签

---

## 阶段4: 集成与优化

### Task 4.1: 错误处理完善
- [x] 图片上传各类错误提示
- [x] 引用论文不存在错误处理
- [x] 网络错误重试逻辑
- **依赖**: 阶段2、3完成
- **验证**: 各类异常场景有友好提示

### Task 4.2: 端到端测试
- [x] 手动测试图片上传完整流程
- [x] 手动测试论文引用完整流程
- [x] 测试图片+引用混合场景
- **依赖**: Task 4.1
- **验证**: 所有功能正常工作

---

## 依赖关系图

```
阶段1 (并行)
├── Task 1.1 (类型扩展)
└── Task 1.2 (图片压缩)

阶段2 (图片上传)
├── Task 2.1 → Task 2.2 → Task 2.3
├── Task 2.4 (依赖1.1)
├── Task 2.5 (依赖2.4, 1.1)
└── Task 2.6 (依赖2.5)

阶段3 (论文引用)
├── Task 3.1 → Task 3.2
├── Task 3.3
├── Task 3.4
├── Task 3.5 (依赖3.4)
└── Task 3.6 (依赖3.3)

阶段4 (集成)
├── Task 4.1 (依赖阶段2、3)
└── Task 4.2 (依赖4.1)
```

## 预估工时
- 阶段1: 1小时
- 阶段2: 3小时
- 阶段3: 3小时
- 阶段4: 1小时
- **总计**: 约8小时
