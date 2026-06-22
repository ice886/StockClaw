import { sendMessageStream } from '../api/agent';
import { fetchSession, updateSession, generateTitle } from '../api/session';
import { fetchSkills, type SkillInfo } from '../api/skill';
import { uploadDocument, listDocuments, deleteDocument } from '../api/rag';
import type { Message } from '../types/chat';
import type { RagDocument } from '../types/rag';
import { useState, useEffect, useRef } from 'react';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { SkillSelector } from './SkillSelector';
import './ChatPanel.css';

interface Props {
  sessionId: string | null;
  onSessionUpdate: () => void;
}

export function ChatPanel({ sessionId, onSessionUpdate }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [toolName, setToolName] = useState<string | null>(null);
  const [title, setTitle] = useState('新对话');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [activeSkill, setActiveSkill] = useState('general-chat');
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const titled = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetchSession(sessionId)
      .then((r) => {
        setMessages(r.messages);
        setTitle(r.title);
        titled.current = r.title !== '新对话';
      })
      .catch(() => setMessages([]));
    listDocuments(sessionId)
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [sessionId]);

  useEffect(() => {
    fetchSkills().then(setSkills).catch(() => {});
  }, []);

  const handleUpload = async (files: FileList) => {
    if (!sessionId) return;
    const list = Array.from(files);
    setUploadingNames((prev) => [...prev, ...list.map((f) => f.name)]);

    for (const file of list) {
      try {
        const doc = await uploadDocument(file, sessionId);
        setDocs((prev) => [doc, ...prev]);
      } catch {
        // 单个文件失败不影响其他文件
      } finally {
        setUploadingNames((prev) => prev.filter((n) => n !== file.name));
      }
    }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!sessionId) return;
    try {
      await deleteDocument(sessionId, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      // 删除失败保留原列表
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
    setToolName(null);
  };

  const handleSend = async (content: string) => {
    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 插入空的 assistant 占位，流式填充
      setMessages([...newMessages, { role: 'assistant' as const, content: '' }]);

      let fullContent = '';
      for await (const event of sendMessageStream(newMessages, controller.signal, activeSkill, sessionId ?? undefined)) {
        if (event.type === 'text-delta') {
          fullContent += event.content!;
          setLoading(false);
          setToolName(null);
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant' as const, content: fullContent };
            return updated;
          });
        } else if (event.type === 'tool-call') {
          setToolName(event.toolName!);
        } else if (event.type === 'error') {
          throw new Error(event.error);
        }
      }

      const final: Message[] = [
        ...newMessages,
        { role: 'assistant' as const, content: fullContent || '请求失败' },
      ];
      setMessages(final);

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
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setMessages([
        ...newMessages,
        { role: 'assistant' as const, content: '请求失败' },
      ]);
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const handleEdit = async (index: number, newContent: string) => {
    const trimmed = messages.slice(0, index);
    const editedMsg: Message = { ...messages[index], content: newContent };
    const newMessages = [...trimmed, editedMsg];

    setMessages(newMessages);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setMessages([...newMessages, { role: 'assistant' as const, content: '' }]);

      let fullContent = '';
      for await (const event of sendMessageStream(newMessages, controller.signal, activeSkill, sessionId ?? undefined)) {
        if (event.type === 'text-delta') {
          fullContent += event.content!;
          setLoading(false);
          setToolName(null);
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant' as const, content: fullContent };
            return updated;
          });
        } else if (event.type === 'tool-call') {
          setToolName(event.toolName!);
        } else if (event.type === 'error') {
          throw new Error(event.error);
        }
      }

      const final: Message[] = [
        ...newMessages,
        { role: 'assistant' as const, content: fullContent || '请求失败' },
      ];
      setMessages(final);
      await updateSession(sessionId!, { title, messages: final });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setMessages([
        ...newMessages,
        { role: 'assistant' as const, content: '请求失败' },
      ]);
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  return (
    <div className="chat-panel">
      {sessionId ? (
        <>
          <SkillSelector
            skills={skills}
            activeSkill={activeSkill}
            onSelect={setActiveSkill}
          />
          <MessageList messages={messages} loading={loading} toolName={toolName} onEdit={handleEdit} />
          <ChatInput
            onSend={handleSend}
            onCancel={handleCancel}
            disabled={loading}
            userMessages={messages.filter(m => m.role === 'user').map(m => m.content)}
            docs={docs}
            uploadingNames={uploadingNames}
            onUpload={handleUpload}
            onRemoveDoc={handleRemoveDoc}
          />
        </>
      ) : (
        <div className="chat-placeholder">
          <p>选择或创建一个对话开始</p>
        </div>
      )}
    </div>
  );
}