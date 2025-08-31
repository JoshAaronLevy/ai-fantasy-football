import { useState } from 'react'
import { InputTextarea } from 'primereact/inputtextarea'
import { Button } from 'primereact/button'

interface QueryInputProps {
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

export function QueryInput({ disabled = false, onSubmit }: QueryInputProps) {
  const [inputText, setInputText] = useState('')

  const handleSubmit = () => {
    const trimmed = inputText.trim()
    if (trimmed) {
      onSubmit(trimmed)
      setInputText('')
    }
  }

  return (
    <div className="mt-4 p-4 bg-white border-t border-gray-200">
      <div className="flex gap-2">
        <InputTextarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask the AI assistant a question about your draft..."
          rows={2}
          autoResize
          className="flex-1"
          disabled={disabled}
        />
        <Button
          icon={disabled ? "pi pi-spin pi-spinner" : "pi pi-send"}
          label="Send"
          onClick={handleSubmit}
          disabled={disabled || !inputText.trim()}
          className="p-button-primary"
          style={{ minWidth: '80px' }}
        />
      </div>
    </div>
  )
}