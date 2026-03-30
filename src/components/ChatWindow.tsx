import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, Info, MoreVertical, Edit2, Trash2, X, Volume2, BarChart2, Plus, Minus, Paperclip, Image as ImageIcon, Music, File as FileIcon, Smile } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, arrayUnion, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Chat, User, Message } from '../types';
import { formatLastSeen, formatTime } from '../utils';
import { TypingIndicator } from './TypingIndicator';
import { motion, AnimatePresence } from 'motion/react';
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';

const STICKERS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=1&backgroundColor=transparent',
  'https://api.dicebear.com/7.x/bottts/svg?seed=2&backgroundColor=transparent',
  'https://api.dicebear.com/7.x/bottts/svg?seed=3&backgroundColor=transparent',
  'https://api.dicebear.com/7.x/bottts/svg?seed=4&backgroundColor=transparent',
  'https://api.dicebear.com/7.x/bottts/svg?seed=5&backgroundColor=transparent',
  'https://api.dicebear.com/7.x/bottts/svg?seed=6&backgroundColor=transparent',
  'https://api.dicebear.com/7.x/bottts/svg?seed=7&backgroundColor=transparent',
  'https://api.dicebear.com/7.x/bottts/svg?seed=8&backgroundColor=transparent',
];

const GIFS = [
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2I1ZTI5ZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZSZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/3o7TksjIsBZaA9ZZpt/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2I1ZTI5ZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZSZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/l0HlBO7eyXzSZkJri/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2I1ZTI5ZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZSZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/26AHONQ79FdWZhAI0/giphy.gif',
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2I1ZTI5ZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZTEzZSZlcD12MV9pbnRlcm5hbF9naWZzX2dpZklkJmN0PWc/xT0xezQGU5xCDJuCPe/giphy.gif',
];

interface ChatWindowProps {
  chat: Chat;
  currentUser: User;
  onBack: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, currentUser, onBack }) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  
  // Message actions state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ message: Message, forEveryone: boolean } | null>(null);
  
  // Chat actions state
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [deleteChatConfirm, setDeleteChatConfirm] = useState(false);
  const [clearChatConfirm, setClearChatConfirm] = useState(false);
  const [undoAction, setUndoAction] = useState<{ type: 'delete' | 'clear', timeoutId: NodeJS.Timeout } | null>(null);
  const [showUndoToast, setShowUndoToast] = useState<{ type: 'delete' | 'clear' } | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  
  // Media picker state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'stickers' | 'gifs'>('emoji');
  
  // Attachment state
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
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
      
      // Reset unread count when viewing the chat
      updateDoc(doc(db, 'chats', chat.id), {
        [`unreadCount.${currentUser.uid}`]: 0
      }).catch(console.error);
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
      if (editingMessage) {
        // Edit existing message
        await updateDoc(doc(db, 'chats', chat.id, 'messages', editingMessage.id), {
          text: textToSend,
          isEdited: true
        });
        setEditingMessage(null);
      } else {
        // Add new message
        await addDoc(collection(db, 'chats', chat.id, 'messages'), {
          senderId: currentUser.uid,
          text: textToSend,
          timestamp: serverTimestamp(),
        });

        const otherUserId = chat.participants.find(id => id !== currentUser.uid);
        const currentUnread = chat.unreadCount?.[otherUserId || ''] || 0;

        // Update chat last message
        await updateDoc(doc(db, 'chats', chat.id), {
          lastMessage: textToSend,
          lastMessageTime: serverTimestamp(),
          [`unreadCount.${otherUserId}`]: currentUnread + 1
        });
      }
    } catch (error) {
      console.error("Error sending/editing message:", error);
    }
  };

  const handleDeleteMessage = (message: Message, forEveryone: boolean) => {
    setDeleteConfirm({ message, forEveryone });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { message, forEveryone } = deleteConfirm;
    try {
      if (forEveryone) {
        await updateDoc(doc(db, 'chats', chat.id, 'messages', message.id), {
          isDeleted: true
        });
      } else {
        await updateDoc(doc(db, 'chats', chat.id, 'messages', message.id), {
          deletedFor: arrayUnion(currentUser.uid)
        });
      }
      setDeleteConfirm(null);
      setSelectedMessage(null);
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const startEditing = (message: Message) => {
    setEditingMessage(message);
    setInputText(message.text);
    setSelectedMessage(null);
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setInputText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setShowAttachmentMenu(false);
    setUploadProgress(0);

    try {
      let fileType: 'image' | 'video' | 'audio' | 'file' = 'file';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';
      else if (file.type.startsWith('audio/')) fileType = 'audio';

      let downloadURL = '';

      // Simulate progress since fetch doesn't support upload progress natively
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev === null || prev >= 90) return prev;
          return prev + 10;
        });
      }, 500);

      if (fileType === 'image') {
        const imageCompression = (await import('browser-image-compression')).default;
        const options = {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(file, options);
        
        // Convert to base64
        const reader = new FileReader();
        downloadURL = await new Promise((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(compressedFile);
        });
      } else {
        // For videos and files, use uguu.se (temporary keyless hosting)
        const formData = new FormData();
        formData.append('files[]', file);
        const response = await fetch('https://uguu.se/upload.php', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const data = await response.json();
        downloadURL = data.files[0].url;
      }

      clearInterval(progressInterval);
      setUploadProgress(100);
      
      await addDoc(collection(db, 'chats', chat.id, 'messages'), {
        senderId: currentUser.uid,
        text: fileType === 'image' ? '📷 Фото' : fileType === 'video' ? '🎥 Видео' : fileType === 'audio' ? '🎵 Аудио' : '📎 Файл',
        timestamp: serverTimestamp(),
        type: fileType,
        fileUrl: downloadURL,
        fileName: file.name,
        fileSize: file.size,
      });

      const otherUserId = chat.participants.find(id => id !== currentUser.uid);
      const currentUnread = chat.unreadCount?.[otherUserId || ''] || 0;

      await updateDoc(doc(db, 'chats', chat.id), {
        lastMessage: fileType === 'image' ? '📷 Фото' : fileType === 'video' ? '🎥 Видео' : fileType === 'audio' ? '🎵 Аудио' : '📎 Файл',
        lastMessageTime: serverTimestamp(),
        [`unreadCount.${otherUserId}`]: currentUnread + 1
      });

      setTimeout(() => setUploadProgress(null), 500);

    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadProgress(null);
      alert('Ошибка при загрузке файла. Попробуйте еще раз.');
    }
  };

  const onEmojiClick = (emojiObject: any) => {
    setInputText(prev => prev + emojiObject.emoji);
  };

  const handleSendMedia = async (url: string, type: 'sticker' | 'gif') => {
    if (isBlocked) return;
    setShowEmojiPicker(false);
    
    try {
      await addDoc(collection(db, 'chats', chat.id, 'messages'), {
        senderId: currentUser.uid,
        text: type === 'sticker' ? 'Стикер' : 'GIF',
        timestamp: serverTimestamp(),
        type: type,
        fileUrl: url,
      });

      const otherUserId = chat.participants.find(id => id !== currentUser.uid);
      const currentUnread = chat.unreadCount?.[otherUserId || ''] || 0;

      await updateDoc(doc(db, 'chats', chat.id), {
        lastMessage: type === 'sticker' ? 'Стикер' : 'GIF',
        lastMessageTime: serverTimestamp(),
        [`unreadCount.${otherUserId}`]: currentUnread + 1
      });
    } catch (error) {
      console.error(`Error sending ${type}:`, error);
    }
  };

  const handleCreatePoll = async () => {
    if (!pollQuestion.trim() || pollOptions.some(opt => !opt.trim())) return;
    
    const options = pollOptions.map((opt, i) => ({
      id: `opt_${i}`,
      text: opt.trim(),
      votes: []
    }));

    try {
      await addDoc(collection(db, 'chats', chat.id, 'messages'), {
        senderId: currentUser.uid,
        text: '📊 Опрос: ' + pollQuestion,
        timestamp: serverTimestamp(),
        type: 'poll',
        poll: {
          question: pollQuestion.trim(),
          options
        }
      });
      
      const otherUserId = chat.participants.find(id => id !== currentUser.uid);
      const currentUnread = chat.unreadCount?.[otherUserId || ''] || 0;

      await updateDoc(doc(db, 'chats', chat.id), {
        lastMessage: '📊 Опрос: ' + pollQuestion,
        lastMessageTime: serverTimestamp(),
        [`unreadCount.${otherUserId}`]: currentUnread + 1
      });

      setShowPollModal(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    } catch (error) {
      console.error("Error creating poll:", error);
    }
  };

  const handleVote = async (messageId: string, optionId: string) => {
    const msgRef = doc(db, 'chats', chat.id, 'messages', messageId);
    const msg = messages.find(m => m.id === messageId);
    if (!msg || !msg.poll) return;

    const newOptions = msg.poll.options.map(opt => {
      if (opt.id === optionId) {
        if (!opt.votes.includes(currentUser.uid)) {
          return { ...opt, votes: [...opt.votes, currentUser.uid] };
        } else {
          return { ...opt, votes: opt.votes.filter(id => id !== currentUser.uid) };
        }
      } else {
        return { ...opt, votes: opt.votes.filter(id => id !== currentUser.uid) };
      }
    });

    try {
      await updateDoc(msgRef, {
        'poll.options': newOptions
      });
    } catch (error) {
      console.error("Error voting:", error);
    }
  };

  const isBlockedByMe = currentUser.blockedUsers?.includes(otherUser?.uid || '');
  const isBlockedByOther = otherUser?.blockedUsers?.includes(currentUser.uid);
  const isBlocked = isBlockedByMe || isBlockedByOther;

  const displayAvatar = isBlockedByOther ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=blocked&backgroundColor=e5e7eb' : otherUser?.avatar;
  const displayName = otherUser?.name;
  const displayOnline = isBlockedByOther ? false : otherUser?.isOnline;
  const displayLastSeen = isBlockedByOther ? 'был(а) давно' : formatLastSeen(otherUser?.lastSeen || null);

  const handleBlockUser = async () => {
    if (!otherUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      if (isBlockedByMe) {
        await updateDoc(userRef, {
          blockedUsers: (currentUser.blockedUsers || []).filter(id => id !== otherUser.uid)
        });
      } else {
        await updateDoc(userRef, {
          blockedUsers: arrayUnion(otherUser.uid)
        });
      }
      setBlockConfirm(false);
      setShowChatMenu(false);
    } catch (error) {
      console.error("Error blocking user:", error);
    }
  };

  const handleClearChat = async () => {
    setClearChatConfirm(false);
    setShowChatMenu(false);
    
    // Start undo timer
    const timeoutId = setTimeout(async () => {
      try {
        // Actually clear chat (delete all messages for this user)
        const messagesRef = collection(db, 'chats', chat.id, 'messages');
        const snapshot = await getDocs(query(messagesRef));
        const batch = [];
        for (const docSnap of snapshot.docs) {
          batch.push(updateDoc(doc(db, 'chats', chat.id, 'messages', docSnap.id), {
            deletedFor: arrayUnion(currentUser.uid)
          }));
        }
        await Promise.all(batch);
        
        await updateDoc(doc(db, 'chats', chat.id), {
          lastMessage: 'Чат очищен',
          lastMessageTime: serverTimestamp()
        });
        setShowUndoToast(null);
      } catch (error) {
        console.error("Error clearing chat:", error);
      }
    }, 5000);

    setUndoAction({ type: 'clear', timeoutId });
    setShowUndoToast({ type: 'clear' });
  };

  const handleDeleteChat = async () => {
    setDeleteChatConfirm(false);
    setShowChatMenu(false);
    
    // Start undo timer
    const timeoutId = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'chats', chat.id), {
          deletedFor: arrayUnion(currentUser.uid)
        });
        setShowUndoToast(null);
        onBack();
      } catch (error) {
        console.error("Error deleting chat:", error);
      }
    }, 5000);

    setUndoAction({ type: 'delete', timeoutId });
    setShowUndoToast({ type: 'delete' });
    // Optimistically go back, but we might want to stay to show the undo toast. 
    // Let's stay and show the toast, then go back if not undone.
  };

  const handleUndo = () => {
    if (undoAction) {
      clearTimeout(undoAction.timeoutId);
      setUndoAction(null);
      setShowUndoToast(null);
    }
  };

  useEffect(() => {
    if (showUndoToast?.type === 'delete' && !undoAction) {
       onBack();
    }
  }, [showUndoToast, undoAction, onBack]);

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
      className="absolute inset-0 w-full h-full z-50 flex flex-col bg-stone-50 dark:bg-stone-950 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center p-4 bg-white dark:bg-stone-900 shadow-sm border-b border-stone-200 dark:border-stone-800 z-10 relative">
        <button onClick={onBack} className="p-2 mr-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
          <ArrowLeft className="w-6 h-6 text-stone-700 dark:text-stone-300" />
        </button>
        <div 
          className="flex-1 flex items-center cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 p-1.5 -ml-1.5 rounded-xl transition-colors"
          onClick={() => setShowProfile(true)}
        >
          <img src={displayAvatar} alt={displayName} className="w-10 h-10 rounded-full object-cover mr-3" />
          <div className="flex-1">
            <h2 className="font-semibold text-stone-900 dark:text-stone-100">{displayName}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {isOtherUserTyping && !isBlocked ? (
                <span className="text-emerald-500 font-medium">печатает...</span>
              ) : displayOnline ? (
                <span className="text-emerald-500 font-medium">в сети</span>
              ) : (
                displayLastSeen
              )}
            </p>
          </div>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowChatMenu(!showChatMenu)}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <MoreVertical className="w-6 h-6 text-stone-700 dark:text-stone-300" />
          </button>
          
          <AnimatePresence>
            {showChatMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-100 dark:border-stone-800 overflow-hidden z-50"
              >
                <button
                  onClick={() => { setShowChatMenu(false); setBlockConfirm(true); }}
                  className="w-full text-left px-4 py-3 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  {isBlockedByMe ? 'Разблокировать' : 'Заблокировать'}
                </button>
                <button
                  onClick={() => { setShowChatMenu(false); setClearChatConfirm(true); }}
                  className="w-full text-left px-4 py-3 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  Очистить чат
                </button>
                <button
                  onClick={() => { setShowChatMenu(false); setDeleteChatConfirm(true); }}
                  className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-stone-100 dark:border-stone-800"
                >
                  Удалить чат
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          if (msg.isDeleted || msg.deletedFor?.includes(currentUser.uid)) {
            return null;
          }
          
          const isMe = msg.senderId === currentUser.uid;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                onClick={() => setSelectedMessage(msg)}
                className={`max-w-[85%] p-3 rounded-2xl cursor-pointer transition-opacity hover:opacity-90 ${
                  isMe
                    ? 'bg-emerald-500 text-white rounded-tr-none shadow-sm'
                    : 'bg-white text-stone-900 rounded-tl-none shadow-sm dark:bg-stone-900 dark:text-stone-100 border border-stone-100 dark:border-stone-800'
                }`}
              >
                {msg.type === 'poll' && msg.poll ? (
                  <div className="space-y-3 w-full min-w-[200px]">
                    <p className="font-bold text-lg mb-2">{msg.poll.question}</p>
                    <div className="space-y-2">
                      {msg.poll.options.map((opt) => {
                        const totalVotes = msg.poll!.options.reduce((acc, o) => acc + o.votes.length, 0);
                        const percentage = totalVotes === 0 ? 0 : Math.round((opt.votes.length / totalVotes) * 100);
                        const hasVoted = opt.votes.includes(currentUser.uid);
                        
                        return (
                          <div 
                            key={opt.id} 
                            onClick={(e) => { e.stopPropagation(); handleVote(msg.id, opt.id); }}
                            className={`relative overflow-hidden rounded-xl p-3 cursor-pointer border transition-colors ${
                              isMe 
                                ? 'border-emerald-400/50 hover:bg-emerald-600' 
                                : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                            }`}
                          >
                            <div 
                              className={`absolute left-0 top-0 bottom-0 opacity-20 transition-all duration-500 ${
                                isMe ? 'bg-white' : 'bg-emerald-500'
                              }`} 
                              style={{ width: `${percentage}%` }}
                            />
                            <div className="relative flex justify-between items-center z-10">
                              <span className={`font-medium ${hasVoted ? 'font-bold' : ''}`}>
                                {opt.text}
                              </span>
                              <span className="text-sm opacity-80">{percentage}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs opacity-70 mt-2">
                      Всего голосов: {msg.poll.options.reduce((acc, o) => acc + o.votes.length, 0)}
                    </p>
                  </div>
                ) : msg.type === 'image' && msg.fileUrl ? (
                  <div className="space-y-1">
                    <img src={msg.fileUrl} alt="attachment" className="rounded-xl max-w-full max-h-64 object-contain" />
                    {msg.text !== '📷 Фото' && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words mt-2">{msg.text}</p>}
                  </div>
                ) : msg.type === 'sticker' && msg.fileUrl ? (
                  <div className="space-y-1">
                    <img src={msg.fileUrl} alt="sticker" className="w-32 h-32 object-contain" />
                  </div>
                ) : msg.type === 'gif' && msg.fileUrl ? (
                  <div className="space-y-1">
                    <img src={msg.fileUrl} alt="gif" className="rounded-xl max-w-full max-h-64 object-contain" />
                  </div>
                ) : msg.type === 'video' && msg.fileUrl ? (
                  <div className="space-y-1">
                    <video src={msg.fileUrl} controls className="rounded-xl max-w-full max-h-64" />
                    {msg.text !== '🎥 Видео' && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words mt-2">{msg.text}</p>}
                  </div>
                ) : msg.type === 'audio' && msg.fileUrl ? (
                  <div className="space-y-1">
                    <audio src={msg.fileUrl} controls className="w-full max-w-[250px]" />
                    {msg.text !== '🎵 Аудио' && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words mt-2">{msg.text}</p>}
                  </div>
                ) : msg.type === 'file' && msg.fileUrl ? (
                  <div className="space-y-1">
                    <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center p-3 bg-black/5 dark:bg-white/5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                      <FileIcon className="w-8 h-8 mr-3 opacity-80" />
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-medium truncate">{msg.fileName || 'Файл'}</span>
                        <span className="text-xs opacity-70">{msg.fileSize ? (msg.fileSize / 1024 / 1024).toFixed(2) + ' MB' : ''}</span>
                      </div>
                    </a>
                    {msg.text !== '📎 Файл' && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words mt-2">{msg.text}</p>}
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                )}
                <p className={`text-[10px] mt-1 text-right flex items-center justify-end space-x-1 ${isMe ? 'text-emerald-100' : 'text-stone-400'}`}>
                  {msg.isEdited && <span>изменено</span>}
                  <span>{formatTime(msg.timestamp)}</span>
                </p>
              </div>
            </div>
          );
        })}
        {isOtherUserTyping && !isBlocked && (
          <div className="flex justify-start">
            <TypingIndicator />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input or Blocked Status */}
      {isBlockedByMe ? (
        <div className="p-4 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 pb-safe z-10 text-center">
          <p className="text-stone-500 dark:text-stone-400 text-sm mb-2">Вы заблокировали этого пользователя.</p>
          <button 
            onClick={handleBlockUser}
            className="text-emerald-500 font-medium text-sm hover:underline"
          >
            Разблокировать
          </button>
        </div>
      ) : isBlockedByOther ? (
        <div className="p-4 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 pb-safe z-10 text-center">
          <p className="text-stone-500 dark:text-stone-400 text-sm">Вы не можете отправить сообщение этому пользователю.</p>
        </div>
      ) : (
        <div className="p-3 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 pb-safe z-10">
          {uploadProgress !== null && (
          <div className="px-4 py-2 mb-2 bg-stone-100 dark:bg-stone-800 rounded-xl">
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
              <span>Загрузка файла...</span>
              <span>{Math.round(uploadProgress)}%</span>
            </div>
            <div className="w-full bg-stone-200 dark:bg-stone-700 rounded-full h-1.5">
              <div 
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
        {editingMessage && (
          <div className="flex items-center justify-between px-4 py-2 mb-2 bg-stone-100 dark:bg-stone-800 rounded-xl">
            <div className="flex items-center text-sm text-stone-600 dark:text-stone-300">
              <Edit2 className="w-4 h-4 mr-2 text-emerald-500" />
              <div className="flex flex-col">
                <span className="text-emerald-500 font-medium text-xs">Редактирование</span>
                <span className="truncate max-w-[200px] text-xs opacity-70">{editingMessage.text}</span>
              </div>
            </div>
            <button onClick={cancelEditing} className="p-1 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-full">
              <X className="w-4 h-4 text-stone-500" />
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-center space-x-2 w-full relative">
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowAttachmentMenu(false);
              }}
              className="p-3 text-stone-400 hover:text-emerald-500 transition-colors flex-shrink-0"
            >
              <Smile className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttachmentMenu(!showAttachmentMenu);
                setShowEmojiPicker(false);
              }}
              className="p-3 text-stone-400 hover:text-emerald-500 transition-colors flex-shrink-0"
            >
              <Paperclip className="w-6 h-6" />
            </button>
            
            <AnimatePresence>
              {showEmojiPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full left-0 mb-2 w-[320px] h-[400px] bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-100 dark:border-stone-800 overflow-hidden z-50 flex flex-col"
                >
                  <div className="flex border-b border-stone-100 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setPickerTab('emoji')}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${pickerTab === 'emoji' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}
                    >
                      Эмодзи
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab('stickers')}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${pickerTab === 'stickers' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}
                    >
                      Стикеры
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab('gifs')}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${pickerTab === 'gifs' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'}`}
                    >
                      GIF
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-2">
                    {pickerTab === 'emoji' && (
                      <EmojiPicker 
                        onEmojiClick={onEmojiClick} 
                        theme={Theme.AUTO} 
                        width="100%" 
                        height="100%"
                        searchDisabled={false}
                        skinTonesDisabled={true}
                      />
                    )}
                    
                    {pickerTab === 'stickers' && (
                      <div className="grid grid-cols-4 gap-2 p-2">
                        {STICKERS.map((sticker, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendMedia(sticker, 'sticker')}
                            className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors"
                          >
                            <img src={sticker} alt="sticker" className="w-full h-auto" />
                          </button>
                        ))}
                      </div>
                    )}
                    
                    {pickerTab === 'gifs' && (
                      <div className="grid grid-cols-2 gap-2 p-2">
                        {GIFS.map((gif, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendMedia(gif, 'gif')}
                            className="hover:opacity-80 transition-opacity rounded-xl overflow-hidden"
                          >
                            <img src={gif} alt="gif" className="w-full h-24 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showAttachmentMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-100 dark:border-stone-800 overflow-hidden z-50"
                >
                  <button
                    type="button"
                    onClick={() => { fileInputRef.current?.setAttribute('accept', 'image/*,video/*'); fileInputRef.current?.click(); }}
                    className="w-full flex items-center px-4 py-3 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    <ImageIcon className="w-4 h-4 mr-3 text-blue-500" />
                    Фото или видео
                  </button>
                  <button
                    type="button"
                    onClick={() => { fileInputRef.current?.setAttribute('accept', 'audio/*'); fileInputRef.current?.click(); }}
                    className="w-full flex items-center px-4 py-3 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    <Music className="w-4 h-4 mr-3 text-amber-500" />
                    Музыка
                  </button>
                  <button
                    type="button"
                    onClick={() => { fileInputRef.current?.setAttribute('accept', '*/*'); fileInputRef.current?.click(); }}
                    className="w-full flex items-center px-4 py-3 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    <FileIcon className="w-4 h-4 mr-3 text-purple-500" />
                    Файл
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAttachmentMenu(false); setShowPollModal(true); }}
                    className="w-full flex items-center px-4 py-3 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors border-t border-stone-100 dark:border-stone-800"
                  >
                    <BarChart2 className="w-4 h-4 mr-3 text-emerald-500" />
                    Опрос
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder="Сообщение..."
            className="flex-1 min-w-0 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 rounded-3xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 border border-transparent dark:border-stone-700 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full disabled:opacity-50 disabled:hover:bg-emerald-500 transition-all shadow-sm flex-shrink-0"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
      )}

      {/* Undo Toast */}
      <AnimatePresence>
        {showUndoToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-[90] bg-stone-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center space-x-4"
          >
            <span className="text-sm font-medium">
              {showUndoToast.type === 'delete' ? 'Чат будет удален' : 'Чат будет очищен'}
            </span>
            <button 
              onClick={handleUndo}
              className="text-emerald-400 font-bold text-sm hover:text-emerald-300 transition-colors uppercase tracking-wider"
            >
              Отмена
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message Context Menu Modal */}
      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center"
            onClick={() => setSelectedMessage(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-stone-100 dark:border-stone-800">
                <p className="text-sm text-stone-500 dark:text-stone-400 truncate">{selectedMessage.text}</p>
              </div>
              <div className="flex flex-col">
                {selectedMessage.senderId === currentUser.uid && selectedMessage.type !== 'poll' && (
                  <button
                    onClick={() => startEditing(selectedMessage)}
                    className="flex items-center px-6 py-4 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    <Edit2 className="w-5 h-5 mr-3 text-stone-400" />
                    <span className="font-medium">Изменить</span>
                  </button>
                )}
                <button
                  onClick={() => handleDeleteMessage(selectedMessage, false)}
                  className="flex items-center px-6 py-4 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  <Trash2 className="w-5 h-5 mr-3 text-stone-400" />
                  <span className="font-medium">Удалить у меня</span>
                </button>
                {selectedMessage.senderId === currentUser.uid && (
                  <button
                    onClick={() => handleDeleteMessage(selectedMessage, true)}
                    className="flex items-center px-6 py-4 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-5 h-5 mr-3 text-red-500" />
                    <span className="font-medium">Удалить у всех</span>
                  </button>
                )}
              </div>
              <div className="p-2 bg-stone-50 dark:bg-stone-950">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="w-full py-3 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 rounded-xl font-medium shadow-sm border border-stone-200 dark:border-stone-800"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2">Удалить сообщение?</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6">
                Вы уверены, что хотите удалить это сообщение {deleteConfirm.forEveryone ? 'у всех' : 'у себя'}? Это действие нельзя отменить.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                  Удалить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block Confirmation Modal */}
      <AnimatePresence>
        {blockConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setBlockConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2">
                {isBlockedByMe ? 'Разблокировать пользователя?' : 'Заблокировать пользователя?'}
              </h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6">
                {isBlockedByMe 
                  ? 'Вы снова сможете отправлять и получать сообщения от этого пользователя.' 
                  : 'Вы больше не сможете отправлять и получать сообщения от этого пользователя.'}
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setBlockConfirm(false)}
                  className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  Нет
                </button>
                <button
                  onClick={handleBlockUser}
                  className={`flex-1 py-3 text-white rounded-xl font-medium transition-colors shadow-sm ${
                    isBlockedByMe ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  Да
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Chat Confirmation Modal */}
      <AnimatePresence>
        {deleteChatConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDeleteChatConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2">Удалить чат?</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6">
                Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setDeleteChatConfirm(false)}
                  className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  Нет
                </button>
                <button
                  onClick={handleDeleteChat}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                  Да
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear Chat Confirmation Modal */}
      <AnimatePresence>
        {clearChatConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setClearChatConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2">Очистить чат?</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-6">
                Вы уверены, что хотите удалить все сообщения в этом чате? Это действие нельзя отменить.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setClearChatConfirm(false)}
                  className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  Нет
                </button>
                <button
                  onClick={handleClearChat}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                  Да
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poll Creation Modal */}
      <AnimatePresence>
        {showPollModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowPollModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-stone-900 rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-4">Создать опрос</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Вопрос</label>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Задайте вопрос..."
                    className="w-full px-4 py-2 bg-stone-100 dark:bg-stone-800 border border-transparent dark:border-stone-700 rounded-xl text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Варианты ответа</label>
                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...pollOptions];
                            newOpts[idx] = e.target.value;
                            setPollOptions(newOpts);
                          }}
                          placeholder={`Вариант ${idx + 1}`}
                          className="flex-1 px-4 py-2 bg-stone-100 dark:bg-stone-800 border border-transparent dark:border-stone-700 rounded-xl text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollOptions.length < 10 && (
                    <button
                      onClick={() => setPollOptions([...pollOptions, ''])}
                      className="mt-2 flex items-center text-sm text-emerald-600 dark:text-emerald-400 font-medium hover:opacity-80"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Добавить вариант
                    </button>
                  )}
                </div>
              </div>
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowPollModal(false)}
                  className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleCreatePoll}
                  disabled={!pollQuestion.trim() || pollOptions.some(opt => !opt.trim())}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50"
                >
                  Создать
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Overlay */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[60] flex flex-col bg-stone-50 dark:bg-stone-950"
          >
            <div className="flex items-center p-4 bg-white dark:bg-stone-900 shadow-sm border-b border-stone-200 dark:border-stone-800">
              <button onClick={() => setShowProfile(false)} className="p-2 mr-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                <ArrowLeft className="w-6 h-6 text-stone-700 dark:text-stone-300" />
              </button>
              <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-lg">Профиль</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col items-center mb-8 mt-4">
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-stone-900 shadow-md mb-4"
                />
                <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">{displayName}</h2>
                <p className="text-stone-500 dark:text-stone-400 font-medium text-lg">{otherUser.nickname}</p>
                <p className="text-sm text-stone-400 dark:text-stone-500 mt-1">
                  {displayOnline ? 'в сети' : displayLastSeen}
                </p>
              </div>

              <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800">
                <div className="flex items-center text-stone-500 dark:text-stone-400 mb-2">
                  <Info className="w-4 h-4 mr-1.5" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">О себе</h3>
                </div>
                <p className="text-stone-900 dark:text-stone-100 leading-relaxed">
                  {otherUser.bio || 'Нет описания'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
