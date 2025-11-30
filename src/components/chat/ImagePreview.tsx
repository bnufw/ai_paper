import { MessageImage } from '../../services/storage/db'

interface ImagePreviewProps {
  images: MessageImage[]
  onRemove: (index: number) => void
}

export default function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null

  return (
    <div className="flex gap-2 flex-wrap mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
      {images.map((img, index) => (
        <div key={index} className="relative group">
          <img
            src={`data:${img.mimeType};base64,${img.data}`}
            alt={`预览 ${index + 1}`}
            className="w-20 h-20 object-cover rounded border border-gray-300"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
            title="删除图片"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
