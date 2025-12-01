# chat-image-upload Specification

## Purpose
TBD - created by archiving change add-chat-enhancements. Update Purpose after archive.
## Requirements
### Requirement: 图片选择与上传
The system SHALL allow users to select and upload images in the chat input area.

#### Scenario: 点击上传按钮选择图片
- **WHEN** 用户点击输入区域的图片上传按钮
- **THEN** 系统应打开文件选择对话框
- **AND** 文件选择器应限制为图片类型(image/jpeg, image/png, image/webp, image/gif)
- **AND** 用户可选择多张图片(最多4张)

#### Scenario: 拖拽上传图片
- **WHEN** 用户将图片文件拖拽到输入区域
- **THEN** 输入区域应显示拖拽提示样式
- **AND** 释放后系统应接收并处理图片
- **AND** 支持同时拖入多张图片

#### Scenario: 粘贴上传图片
- **WHEN** 用户在输入框中粘贴剪贴板中的图片
- **THEN** 系统应自动检测并添加图片
- **AND** 支持从截图工具直接粘贴

### Requirement: 图片预览与管理
The system SHALL display uploaded images as previews before sending.

#### Scenario: 显示图片预览
- **WHEN** 用户添加图片后
- **THEN** 输入区域上方应显示图片缩略图预览
- **AND** 每张图片应显示为60x60px的缩略图
- **AND** 缩略图应保持图片比例，超出部分裁剪

#### Scenario: 删除待发送图片
- **WHEN** 用户点击预览图片的删除按钮(X)
- **THEN** 该图片应从待发送列表中移除
- **AND** 预览区域应立即更新

#### Scenario: 图片数量限制
- **WHEN** 用户尝试添加超过4张图片
- **THEN** 系统应阻止添加并显示提示"最多添加4张图片"
- **AND** 现有图片应保持不变

### Requirement: 图片压缩处理
The system SHALL compress images to optimize storage and API usage.

#### Scenario: 自动压缩大图
- **WHEN** 用户添加宽度超过1024px的图片
- **THEN** 系统应自动将图片缩放至最大1024px宽度
- **AND** 保持原始宽高比
- **AND** 使用JPEG格式，质量0.8

#### Scenario: 压缩后大小检查
- **WHEN** 图片压缩后仍超过1MB
- **THEN** 系统应进一步降低质量直到满足要求
- **AND** 最低质量不低于0.5

#### Scenario: 原图过大拒绝
- **WHEN** 用户选择的原始图片超过10MB
- **THEN** 系统应拒绝该图片
- **AND** 显示提示"图片过大，请选择小于10MB的图片"

### Requirement: 图片消息发送
The system SHALL send images along with text to the AI model.

#### Scenario: 发送图文混合消息
- **WHEN** 用户添加图片并输入文本后点击发送
- **THEN** 系统应将文本和图片一起发送到Gemini API
- **AND** 图片应以inlineData格式发送
- **AND** 用户消息应显示文本内容和图片缩略图

#### Scenario: 仅发送图片
- **WHEN** 用户仅添加图片未输入文本
- **THEN** 用户应可以发送该消息
- **AND** API调用应仅包含图片数据
- **AND** 消息记录应保存为空文本+图片

#### Scenario: 图片发送失败
- **WHEN** 图片发送过程中发生错误
- **THEN** 系统应显示错误提示
- **AND** 待发送的图片和文本应保留在输入区域
- **AND** 用户可重试发送

### Requirement: 图片消息存储
The system SHALL persist images in message records.

#### Scenario: 保存图片到数据库
- **WHEN** 消息发送成功后
- **THEN** 图片数据应以base64格式存储在Message记录的images字段
- **AND** 每张图片应记录mimeType

#### Scenario: 加载历史图片消息
- **WHEN** 用户切换到包含图片的历史对话
- **THEN** 消息列表应正确显示历史图片
- **AND** 图片应可点击放大查看

### Requirement: 图片消息显示
The system SHALL display images in sent and received messages.

#### Scenario: 显示用户发送的图片
- **WHEN** 消息列表渲染包含图片的用户消息
- **THEN** 应在消息气泡内显示图片缩略图
- **AND** 多张图片应横向排列，自动换行
- **AND** 点击图片应可放大查看原图

#### Scenario: 图片查看器
- **WHEN** 用户点击消息中的图片
- **THEN** 系统应显示图片查看器弹窗
- **AND** 支持缩放和拖拽查看
- **AND** 多张图片支持左右切换
- **AND** 点击遮罩或按Esc可关闭

