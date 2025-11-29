# pdf-processing Specification

## Purpose
本规范定义了学术论文阅读器的 PDF 处理能力,使用 Mistral 专用 OCR API 将 PDF 文档转换为 Markdown 格式。该能力为用户提供高性能、高质量的文档识别服务,支持数学公式、表格、图片等复杂学术内容的准确识别。
## Requirements
### Requirement: Mistral OCR API Integration
The system SHALL use Mistral's dedicated OCR API endpoint for PDF document recognition to provide high-performance document conversion capabilities.

#### Scenario: PDF文件上传成功
- **WHEN** 用户提供PDF文件进行OCR处理
- **THEN** 系统应将PDF文件上传到Mistral Files API (`/v1/files`)
- **AND** 系统应获取上传文件的file ID
- **AND** 文件上传应使用FormData格式,purpose设置为"ocr"

#### Scenario: 获取文件签名URL
- **WHEN** PDF文件上传成功后
- **THEN** 系统应调用`/v1/files/{fileId}/url`端点获取签名URL
- **AND** URL过期时间应设置为24小时
- **AND** 系统应验证返回的URL有效性

#### Scenario: 执行OCR处理
- **WHEN** 获得文件签名URL后
- **THEN** 系统应调用`/v1/ocr`端点执行文档识别
- **AND** 使用模型 `mistral-ocr-latest`
- **AND** 请求应包含document_url参数指向签名URL
- **AND** 请求应包含include_image_base64参数为true以获取base64图片
- **AND** 系统应解析返回的pages数组,提取每页的markdown内容

#### Scenario: OCR处理失败
- **WHEN** OCR API调用失败
- **THEN** 系统应检查错误类型(CORS、认证、网络等)
- **AND** 系统应提供清晰的错误信息给用户
- **AND** 系统应建议相应的解决方案(如安装CORS扩展)

### Requirement: 自动重试机制
The system SHALL implement an intelligent retry mechanism to improve the success rate and stability of OCR processing.

#### Scenario: 网络请求失败自动重试
- **WHEN** API请求因网络问题、429或5xx错误失败
- **THEN** 系统应自动重试最多3次
- **AND** 每次重试之间应有指数退避延迟(1秒、2秒)
- **AND** 重试应包含完整的错误日志

#### Scenario: 达到最大重试次数
- **WHEN** 请求重试3次后仍然失败
- **THEN** 系统应停止重试并抛出最终错误
- **AND** 错误信息应包含所有重试尝试的详细日志

### Requirement: API密钥验证
The system SHALL validate the Mistral API key before performing OCR processing.

#### Scenario: API密钥格式验证
- **WHEN** 系统准备调用Mistral API时
- **THEN** 系统应检查API密钥是否已配置
- **AND** 系统应验证API密钥长度至少为30字符
- **AND** 如果验证失败,应提示用户在设置中配置有效密钥

#### Scenario: API密钥认证失败
- **WHEN** API调用返回401或403状态码
- **THEN** 系统应识别为认证错误
- **AND** 系统应提示用户检查API密钥是否正确

### Requirement: 图片处理
The system SHALL correctly process base64 images in OCR results and store them for display.

#### Scenario: 提取base64图片
- **WHEN** OCR API返回包含base64编码图片的结果
- **THEN** 系统应从每页结果中提取图片数据
- **AND** 图片应按页面顺序存储到数组中
- **AND** Markdown中的图片引用应使用`![description](image_N.png)`格式

#### Scenario: 重新编号图片引用
- **WHEN** 合并所有页面的OCR结果时
- **THEN** 系统应统一重新编号所有图片引用
- **AND** 编号应从0开始连续递增
- **AND** 图片文件名格式应保持一致

### Requirement: 进度跟踪
The system SHALL provide accurate OCR processing progress information to users.

#### Scenario: 处理阶段进度
- **WHEN** PDF OCR处理进行中时
- **THEN** 系统应通过回调报告当前处理阶段
- **AND** 阶段包括:上传PDF(0%)、获取URL(30%)、OCR识别(60%)、处理结果(90%)、完成(100%)
- **AND** 进度回调格式为 `onProgress(stage: string, percent?: number)`

#### Scenario: 处理完成
- **WHEN** 所有页面OCR完成后
- **THEN** 系统应报告100%完成状态
- **AND** 系统应返回包含markdown和images的对象
- **AND** Markdown文本应包含所有页面内容,用`---`分隔符连接

