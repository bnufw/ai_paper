# Change: 优化OCR处理性能
参考：https://github.com/baoyudu/paper-burner/blob/main/app.js
## Why

当前的PDF OCR处理速度较慢,使用Chat Completions API处理PDF图片效率不高。参考开源项目paper-burner的实现,Mistral提供了专用的OCR API端点(`/v1/ocr`),相比使用Chat Completions API,专用OCR端点具有以下优势:

1. **更快的处理速度**: OCR专用端点针对文档识别优化,处理速度更快
2. **更好的识别质量**: 专门设计用于文档OCR,对学术论文的识别效果更好
3. **更合理的API使用**: 文件上传 + OCR端点的方式符合API设计最佳实践
4. **更强的稳定性**: 通过重试机制和错误处理提高处理成功率

## What Changes

- **迁移到Mistral OCR API**: 从Chat Completions API迁移到专用的`/v1/ocr`端点
- **实现文件上传流程**: 添加PDF文件上传到Mistral,获取签名URL,然后调用OCR端点的完整流程
- **添加重试机制**: 实现带指数退避的重试逻辑,提高处理稳定性
- **改进错误处理**: 增强错误检测和用户友好的错误提示
- **保持API兼容性**: 保持与现有代码接口的兼容,最小化调用方改动

## Impact

- **影响的specs**: `pdf-processing` (新增capability)
- **影响的代码**:
  - `src/services/pdf/mistralOCR.ts` - 核心OCR处理逻辑重写
  - `src/components/pdf/PDFUploader.tsx` - 可能需要调整进度显示逻辑
- **用户体验**: PDF处理速度显著提升,处理更稳定
- **API成本**: 可能略微降低(专用OCR端点通常比Chat API更经济)
- **向后兼容**: 完全兼容,无需修改数据库schema或已存储的数据
