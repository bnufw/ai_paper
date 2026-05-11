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
    const blob = await fetchPdfBlob(url)
    onSource?.('direct')
    return blobToPdfFile(blob, filename)
  } catch (directError) {
    console.warn('直接下载 PDF 失败，切换后端代理:', directError)
  }

  const proxyUrl = `${PDF_PROXY_ENDPOINT}?url=${encodeURIComponent(url)}`
  const blob = await fetchPdfBlob(proxyUrl, url)
  onSource?.('proxy')
  return blobToPdfFile(blob, filename)
}

async function fetchPdfBlob(url: string, sourceUrl = url): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`PDF 下载失败: HTTP ${response.status}`)
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
