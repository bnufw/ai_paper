import { getAPIKey } from '../storage/db'

/**
 * CORS错误检测
 */
function isCORSError(error: any): boolean {
  return (
    error.message?.includes('CORS') ||
    error.message?.includes('Failed to fetch') ||
    error.name === 'TypeError'
  )
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Mistral OCR API 响应类型
 */
interface MistralOCRResponse {
  pages: Array<{
    markdown: string
    images: Array<{
      id: string           // 图片ID，如 "img-0.png"
      image_base64: string // base64编码的图片数据
    }>
  }>
}

/**
 * 文件上传响应类型
 */
interface FileUploadResponse {
  id: string
  object: string
  bytes: number
  created_at: number
  filename: string
  purpose: string
}

/**
 * 签名URL响应类型
 */
interface SignedUrlResponse {
  url: string
  expiry: number
}

/**
 * 验证 Mistral API Key 是否有效
 * @param apiKey API 密钥
 * @returns 是否有效
 */
async function validateAPIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })

    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}))
      return { 
        valid: false, 
        error: `API Key无效: ${errorData.message || '认证失败'}` 
      }
    }

    if (!response.ok) {
      return { 
        valid: false, 
        error: `验证失败 (${response.status}): ${response.statusText}` 
      }
    }

    return { valid: true }
  } catch (error) {
    return { 
      valid: false, 
      error: `网络错误: ${(error as Error).message}` 
    }
  }
}

/**
 * OCR 转换结果
 */
export interface OCRResult {
  markdown: string
  images: Array<{ index: number; data: string }>  // base64 图片数据
}

/**
 * 使用 Mistral OCR API 将 PDF 转换为 Markdown
 * @param pdfFile PDF 文件对象
 * @param onProgress 进度回调
 * @returns Markdown 文本和提取的图片数组
 */
export async function convertPDFToMarkdown(
  pdfFile: File,
  onProgress?: (stage: string, progress?: number) => void
): Promise<OCRResult> {
  const apiKey = await getAPIKey('mistral')

  if (!apiKey) {
    throw new Error('未配置Mistral API Key,请先在设置中配置')
  }

  // 验证 API Key 长度
  if (apiKey.length < 30) {
    throw new Error('Mistral API Key 格式不正确,请检查配置')
  }

  // 验证 API Key 有效性
  onProgress?.('验证API Key...', 0)
  const validation = await validateAPIKey(apiKey)
  if (!validation.valid) {
    throw new Error(
      `API Key验证失败\n\n` +
      `${validation.error}\n\n` +
      `请检查:\n` +
      `1. 访问 https://console.mistral.ai/ 确认API Key\n` +
      `2. 确保API Key有效且未过期\n` +
      `3. 确认账户有足够的配额`
    )
  }

  try {
    // 步骤1: 上传 PDF 文件
    onProgress?.('上传 PDF 文件...', 10)
    const fileId = await uploadPDFFile(pdfFile, apiKey)

    // 步骤2: 获取签名 URL
    onProgress?.('获取访问链接...', 30)
    const signedUrl = await getSignedUrl(fileId, apiKey)

    // 步骤3: 调用 OCR API
    onProgress?.('正在进行 OCR 识别...', 60)
    const ocrResult = await processOCR(signedUrl, apiKey)

    // 步骤4: 处理结果
    onProgress?.('处理识别结果...', 90)

    // 提取所有图片，建立 id -> index 映射
    const images: Array<{ index: number; data: string }> = []
    const imageIdToIndex: Record<string, number> = {}
    let imageIndex = 0

    for (const page of ocrResult.pages) {
      if (page.images && page.images.length > 0) {
        for (const img of page.images) {
          imageIdToIndex[img.id] = imageIndex
          images.push({ index: imageIndex, data: img.image_base64 })
          imageIndex++
        }
      }
    }

    // 处理每页 markdown，替换图片引用路径
    const processedPages: string[] = []
    for (const page of ocrResult.pages) {
      let pageMarkdown = page.markdown

      // 替换图片引用: ![img-0.png](img-0.png) -> ![img-0.png](images/image_0.png)
      if (page.images && page.images.length > 0) {
        for (const img of page.images) {
          const idx = imageIdToIndex[img.id]
          // 匹配 ![任意alt](图片id) 格式
          const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(img.id)}\\)`, 'g')
          pageMarkdown = pageMarkdown.replace(regex, `![$1](images/image_${idx}.png)`)
        }
      }

      processedPages.push(pageMarkdown)
    }

    const markdown = processedPages.join('\n\n---\n\n')

    onProgress?.('完成', 100)

    return { markdown, images }

  } catch (error) {
    if (isCORSError(error)) {
      throw new Error(
        '遇到跨域错误。请尝试以下解决方案之一:\n' +
        '1. 安装浏览器CORS扩展(如"CORS Unblock")\n' +
        '2. 使用CORS代理服务\n' +
        '原始错误:' + (error as Error).message
      )
    }

    // 记录详细错误信息
    console.error('Mistral OCR处理失败:', error)
    throw error
  }
}

/**
 * 上传 PDF 文件到 Mistral
 * @param file PDF 文件
 * @param apiKey API 密钥
 * @returns 文件 ID
 */
async function uploadPDFFile(file: File, apiKey: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('purpose', 'ocr')

  const response = await retryFetch('https://api.mistral.ai/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    
    // 针对401错误提供详细信息
    if (response.status === 401) {
      throw new Error(
        `API认证失败 (401): Mistral API Key无效或已过期\n\n` +
        `请检查:\n` +
        `1. API Key是否正确配置(当前长度: ${apiKey.length}字符)\n` +
        `2. API Key是否以"sk-"或正确格式开头\n` +
        `3. API Key是否在Mistral控制台有效\n` +
        `4. 账户是否有足够的配额\n\n` +
        `详细错误: ${errorData.message || response.statusText}`
      )
    }
    
    throw new Error(
      `文件上传失败 (${response.status}): ${errorData.message || response.statusText}`
    )
  }

  const data: FileUploadResponse = await response.json()
  return data.id
}

/**
 * 获取文件的签名 URL
 * @param fileId 文件 ID
 * @param apiKey API 密钥
 * @returns 签名 URL
 */
async function getSignedUrl(fileId: string, apiKey: string): Promise<string> {
  const urlEndpoint = `https://api.mistral.ai/v1/files/${fileId}/url?expiry=24`

  const response = await retryFetch(urlEndpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    
    if (response.status === 401) {
      throw new Error(
        `API认证失败 (401): 无法访问已上传的文件\n\n` +
        `可能原因:\n` +
        `1. API Key权限不足\n` +
        `2. API Key在文件上传后失效\n\n` +
        `详细错误: ${errorData.message || response.statusText}`
      )
    }
    
    throw new Error(
      `获取文件URL失败 (${response.status}): ${errorData.message || response.statusText}`
    )
  }

  const data: SignedUrlResponse = await response.json()
  return data.url
}

/**
 * 调用 Mistral OCR API 处理文档
 * @param documentUrl 文档的签名 URL
 * @param apiKey API 密钥
 * @returns OCR 识别结果
 */
async function processOCR(documentUrl: string, apiKey: string): Promise<MistralOCRResponse> {
  const response = await retryFetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        document_url: documentUrl
      },
      include_image_base64: true
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    
    if (response.status === 401) {
      throw new Error(
        `API认证失败 (401): OCR服务访问被拒绝\n\n` +
        `可能原因:\n` +
        `1. API Key没有OCR服务权限\n` +
        `2. 账户OCR配额已用完\n` +
        `3. OCR服务未启用\n\n` +
        `详细错误: ${errorData.message || response.statusText}`
      )
    }
    
    throw new Error(
      `OCR处理失败 (${response.status}): ${errorData.message || response.statusText}`
    )
  }

  const data: MistralOCRResponse = await response.json()
  return data
}

/**
 * 带重试机制的 fetch 函数
 * @param url 请求 URL
 * @param options fetch 选项
 * @param maxRetries 最大重试次数
 * @returns Response 对象
 */
async function retryFetch(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // 如果是 429 (Rate Limit) 或 5xx 错误,进行重试
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response

    } catch (error) {
      lastError = error as Error

      // 如果是最后一次尝试,直接抛出错误
      if (attempt === maxRetries - 1) {
        break
      }

      // 指数退避:第1次重试等待1秒,第2次等待2秒
      const delay = Math.pow(2, attempt) * 1000
      console.warn(`请求失败,${delay}ms 后重试... (尝试 ${attempt + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('请求失败')
}

/**
 * 兼容旧版本的接口:将图片数组转换为 Markdown
 * @deprecated 请使用 convertPDFToMarkdown 代替
 * @param _images Base64编码的图片数组
 * @param _onProgress 进度回调
 * @returns Markdown文本
 */
export async function convertImagesToMarkdown(
  _images: string[],
  _onProgress?: (current: number, total: number) => void
): Promise<string> {
  // 此函数保持向后兼容,但内部实现已废弃
  // 由于新的 API 需要 PDF 文件而不是图片数组,这里返回错误提示
  throw new Error(
    '此方法已废弃,请使用 convertPDFToMarkdown 直接处理 PDF 文件。\n' +
    '新的实现使用 Mistral 专用 OCR API,处理速度更快,识别质量更好。'
  )
}
