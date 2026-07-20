import { create } from 'zustand';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  emotion?: string;
  relatedSpots?: string[];
}

interface ChatStore {
  sessionId: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  setSessionId: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  sessionId: '',
  messages: [],
  isStreaming: false,
  setSessionId: (id) => set({ sessionId: id }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setStreaming: (v) => set({ isStreaming: v }),
  clearMessages: () => set({ messages: [] }),
}));
