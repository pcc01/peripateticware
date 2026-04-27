// src/pages/MessagesPage.tsx

import React, { useState } from 'react';
import { messagesApi, notificationsApi, isApiError, getErrorMessage } from "../services/api";

interface MessageThread {
  id: string;
  fromTeacherId: string;
  fromTeacherName: string;
  subject: string;
  body: string;
  lastMessageTime: string;
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!parent?.id) return;
      try {
        setIsLoadingMessages(true);
        const data = await messagesApi.getMessages(parent.id);
        setMessages(data || []);
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        setIsLoadingMessages(false);
      }
    };
    fetchMessages();
  }, [parent?.id]);
  unreadCount: number;
}

interface Message {
  id: string;
  fromTeacherId?: string;
  fromTeacherName?: string;
  fromParentId?: string;
  body: string;
  createdAt: string;
  isFromParent: boolean;
}

export default function MessagesPage() {
  const parent = useParentAuthStore((state) => state.parent);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const mockThreads: MessageThread[] = [
    {
      id: '1',
      fromTeacherId: 'teacher1',
      fromTeacherName: 'Ms. Johnson',
      subject: 'Great progress this week!',
      body: 'Your child showed excellent progress in the scientific observation activity...',
      lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      unreadCount: 0,
    },
    {
      id: '2',
      fromTeacherId: 'teacher2',
      fromTeacherName: 'Mr. Smith',
      subject: 'Question about the location-based activity',
      body: 'Hi, I had a question about whether your child can attend next week\'s outdoor session...',
      lastMessageTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      unreadCount: 1,
    },
  ];

  const mockMessages: Record<string, Message[]> = {
    '1': [
      {
        id: 'msg1',
        fromTeacherName: 'Ms. Johnson',
        body: 'Your child showed excellent progress in the scientific observation activity this week. The evidence they submitted demonstrates a strong understanding of the concepts.',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        isFromParent: false,
      },
      {
        id: 'msg2',
        fromParentId: parent?.id,
        body: 'Thank you for the update! We\'ve been working on observational skills at home as well.',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        isFromParent: true,
      },
    ],
    '2': [
      {
        id: 'msg3',
        fromTeacherName: 'Mr. Smith',
        body: 'Hi, I had a question about whether your child can attend next week\'s outdoor session? We\'re planning a field trip to the local nature reserve.',
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        isFromParent: false,
      },
    ],
  };

  const selectedThread = selectedThreadId ? mockThreads.find(t => t.id === selectedThreadId) : null;
  const selectedMessages = selectedThreadId ? mockMessages[selectedThreadId] || [] : [];

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThreadId) return;

    try {
      setIsSending(true);
      // TODO: Call actual API to send message
      console.log('Sending reply:', replyText);
      
      // Simulate adding message
      const newMessage: Message = {
        id: `msg_${Date.now()}`,
        fromParentId: parent?.id,
        body: replyText,
        createdAt: new Date().toISOString(),
        isFromParent: true,
      };

      mockMessages[selectedThreadId].push(newMessage);
      setReplyText('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          Messages
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Communicate with your child's teachers
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message List */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="font-bold text-neutral-900 dark:text-neutral-50 mb-4">
              Message Threads
            </h2>
            <div className="space-y-2">
              {mockThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedThreadId === thread.id
                      ? 'bg-primary/10 border-l-4 border-primary'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-700 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-semibold text-sm text-neutral-900 dark:text-neutral-50">
                      {thread.fromTeacherName}
                    </p>
                    {thread.unreadCount > 0 && (
                      <span className="bg-primary text-white text-xs px-2 py-1 rounded-full">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                    {thread.subject}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    {new Date(thread.lastMessageTime).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Message Detail */}
        <div className="lg:col-span-2">
          {selectedThread ? (
            <div className="card">
              {/* Thread Header */}
              <div className="pb-4 border-b border-neutral-200 dark:border-neutral-700 mb-4">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
                  {selectedThread.subject}
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  with {selectedThread.fromTeacherName}
                </p>
              </div>

              {/* Messages */}
              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                {selectedMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg ${
                      message.isFromParent
                        ? 'bg-primary/10 border-l-4 border-primary'
                        : 'bg-neutral-50 dark:bg-neutral-700 border-l-4 border-accent'
                    }`}
                  >
                    <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                      {message.isFromParent ? 'You' : message.fromTeacherName}
                      {' '}
                      <span className="font-normal">
                        • {new Date(message.createdAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-neutral-800 dark:text-neutral-200 text-sm">
                      {message.body}
                    </p>
                  </div>
                ))}
              </div>

              {/* Reply Box */}
              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg dark:bg-neutral-800 dark:text-neutral-200 resize-none focus:outline-none focus:ring-2 focus:ring-primary mb-3"
                  rows={4}
                  disabled={isSending}
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || isSending}
                  className="btn btn-primary w-full"
                >
                  {isSending ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card text-center py-12">
              <p className="text-neutral-600 dark:text-neutral-400">
                Select a message thread to view the conversation
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
