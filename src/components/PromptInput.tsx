import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface PromptInputProps {
  onSubmit: (prompt: string) => void
  disabled?: boolean
  processing?: boolean
  error?: string | null
  initialValue?: string
  onValueChange?: (value: string) => void
}

export function PromptInput({ onSubmit, disabled, processing, error, initialValue = "", onValueChange }: PromptInputProps) {
  const [prompt, setPrompt] = useState(initialValue)

  useEffect(() => {
    setPrompt(initialValue)
  }, [initialValue])

  const handleChange = (value: string) => {
    setPrompt(value)
    onValueChange?.(value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (prompt.trim()) {
      onSubmit(prompt)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="prompt"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Modification Instructions
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          placeholder="Describe how you want to modify the selected cells..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          rows={4}
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !prompt.trim()}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Modify Image'
        )}
      </button>
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </form>
  )
}
