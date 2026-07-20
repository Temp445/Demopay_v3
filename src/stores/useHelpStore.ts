import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export type HelpTab = 'knowledge-base' | 'chatbot';

interface HelpStore {
  isOpen: boolean;
  activeTab: HelpTab;
  currentPageContext: string;
  searchQuery: string;
  selectedArticleId: string | null;
  chatbotMessages: ChatMessage[];
  isTyping: boolean;

  // Actions
  openHelp: (tab?: HelpTab) => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  setActiveTab: (tab: HelpTab) => void;
  setCurrentPageContext: (path: string) => void;
  setSearchQuery: (query: string) => void;
  setSelectedArticle: (id: string | null) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setIsTyping: (typing: boolean) => void;
  clearChat: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 10);

export const useHelpStore = create<HelpStore>((set) => ({
  isOpen: false,
  activeTab: 'knowledge-base',
  currentPageContext: '',
  searchQuery: '',
  selectedArticleId: null,
  chatbotMessages: [
    {
      id: generateId(),
      role: 'assistant',
      content:
        "👋 Hi! I'm your Payroll Assistant. You can ask me anything about payroll processing, attendance, overtime, leaves, and more. How can I help you today?",
      timestamp: new Date(),
    },
  ],
  isTyping: false,

  openHelp: (tab) =>
    set((state) => ({
      isOpen: true,
      activeTab: tab ?? state.activeTab,
    })),

  closeHelp: () => set({ isOpen: false, selectedArticleId: null, searchQuery: '' }),

  toggleHelp: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      selectedArticleId: state.isOpen ? null : state.selectedArticleId,
      searchQuery: state.isOpen ? '' : state.searchQuery,
    })),

  setActiveTab: (tab) => set({ activeTab: tab, selectedArticleId: null, searchQuery: '' }),

  setCurrentPageContext: (path) => set({ currentPageContext: path }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedArticle: (id) => set({ selectedArticleId: id }),

  addChatMessage: (message) =>
    set((state) => ({
      chatbotMessages: [
        ...state.chatbotMessages,
        { ...message, id: generateId(), timestamp: new Date() },
      ],
    })),

  setIsTyping: (typing) => set({ isTyping: typing }),

  clearChat: () =>
    set({
      chatbotMessages: [
        {
          id: generateId(),
          role: 'assistant',
          content:
            "👋 Hi! I'm your Payroll Assistant. You can ask me anything about payroll processing, attendance, overtime, leaves, and more. How can I help you today?",
          timestamp: new Date(),
        },
      ],
    }),
}));
