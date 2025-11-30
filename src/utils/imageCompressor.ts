import { MessageImage } from '../services/storage/db'

const MAX_WIDTH = 1024
const MAX_HEIGHT = 1024
const JPEG_QUALITY = 0.8
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_COMPRESSED_SIZE = 1 * 1024 * 1024 // 1MB

/**
 * 压缩图片文件
 * @param file 图片文件
 * @returns 压缩后的MessageImage对象
 * @throws 文件过大或格式不支持时抛出错误
 */
export async function compressImage(file: File): Promise<MessageImage> {
  // 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('图片过大,请选择小于10MB的图片')
  }

  // 检查文件类型
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!supportedTypes.includes(file.type)) {
    throw new Error('仅支持JPG、PNG、WebP、GIF格式')
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.src = e.target?.result as string
    }

    reader.onerror = () => {
      reject(new Error('图片读取失败'))
    }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          throw new Error('Canvas上下文创建失败')
        }

        // 计算压缩后的尺寸(保持宽高比)
        let { width, height } = img
        
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
          width = Math.floor(width * ratio)
          height = Math.floor(height * ratio)
        }

        canvas.width = width
        canvas.height = height

        // 绘制图片
        ctx.drawImage(img, 0, 0, width, height)

        // 转换为base64(优先JPEG以减小体积)
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const dataUrl = canvas.toDataURL(mimeType, JPEG_QUALITY)
        
        // 提取base64数据(移除data:前缀)
        const base64Data = dataUrl.split(',')[1]
        
        // 检查压缩后大小
        const compressedSize = base64Data.length * 0.75 // base64大约比原始大1.33倍
        if (compressedSize > MAX_COMPRESSED_SIZE) {
          console.warn(`图片压缩后仍较大: ${(compressedSize / 1024).toFixed(0)}KB`)
        }

        resolve({
          data: base64Data,
          mimeType,
          width,
          height
        })
      } catch (err) {
        reject(new Error('图片压缩失败'))
      }
    }

    img.onerror = () => {
      reject(new Error('图片加载失败'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * 批量压缩图片
 * @param files 图片文件数组
 * @param maxCount 最大图片数量
 * @returns 压缩后的MessageImage数组
 */
export async function compressImages(
  files: File[],
  maxCount: number = 4
): Promise<MessageImage[]> {
  if (files.length > maxCount) {
    throw new Error(`单条消息最多上传${maxCount}张图片`)
  }

  const promises = files.map(file => compressImage(file))
  return Promise.all(promises)
}
