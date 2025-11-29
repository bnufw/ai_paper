# Implementation Tasks

## 1. Core OCR API Implementation
- [x] 1.1 实现PDF文件上传到Mistral API的功能
- [x] 1.2 实现获取文件签名URL的功能
- [x] 1.3 实现调用Mistral OCR端点的核心函数
- [x] 1.4 添加带指数退避的重试机制
- [x] 1.5 实现OCR结果解析和Markdown提取逻辑

## 2. Error Handling & Validation
- [x] 2.1 添加API Key验证(最少30字符)
- [x] 2.2 实现详细的错误检测和分类(CORS、API错误、网络错误)
- [x] 2.3 添加用户友好的错误提示信息
- [x] 2.4 实现错误日志记录

## 3. Integration & Testing
- [x] 3.1 重构`src/services/pdf/mistralOCR.ts`以使用新的OCR API
- [x] 3.2 保持`convertImagesToMarkdown`函数接口不变以维持兼容性
- [x] 3.3 调整进度回调以适应新的处理流程
- [x] 3.4 TypeScript类型检查通过
- [x] 3.5 构建成功,无编译错误

## 4. Optimization & Polish
- [x] 4.1 新API直接处理PDF,无需批处理逻辑
- [x] 4.2 添加处理进度的精确计算(百分比显示)
- [x] 4.3 优化内存使用(直接处理PDF,无需转换为图片数组)
- [x] 4.4 更新相关注释和文档

## 5. Documentation
- [x] 5.1 在代码中添加详细的函数注释
- [x] 5.2 记录API使用流程和类型定义
- [x] 5.3 更新UI提示信息说明新的API优势

## Implementation Summary

### 完成的主要变更:

1. **新增 `convertPDFToMarkdown` 函数**:
   - 直接处理 PDF 文件,无需先转换为图片
   - 返回 markdown 内容和图片数组

2. **三步 API 流程**:
   - 上传 PDF 到 `/v1/files` 获取 file_id
   - 通过 file_id 获取签名 URL (24小时有效)
   - 使用签名 URL 调用 `/v1/ocr` 进行识别

3. **重试机制**:
   - 指数退避策略(1秒、2秒)
   - 自动重试 429 和 5xx 错误

4. **错误处理**:
   - API Key 长度验证
   - CORS 错误检测和友好提示
   - 详细的错误日志

5. **向后兼容**:
   - 保留 `convertImagesToMarkdown` 接口但标记为废弃
   - 保留 `renumberImageReferences` 工具函数

6. **组件集成**:
   - 更新 `PDFUploader.tsx` 使用新 API
   - 改进进度显示(从页数改为百分比)
   - 移除 `extractPDFAsImages` 依赖

### 性能优势:

- ✅ **更快**: 专用 OCR 端点针对文档识别优化
- ✅ **更准**: 专为学术论文设计,识别质量更好
- ✅ **更稳定**: 重试机制提高成功率
- ✅ **更经济**: 避免传输大量 base64 数据
