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
 * 调用Mistral Vision API将PDF图片转换为Markdown
 * @param images Base64编码的图片数组
 * @param onProgress 进度回调
 * @returns Markdown文本
 */
export async function convertImagesToMarkdown(
  images: string[],
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  const apiKey = await getAPIKey('mistral')

  if (!apiKey) {
    throw new Error('未配置Mistral API Key，请先在设置中配置')
  }

  // 分批处理:每批最多8张图片(Mistral API限制)
  const batchSize = 8
  const batches: string[][] = []

  for (let i = 0; i < images.length; i += batchSize) {
    batches.push(images.slice(i, i + batchSize))
  }

  const markdownResults: string[] = []

  // 处理每一批
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]

    try {
      const markdown = await processBatch(batch, apiKey)
      markdownResults.push(markdown)

      // 更新进度
      if (onProgress) {
        const processedPages = (batchIndex + 1) * batchSize
        onProgress(Math.min(processedPages, images.length), images.length)
      }
    } catch (error) {
      if (isCORSError(error)) {
        throw new Error(
          '遇到跨域错误。请尝试以下解决方案之一：\n' +
          '1. 安装浏览器CORS扩展（如"CORS Unblock"）\n' +
          '2. 使用CORS代理服务\n' +
          '原始错误：' + (error as Error).message
        )
      }
      throw error
    }
  }

  // 合并所有批次的结果
  return markdownResults.join('\n\n---\n\n')
}

/**
 * 处理单个批次的图片
 */
async function processBatch(images: string[], apiKey: string): Promise<string> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'pixtral-12b-2409',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请将这些PDF页面转换为Markdown格式。要求：\n' +
                    '1. 保留论文的结构（标题、章节、段落）\n' +
                    '2. 数学公式使用LaTeX格式，用$$...$$包裹块级公式，$...$包裹行内公式\n' +
                    '3. 表格使用Markdown表格格式\n' +
                    '4. 对于图片，使用![image_N](image_N.png)格式标记，N从0开始递增\n' +
                    '5. 保留代码块的格式\n' +
                    '请直接输出Markdown，不要添加任何额外说明。'
            },
            ...images.map((imageBase64) => ({
              type: 'image_url',
              image_url: `data:image/jpeg;base64,${imageBase64}`
            }))
          ]
        }
      ],
      max_tokens: 4096
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(
      `Mistral API错误 (${response.status}): ${errorData.message || response.statusText}`
    )
  }

  const data = await response.json()
  const markdown = data.choices[0].message.content

  return markdown
}

/**
 * 重新编号Markdown中的图片引用
 */
export function renumberImageReferences(markdown: string): string {
  let imageIndex = 0
  return markdown.replace(/!\[([^\]]*)\]\(image_\d+\.png\)/g, (_match, altText) => {
    return `![${altText}](image_${imageIndex++}.png)`
  })
}
