import { useRef } from 'react'
import { compressImages } from '../../utils/imageCompressor'
import { MessageImage } from '../../services/storage/db'

interface ImageUploadButtonProps {
  onImagesSelected: (images: MessageImage[]) => void
  disabled?: boolean
  maxCount?: number
}

export default function ImageUploadButton({
  onImagesSelected,
  disabled = false,
  maxCount = 4
}: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    try {
      const fileArray = Array.from(files)
      const compressedImages = await compressImages(fileArray, maxCount)
      onImagesSelected(compressedImages)
    } catch (err) {
      alert((err as Error).message)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    // 清空input,允许重复选择同一文件
    e.target.value = ''
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="上传图片"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </>
  )
}
