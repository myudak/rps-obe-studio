import { create } from "zustand"

import type { ChatMessage } from "@/lib/ai-types"

type ChatStore = {
  messages: ChatMessage[]
  hydrateMessages: (messages: ChatMessage[]) => void
  appendMessage: (message: ChatMessage) => void
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>()((set) => ({
  messages: [],
  hydrateMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, patch) => set((state) => ({
    messages: state.messages.map((message) => message.id === id ? { ...message, ...patch } : message),
  })),
  clearMessages: () => set({ messages: [] }),
}))
