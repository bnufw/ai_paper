import { useState } from 'react'
import { MessageImage } from '../../services/storage/db'

interface ImageViewerProps {
  images: MessageImage[]
  initialIndex?: number
  onClose: () => void
}

export default function ImageViewer({ images, initialIndex = 0, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  const handlePrevious = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNext = () => {
    setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowLeft') handlePrevious()
    else if (e.key === 'ArrowRight') handleNext()
  }

  const currentImage = images[currentIndex]

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
        title="关闭(Esc)"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative max-w-7xl max-h-screen p-4" onClick={e => e.stopPropagation()}>
        <img
          src={`data:${currentImage.mimeType};base64,${currentImage.data}`}
          alt={`图片 ${currentIndex + 1}`}
          className="max-w-full max-h-screen object-contain"
        />

        {images.length > 1 && (
          <>
            <button
              onClick={handlePrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-3 rounded-full hover:bg-opacity-70"
              title="上一张(←)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-3 rounded-full hover:bg-opacity-70"
              title="下一张(→)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded-full">
              {currentIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
