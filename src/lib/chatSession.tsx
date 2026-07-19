import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useChat, type UseChatResult } from "../hooks/useChat";
import { useStore } from "./store";

const ChatSessionContext = createContext<UseChatResult | null>(null);

/** Keeps dashboard chat messages in memory across tab changes, but never on disk. */
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { settings } = useStore();
  const [authVersion, setAuthVersion] = useState(0);
  const channels = useMemo(
    () => ({ twitch: settings.twitchChannel, kick: settings.kickChannel }),
    [settings.twitchChannel, settings.kickChannel]
  );
  const enabled = Boolean(settings.twitchChannel.trim() || settings.kickChannel.trim());
  useEffect(() => {
    const reconnect = () => setAuthVersion((version) => version + 1);
    window.addEventListener("sc:twitch-chat-auth-changed", reconnect);
    return () => window.removeEventListener("sc:twitch-chat-auth-changed", reconnect);
  }, []);

  const chat = useChat({
    enabled,
    channels,
    blacklist: settings.chatBlacklist,
    connectionKey: String(authVersion),
  });

  return <ChatSessionContext.Provider value={chat}>{children}</ChatSessionContext.Provider>;
}

export function useChatSession(): UseChatResult {
  const chat = useContext(ChatSessionContext);
  if (!chat) throw new Error("useChatSession must be used inside ChatSessionProvider");
  return chat;
}
