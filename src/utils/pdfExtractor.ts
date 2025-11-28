import * as pdfjsLib from 'pdfjs-dist'

// 配置PDF.js worker - 使用本地worker文件而不是CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * 将PDF文件转换为图片数组（Base64格式）
 * @param file PDF文件
 * @param onProgress 进度回调
 * @returns Base64编码的图片数组
 */
export async function extractPDFAsImages(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []
  const totalPages = pdf.numPages

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 2.0 })

    // 创建canvas
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = viewport.width
    canvas.height = viewport.height

    // 渲染页面到canvas
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise

    // 转换为Base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8)
    images.push(imageData.split(',')[1]) // 只保留Base64部分

    // 更新进度
    if (onProgress) {
      onProgress(pageNum, totalPages)
    }
  }

  return images
}
