/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { MessageCircle, Settings as SettingsIcon } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, orderBy, getDocs, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { User, Chat } from './types';
import { ChatsList } from './components/ChatsList';
import { ChatWindow } from './components/ChatWindow';
import { Settings } from './components/Settings';
import { Login } from './components/Login';

export default function App() {
  const [activeTab, setActiveTab] = useState<'chats' | 'settings'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch user profile
        const userRef = doc(db, 'users', user.uid);
        const unsubUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setCurrentUser(docSnap.data() as User);
          } else {
            // If user document doesn't exist but auth does, we might be in a weird state
            // Let's sign out to force them to register again
            auth.signOut();
            setCurrentUser(null);
          }
          setIsAuthReady(true);
        });
        
        // Set online status
        updateDoc(userRef, {
          isOnline: true,
          lastSeen: serverTimestamp()
        }).catch(() => {
          // Ignore error if document doesn't exist yet (e.g., during registration)
        });

        return () => unsubUser();
      } else {
        setCurrentUser(null);
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle presence (online/offline)
  useEffect(() => {
    if (!currentUser) return;

    const handleVisibilityChange = async () => {
      const userRef = doc(db, 'users', currentUser.uid);
      if (document.visibilityState === 'hidden') {
        await updateDoc(userRef, {
          isOnline: false,
          lastSeen: serverTimestamp()
        });
      } else {
        await updateDoc(userRef, {
          isOnline: true,
          lastSeen: serverTimestamp()
        });
      }
    };

    const handleBeforeUnload = async () => {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser?.uid]);

  // Listen to chats
  useEffect(() => {
    if (!currentUser) return;

    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid), orderBy('lastMessageTime', 'desc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatsPromises = snapshot.docs.map(async (docSnap) => {
        const chatData = docSnap.data() as Chat;
        chatData.id = docSnap.id;
        
        const otherUserId = chatData.participants.find(id => id !== currentUser.uid);
        if (otherUserId) {
          const otherUserRef = doc(db, 'users', otherUserId);
          const otherUserSnap = await getDoc(otherUserRef);
          if (otherUserSnap.exists()) {
            chatData.otherUser = otherUserSnap.data() as User;
          }
        }
        return chatData;
      });
      
      const chatsData = await Promise.all(chatsPromises);
      setChats(chatsData);
    });

    return () => unsubscribe();
  }, [currentUser]);

  if (!isAuthReady) {
    return <div className="min-h-screen bg-stone-200 dark:bg-black flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-stone-900 border-t-transparent rounded-full animate-spin"></div>
    </div>;
  }

  if (!currentUser) {
    return <Login />;
  }

  const activeChat = chats.find(c => c.id === activeChatId);

  return (
    <div className="flex justify-center bg-stone-200 dark:bg-black min-h-screen">
      <div className="w-full max-w-md bg-white dark:bg-stone-950 h-[100dvh] flex flex-col relative overflow-hidden shadow-2xl sm:rounded-3xl sm:h-[90vh] sm:my-auto sm:border border-stone-200 dark:border-stone-800">

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'chats' && (
            <ChatsList 
              chats={chats} 
              onSelectChat={setActiveChatId} 
              currentUser={currentUser} 
            />
          )}
          {activeTab === 'settings' && (
            <Settings user={currentUser} />
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-6 py-3 flex justify-around items-center pb-safe">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex flex-col items-center space-y-1 transition-colors ${
              activeTab === 'chats' ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
            }`}
          >
            <MessageCircle className={`w-6 h-6 ${activeTab === 'chats' ? 'fill-stone-100 dark:fill-stone-800' : ''}`} />
            <span className="text-[10px] font-medium">Чаты</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center space-y-1 transition-colors ${
              activeTab === 'settings' ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
            }`}
          >
            <SettingsIcon className={`w-6 h-6 ${activeTab === 'settings' ? 'fill-stone-100 dark:fill-stone-800' : ''}`} />
            <span className="text-[10px] font-medium">Настройки</span>
          </button>
        </div>

        {/* Chat Window Overlay */}
        <AnimatePresence>
          {activeChat && (
            <ChatWindow
              key="chat-window"
              chat={activeChat}
              currentUser={currentUser}
              onBack={() => setActiveChatId(null)}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
