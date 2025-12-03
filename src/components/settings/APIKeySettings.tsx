import { useState, useEffect } from 'react'
import { getAPIKey, saveAPIKey, getGeminiSettings, saveGeminiSettings, GeminiSettings, getStorageRootPath, saveStorageRootPath } from '../../services/storage/db'
import { requestDirectoryAccess, getDirectoryHandle, getDirectoryPath, isFileSystemSupported } from '../../services/storage/fileSystem'

interface APIKeySettingsProps {
  onClose: () => void
}

export default function APIKeySettings({ onClose }: APIKeySettingsProps) {
  const [keys, setKeys] = useState({
    mistral: '',
    gemini: ''
  })

  const [showKeys, setShowKeys] = useState({
    mistral: false,
    gemini: false
  })

  const [geminiSettings, setGeminiSettings] = useState<GeminiSettings>({
    model: 'gemini-2.5-pro',
    temperature: 1.0,
    streaming: true,
    useSearch: false,
    showThoughts: true,
    thinkingBudget: 8192,
    thinkingLevel: 'HIGH'
  })

  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [changingStorage, setChangingStorage] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      const [mistral, gemini, settings, rootPath] = await Promise.all([
        getAPIKey('mistral'),
        getAPIKey('gemini'),
        getGeminiSettings(),
        getStorageRootPath()
      ])

      setKeys({
        mistral: mistral || '',
        gemini: gemini || ''
      })
      setGeminiSettings(settings)
      setStoragePath(rootPath)

      // 如果有保存的路径，尝试恢复目录句柄
      if (!rootPath) {
        const handle = await getDirectoryHandle()
        if (handle) {
          const path = await getDirectoryPath(handle)
          setStoragePath(path)
          await saveStorageRootPath(path)
        }
      }
    }

    loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage('')

    try {
      await Promise.all([
        keys.mistral && saveAPIKey('mistral', keys.mistral),
        keys.gemini && saveAPIKey('gemini', keys.gemini),
        saveGeminiSettings(geminiSettings)
      ])

      setSaveMessage('✓ 保存成功!')
      window.dispatchEvent(new CustomEvent('gemini-settings-changed'))
      setTimeout(() => onClose(), 500)
    } catch (error) {
      setSaveMessage('✗ 保存失败:' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // 选择/更换存储目录
  const handleChangeStorage = async () => {
    if (!isFileSystemSupported()) {
      alert('当前浏览器不支持文件系统访问，请使用 Chrome 或 Edge 浏览器')
      return
    }

    setChangingStorage(true)
    try {
      const handle = await requestDirectoryAccess()
      const path = await getDirectoryPath(handle)
      setStoragePath(path)
      await saveStorageRootPath(path)
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        alert('设置存储目录失败:' + (error as Error).message)
      }
    } finally {
      setChangingStorage(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">API密钥与模型配置</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          {/* 存储目录配置 */}
          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">本地存储配置</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                存储目录
                <span className="text-gray-500 text-xs ml-2">(论文和图片保存位置)</span>
              </label>
              
              {storagePath ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-700">
                    📁 {storagePath}
                  </div>
                  <button
                    onClick={handleChangeStorage}
                    disabled={changingStorage}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-sm"
                  >
                    {changingStorage ? '选择中...' : '更换'}
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    onClick={handleChangeStorage}
                    disabled={changingStorage}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
                  >
                    {changingStorage ? '选择中...' : '选择存储目录'}
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    首次使用需要选择一个目录来存储论文文件
                  </p>
                </div>
              )}
            </div>

            {!isFileSystemSupported() && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  ⚠️ 当前浏览器不支持文件系统访问，请使用 Chrome 或 Edge 浏览器
                </p>
              </div>
            )}
          </div>

          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">API密钥</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mistral API Key
                <span className="text-gray-500 text-xs ml-2">(用于PDF OCR转换)</span>
              </label>
              <div className="relative">
                <input
                  type={showKeys.mistral ? 'text' : 'password'}
                  name="mistral-api-key"
                  autoComplete="off"
                  value={keys.mistral}
                  onChange={(e) => setKeys({ ...keys, mistral: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                <button
                  type="button"
                  onClick={() => setShowKeys({ ...showKeys, mistral: !showKeys.mistral })}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                >
                  {showKeys.mistral ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Google Gemini API Key
                <span className="text-gray-500 text-xs ml-2">(用于AI对话)</span>
              </label>
              <div className="relative">
                <input
                  type={showKeys.gemini ? 'text' : 'password'}
                  name="gemini-api-key"
                  autoComplete="off"
                  value={keys.gemini}
                  onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                  placeholder="AI..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
                <button
                  type="button"
                  onClick={() => setShowKeys({ ...showKeys, gemini: !showKeys.gemini })}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                >
                  {showKeys.gemini ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Gemini模型配置</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                模型选择
              </label>
              <select
                value={geminiSettings.model}
                onChange={(e) => setGeminiSettings({
                  ...geminiSettings,
                  model: e.target.value as 'gemini-2.5-pro' | 'gemini-3-pro-preview'
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              >
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-3-pro-preview">Gemini 3.0 Pro Preview</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                温度 (Temperature): {geminiSettings.temperature.toFixed(1)}
                <span className="text-gray-500 text-xs ml-2">(控制输出随机性,0.0-2.0)</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={geminiSettings.temperature}
                onChange={(e) => setGeminiSettings({
                  ...geminiSettings,
                  temperature: parseFloat(e.target.value)
                })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>更确定 (0.0)</span>
                <span>平衡 (1.0)</span>
                <span>更创造性 (2.0)</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={geminiSettings.streaming}
                  onChange={(e) => setGeminiSettings({
                    ...geminiSettings,
                    streaming: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  启用流式输出
                  <span className="text-gray-500 text-xs ml-2">(实时显示AI回复)</span>
                </span>
              </label>
            </div>

            <div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={geminiSettings.useSearch}
                  onChange={(e) => setGeminiSettings({
                    ...geminiSettings,
                    useSearch: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  启用联网搜索
                  <span className="text-gray-500 text-xs ml-2">(允许AI搜索最新信息)</span>
                </span>
              </label>
            </div>

            <div className="mb-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={geminiSettings.showThoughts}
                  onChange={(e) => setGeminiSettings({
                    ...geminiSettings,
                    showThoughts: e.target.checked
                  })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  显示思考过程
                  <span className="text-gray-500 text-xs ml-2">(展示AI的推理过程)</span>
                </span>
              </label>
            </div>

            {/* 根据模型类型显示不同的思考配置 */}
            {geminiSettings.model === 'gemini-3-pro-preview' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  思考强度 (Thinking Level)
                  <span className="text-gray-500 text-xs ml-2">(Gemini 3 Pro专用)</span>
                </label>
                <select
                  value={geminiSettings.thinkingLevel || 'HIGH'}
                  onChange={(e) => setGeminiSettings({
                    ...geminiSettings,
                    thinkingLevel: e.target.value as 'LOW' | 'HIGH'
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                >
                  <option value="LOW">LOW - 快速思考</option>
                  <option value="HIGH">HIGH - 深度思考</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  LOW适合简单问题，HIGH适合复杂推理
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  思考预算 (Thinking Budget): {geminiSettings.thinkingBudget} tokens
                  <span className="text-gray-500 text-xs ml-2">(0-32768,值越大思考越深入)</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="32768"
                  step="1024"
                  value={geminiSettings.thinkingBudget}
                  onChange={(e) => setGeminiSettings({
                    ...geminiSettings,
                    thinkingBudget: parseInt(e.target.value)
                  })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>关闭 (0)</span>
                  <span>标准 (8192)</span>
                  <span>深度 (32768)</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ 安全提示:</strong>
            <br />
            • API密钥仅存储在您浏览器的本地数据库中,不会上传到任何服务器
            <br />
            • 建议使用个人开发密钥,并在API提供商处设置使用限额
            <br />
            • 不要在公共或共享设备上保存密钥
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
                {saveMessage}
              </span>
            )}
          </div>
          <div className="space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
