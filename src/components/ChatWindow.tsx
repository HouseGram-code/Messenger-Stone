import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Chat, User, Message } from '../types';
import { formatLastSeen, formatTime } from '../utils';
import { TypingIndicator } from './TypingIndicator';
import { motion } from 'motion/react';

interface ChatWindowProps {
  chat: Chat;
  currentUser: User;
  onBack: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, currentUser, onBack }) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [otherUser, setOtherUser] = useState<User | null>(chat.otherUser || null);

  useEffect(() => {
    if (!chat.otherUser) return;
    const otherUserRef = doc(db, 'users', chat.otherUser.uid);
    const unsubscribe = onSnapshot(otherUserRef, (docSnap) => {
      if (docSnap.exists()) {
        setOtherUser(docSnap.data() as User);
      }
    });
    return () => unsubscribe();
  }, [chat.otherUser?.uid]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, chat.typing]);

  useEffect(() => {
    const messagesRef = collection(db, 'chats', chat.id, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [chat.id]);

  const updateTypingStatus = async (isTyping: boolean) => {
    try {
      await updateDoc(doc(db, 'chats', chat.id), {
        [`typing.${currentUser.uid}`]: isTyping
      });
    } catch (error) {
      console.error("Error updating typing status:", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    // Handle typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    } else {
      updateTypingStatus(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
      typingTimeoutRef.current = null;
    }, 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    updateTypingStatus(false);

    try {
      // Add message
      await addDoc(collection(db, 'chats', chat.id, 'messages'), {
        senderId: currentUser.uid,
        text: textToSend,
        timestamp: serverTimestamp(),
      });

      // Update chat last message
      await updateDoc(doc(db, 'chats', chat.id), {
        lastMessage: textToSend,
        lastMessageTime: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Cleanup typing status on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateTypingStatus(false);
    };
  }, []);

  if (!otherUser) return null;

  const isOtherUserTyping = chat.typing?.[otherUser.uid];

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-0 z-50 flex flex-col bg-stone-50 dark:bg-stone-950"
    >
      {/* Header */}
      <div className="flex items-center p-4 bg-white dark:bg-stone-900 shadow-sm border-b border-stone-200 dark:border-stone-800">
        <button onClick={onBack} className="p-2 mr-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
          <ArrowLeft className="w-6 h-6 text-stone-700 dark:text-stone-300" />
        </button>
        <img src={otherUser.avatar} alt={otherUser.name} className="w-10 h-10 rounded-full object-cover mr-3" />
        <div className="flex-1">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">{otherUser.name}</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {isOtherUserTyping ? (
              <span className="text-emerald-500 font-medium">печатает...</span>
            ) : otherUser.isOnline ? (
              <span className="text-emerald-500 font-medium">В сети</span>
            ) : (
              formatLastSeen(otherUser.lastSeen)
            )}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] p-3 rounded-2xl ${
                  isMe
                    ? 'bg-stone-800 text-white rounded-tr-none dark:bg-stone-200 dark:text-stone-900'
                    : 'bg-white text-stone-900 rounded-tl-none shadow-sm dark:bg-stone-900 dark:text-stone-100 border border-stone-100 dark:border-stone-800'
                }`}
              >
                <p className="text-sm">{msg.text}</p>
                <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-stone-300 dark:text-stone-600' : 'text-stone-400'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
        {isOtherUserTyping && (
          <div className="flex justify-start">
            <TypingIndicator />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 pb-safe">
        <form onSubmit={handleSend} className="flex items-center space-x-2">
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder="Сообщение..."
            className="flex-1 bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-stone-500 border border-transparent dark:border-stone-800"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 rounded-full disabled:opacity-50 transition-opacity"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
    </motion.div>
  );
};
