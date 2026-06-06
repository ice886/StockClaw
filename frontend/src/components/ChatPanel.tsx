import { sendMessage } from "../api/agent";
import type { Message } from "../types/chat";
import { useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import "./ChatPanel.css";

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async (content: string) => {
    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await sendMessage(newMessages);
      setMessages([...newMessages, { role: 'assistant', content: res.content }]);
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: '请求失败' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-panel">
      <MessageList messages={messages} loading={loading} />
      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  );
}