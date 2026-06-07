import { sendMessage } from '../api/agent';
import { fetchSession, updateSession, generateTitle } from '../api/session';
import type { Message } from '../types/chat';
import { useState, useEffect, useRef } from 'react';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import './ChatPanel.css';

interface Props {
  sessionId: string | null;
  onSessionUpdate: () => void;
}

export function ChatPanel({ sessionId, onSessionUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('新对话');
  const titled = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    fetchSession(sessionId)
      .then((r) => {
        setMessages(r.messages);
        setTitle(r.title);
        titled.current = r.title !== '新对话';
      })
      .catch(() => setMessages([]));
  }, [sessionId]);

  const handleSend = async (content: string) => {
    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await sendMessage(newMessages);
      const final: Message[] = [...newMessages, { role: 'assistant' as const, content: res.content }];
      setMessages(final);

      // 首次对话完成后，自动生成标题
      let newTitle = title;
      if (!titled.current) {
        titled.current = true;
        try {
          const { title: generated } = await generateTitle(content);
          newTitle = generated;
          setTitle(generated);
        } catch {
          // 生成失败保留原标题
        }
      }

      await updateSession(sessionId!, { title: newTitle, messages: final });
      if (newTitle !== '新对话') onSessionUpdate();
    } catch {
      setMessages([...newMessages, { role: 'assistant' as const, content: '请求失败' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-panel">
      {sessionId ? (
        <>
          <MessageList messages={messages} loading={loading} />
          <ChatInput onSend={handleSend} disabled={loading} />
        </>
      ) : (
        <div className="chat-placeholder">
          <p>选择或创建一个对话开始</p>
        </div>
      )}
    </div>
  );
}