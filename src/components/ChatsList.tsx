import { useState, useEffect } from 'react';
import { Search, MessageSquarePlus } from 'lucide-react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Chat, User } from '../types';
import { formatTime } from '../utils';
import { motion } from 'motion/react';

interface ChatsListProps {
  chats: Chat[];
  onSelectChat: (chatId: string) => void;
  currentUser: User;
  connectionStatus?: string | null;
}

export const ChatsList = ({ chats, onSelectChat, currentUser, connectionStatus }: ChatsListProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        // Simple search by nickname (Firestore doesn't support full-text search natively well, 
        // but we can do a basic prefix search or exact match for demo)
        const q = query(
          collection(db, 'users'),
          where('nickname', '>=', searchQuery.startsWith('@') ? searchQuery : `@${searchQuery}`),
          where('nickname', '<=', (searchQuery.startsWith('@') ? searchQuery : `@${searchQuery}`) + '\uf8ff')
        );
        
        const snapshot = await getDocs(q);
        const users: User[] = [];
        snapshot.forEach((doc) => {
          const user = doc.data() as User;
          if (user.uid !== currentUser.uid) {
            users.push(user);
          }
        });
        setSearchResults(users);
      } catch (error) {
        console.error("Error searching users:", error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchUsers, 500);
    return () => clearTimeout(debounce);
  }, [searchQuery, currentUser.uid]);

  const handleStartChat = async (otherUser: User) => {
    // Check if chat already exists
    const existingChat = chats.find(c => c.participants.includes(otherUser.uid));
    if (existingChat) {
      onSelectChat(existingChat.id);
      setSearchQuery('');
      return;
    }

    // Create new chat
    try {
      const chatRef = await addDoc(collection(db, 'chats'), {
        participants: [currentUser.uid, otherUser.uid],
        lastMessage: 'Чат создан',
        lastMessageTime: serverTimestamp(),
      });
      onSelectChat(chatRef.id);
      setSearchQuery('');
    } catch (error) {
      console.error("Error creating chat:", error);
    }
  };

  const filteredChats = chats.filter(
    (chat) =>
      !chat.deletedFor?.includes(currentUser.uid) &&
      (chat.otherUser?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.otherUser?.nickname.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full"
    >
      <div className="p-4 pt-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Чаты</h1>
          {connectionStatus && (
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-full animate-pulse">
              {connectionStatus}
            </span>
          )}
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-stone-400" />
          </div>
          <input
            type="text"
            placeholder="Поиск по имени или @нику..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-stone-200 dark:border-stone-800 rounded-xl leading-5 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 sm:text-sm transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {searchQuery.trim() && searchResults.length > 0 && (
          <div className="mb-4">
            <h2 className="px-4 text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Глобальный поиск</h2>
            {searchResults.map((user) => (
              <div
                key={user.uid}
                onClick={() => handleStartChat(user)}
                className="flex items-center px-4 py-3 hover:bg-stone-100 dark:hover:bg-stone-900 cursor-pointer transition-colors"
              >
                <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
                <div className="ml-4 flex-1">
                  <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">{user.name}</h3>
                  <p className="text-sm text-stone-500 dark:text-stone-400">{user.nickname}</p>
                </div>
                <MessageSquarePlus className="w-5 h-5 text-stone-400" />
              </div>
            ))}
          </div>
        )}

        {(!searchQuery.trim() || filteredChats.length > 0) && (
          <div>
            {searchQuery.trim() && <h2 className="px-4 text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Ваши чаты</h2>}
            {filteredChats.length > 0 ? (
              filteredChats.map((chat) => {
                if (!chat.otherUser) return null;
                
                const isBlockedByOther = chat.otherUser.blockedUsers?.includes(currentUser.uid);
                const displayAvatar = isBlockedByOther ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=blocked&backgroundColor=e5e7eb' : chat.otherUser.avatar;
                const displayName = chat.otherUser.name;
                const displayOnline = isBlockedByOther ? false : chat.otherUser.isOnline;

                return (
                  <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className="flex items-center px-4 py-3 hover:bg-stone-100 dark:hover:bg-stone-900 cursor-pointer transition-colors"
                  >
                    <div className="relative">
                      <img src={displayAvatar} alt={displayName} className="w-14 h-14 rounded-full object-cover" />
                      {displayOnline && (
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-stone-950 rounded-full"></div>
                      )}
                    </div>
                    <div className="ml-4 flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100 truncate">{displayName}</h3>
                        <span className="text-xs text-stone-500 dark:text-stone-400 ml-2 whitespace-nowrap">
                          {formatTime(chat.lastMessageTime)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-0.5">
                        <p className="text-sm text-stone-500 dark:text-stone-400 truncate pr-2">
                          {chat.lastMessage || 'Нет сообщений'}
                        </p>
                        {(chat.unreadCount?.[currentUser.uid] || 0) > 0 && (
                          <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                            {chat.unreadCount![currentUser.uid]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              !searchQuery.trim() && (
                <div className="p-8 text-center text-stone-500 dark:text-stone-400">
                  У вас пока нет чатов. Воспользуйтесь поиском, чтобы найти друзей!
                </div>
              )
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
