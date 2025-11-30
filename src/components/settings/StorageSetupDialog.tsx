import { useState } from 'react'
import { requestDirectoryAccess, getDirectoryPath, isFileSystemSupported } from '../../services/storage/fileSystem'
import { saveStorageRootPath } from '../../services/storage/db'

interface StorageSetupDialogProps {
  onComplete: () => void
}

export default function StorageSetupDialog({ onComplete }: StorageSetupDialogProps) {
  const [step, setStep] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState('')

  const handleSelectDirectory = async () => {
    if (!isFileSystemSupported()) {
      setError('当前浏览器不支持文件系统访问，请使用 Chrome 或 Edge 浏览器')
      return
    }

    setSelecting(true)
    setError('')

    try {
      const handle = await requestDirectoryAccess()
      const path = await getDirectoryPath(handle)
      await saveStorageRootPath(path)
      setStep(2)
      setTimeout(onComplete, 1500)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('设置存储目录失败: ' + (err as Error).message)
      }
      setSelecting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        {step === 0 && (
          <>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              欢迎使用学术论文阅读器
            </h2>
            <p className="text-gray-600 mb-6">
              本应用将论文和图片保存在您的本地文件系统中，而不是浏览器存储。
              这样可以：
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-2">
              <li>突破浏览器存储限制</li>
              <li>在其他应用中访问 Markdown 文件</li>
              <li>完全控制您的数据</li>
            </ul>
            <button
              onClick={() => setStep(1)}
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-medium"
            >
              开始设置
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              选择存储位置
            </h2>
            <p className="text-gray-600 mb-4">
              请选择一个文件夹来存储您的论文。应用会在该文件夹下创建子文件夹来组织内容。
            </p>
            
            {!isFileSystemSupported() && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  ⚠️ 当前浏览器不支持文件系统访问
                  <br />
                  请使用 Chrome 或 Edge 浏览器
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleSelectDirectory}
                disabled={selecting || !isFileSystemSupported()}
                className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-medium disabled:bg-gray-300"
              >
                {selecting ? '选择中...' : '选择文件夹'}
              </button>
              
              <p className="text-xs text-gray-500 text-center">
                推荐在文档目录下创建专门的文件夹
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-center">
              <div className="text-6xl mb-4">✓</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                设置完成!
              </h2>
              <p className="text-gray-600">
                现在可以开始上传论文了
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
