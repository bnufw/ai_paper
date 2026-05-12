type FetchSource = 'direct' | 'proxy'

const PDF_PROXY_ENDPOINT = '/api/download-pdf'

export async function fetchPdfFile(
  url: string,
  filename: string,
  onSource?: (source: FetchSource) => void
): Promise<File> {
  if (!url.trim()) {
    throw new Error('PDF 链接为空')
  }

  try {
    const blob = await fetchPdfBlob(url, url, 'direct')
    onSource?.('direct')
    return blobToPdfFile(blob, filename)
  } catch (directError) {
    console.warn('直接下载 PDF 失败，切换后端代理:', directError)

    const proxyUrl = `${PDF_PROXY_ENDPOINT}?url=${encodeURIComponent(url)}`
    try {
      const blob = await fetchPdfBlob(proxyUrl, url, 'proxy')
      onSource?.('proxy')
      return blobToPdfFile(blob, filename)
    } catch (proxyError) {
      throw new Error(
        `${toErrorMessage(proxyError)}\n直接下载失败原因：${toErrorMessage(directError)}`
      )
    }
  }
}

async function fetchPdfBlob(
  url: string,
  sourceUrl = url,
  context: FetchSource = 'direct'
): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(await buildDownloadError(response, context))
  }

  const blob = await response.blob()
  const contentType = response.headers.get('content-type') || blob.type
  const looksLikePdf = contentType.toLowerCase().includes('pdf')
    || sourceUrl.toLowerCase().split('?', 1)[0].endsWith('.pdf')

  if (!looksLikePdf) {
    throw new Error('下载结果不是 PDF 文件')
  }

  return blob.type === 'application/pdf'
    ? blob
    : new Blob([blob], { type: 'application/pdf' })
}

async function buildDownloadError(response: Response, context: FetchSource): Promise<string> {
  const detail = await readErrorDetail(response)
  if (context === 'proxy' && response.status === 404) {
    return '后端 PDF 代理接口未加载（HTTP 404），请重启后端服务。'
  }

  if (context === 'proxy') {
    return `PDF 代理下载失败: ${detail || `HTTP ${response.status}`}`
  }

  return `论文源下载失败: ${detail || `HTTP ${response.status}`}`
}

async function readErrorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return ''

  try {
    const parsed = JSON.parse(text)
    return typeof parsed.detail === 'string' ? parsed.detail : text
  } catch {
    return text.slice(0, 200)
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function blobToPdfFile(blob: Blob, filename: string): File {
  const safeName = sanitizePdfFilename(filename)
  return new File([blob], safeName, { type: 'application/pdf' })
}

function sanitizePdfFilename(filename: string): string {
  const base = filename
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 120)
    || 'paper'

  return `${base}.pdf`
}
