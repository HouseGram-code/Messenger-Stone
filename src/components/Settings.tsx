import React, { useState, useRef } from 'react';
import { Camera, Edit2, Check, LogOut, Info, Gift, Search, Users, Volume2 } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { User, Chat } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import imageCompression from 'browser-image-compression';

interface SettingsProps {
  user: User;
}

export const Settings = ({ user }: SettingsProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<User>(user);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Sticks feature state
  const [showSendSticks, setShowSendSticks] = useState(false);
  const [stickRecipient, setStickRecipient] = useState('');
  const [stickAmount, setStickAmount] = useState(1);
  const [isSendingSticks, setIsSendingSticks] = useState(false);
  const [stickError, setStickError] = useState('');
  const [stickSuccess, setStickSuccess] = useState('');
  const [showDevelopers, setShowDevelopers] = useState(false);

  const currentBalance = user.balance ?? 25;

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Ваш браузер не поддерживает озвучивание текста.');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const options = {
        maxSizeMB: 0.04, // Max 40KB to fit in Firestore safely
        maxWidthOrHeight: 256,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(file, options);
      
      const reader = new FileReader();
      reader.readAsDataURL(compressedFile);
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const newAvatar = reader.result;
          setFormData({ ...formData, avatar: newAvatar });
          
          // Auto-save avatar immediately
          try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { avatar: newAvatar });
          } catch (error) {
            console.error("Error saving avatar:", error);
          }
        }
      };
    } catch (error) {
      console.error('Error compressing image:', error);
      alert('Ошибка при загрузке изображения. Попробуйте другое.');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const formattedNickname = formData.nickname.startsWith('@') ? formData.nickname : `@${formData.nickname}`;
      
      // Check for uniqueness
      if (formattedNickname !== user.nickname) {
        const q = query(collection(db, 'users'), where('nickname', '==', formattedNickname));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          alert('Этот никнейм уже занят. Пожалуйста, выберите другой.');
          setIsSaving(false);
          return;
        }
      }

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: formData.name,
        nickname: formattedNickname,
        avatar: formData.avatar,
        bio: formData.bio,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error("Error updating offline status:", error);
    }
    await signOut(auth);
  };

  const handleSendSticks = async (e: React.FormEvent) => {
    e.preventDefault();
    setStickError('');
    setStickSuccess('');
    
    if (!stickRecipient.trim()) {
      setStickError('Введите никнейм или имя получателя');
      return;
    }
    
    if (stickAmount <= 0 || stickAmount > currentBalance) {
      setStickError('Недостаточно палок на балансе');
      return;
    }

    setIsSendingSticks(true);
    try {
      let recipientDoc;
      
      // Try exact nickname match first
      const cleanRecipient = stickRecipient.trim();
      const searchNickname = cleanRecipient.startsWith('@') ? cleanRecipient : `@${cleanRecipient}`;
      const qNickname = query(collection(db, 'users'), where('nickname', '==', searchNickname));
      const querySnapshotNickname = await getDocs(qNickname);
      
      if (!querySnapshotNickname.empty) {
        recipientDoc = querySnapshotNickname.docs[0];
      } else {
        // Try exact name match
        const qName = query(collection(db, 'users'), where('name', '==', cleanRecipient));
        const querySnapshotName = await getDocs(qName);
        if (!querySnapshotName.empty) {
          recipientDoc = querySnapshotName.docs[0];
        } else {
          // Try case-insensitive search by fetching all users (fallback)
          const allUsersSnapshot = await getDocs(collection(db, 'users'));
          recipientDoc = allUsersSnapshot.docs.find(d => {
            const data = d.data();
            return data.nickname?.toLowerCase() === searchNickname.toLowerCase() || 
                   data.name?.toLowerCase() === cleanRecipient.toLowerCase();
          });
        }
      }

      if (!recipientDoc) {
        setStickError('Пользователь не найден');
        setIsSendingSticks(false);
        return;
      }

      const recipient = recipientDoc.data() as User;

      if (recipient.uid === user.uid) {
        setStickError('Нельзя отправить палки самому себе');
        setIsSendingSticks(false);
        return;
      }

      // 1. Update my balance
      const newBalance = currentBalance - stickAmount;
      await updateDoc(doc(db, 'users', user.uid), {
        balance: newBalance
      });
      
      // Update local state to reflect balance immediately
      setFormData(prev => ({ ...prev, balance: newBalance }));

      // 2. Find or create chat
      let chatId = '';
      const chatQuery = query(
        collection(db, 'chats'), 
        where('participants', 'array-contains', user.uid)
      );
      const chatSnapshot = await getDocs(chatQuery);
      
      const existingChat = chatSnapshot.docs.find(d => {
        const chatData = d.data() as Chat;
        return chatData.participants.includes(recipient.uid);
      });

      if (existingChat) {
        chatId = existingChat.id;
      } else {
        const newChatRef = await addDoc(collection(db, 'chats'), {
          participants: [user.uid, recipient.uid],
          lastMessage: '',
          lastMessageTime: serverTimestamp(),
        });
        chatId = newChatRef.id;
      }

      // 3. Send message
      const messageText = `🎁 Я отправил тебе ${stickAmount} палок! Сумма будет начислена на твой баланс.`;
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: user.uid,
        text: messageText,
        timestamp: serverTimestamp(),
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: messageText,
        lastMessageTime: serverTimestamp(),
        [`unreadCount.${recipient.uid}`]: 1 // Simplified unread count increment
      });

      setStickSuccess(`Успешно отправлено ${stickAmount} палок!`);
      setStickRecipient('');
      setStickAmount(1);
      
      setTimeout(() => {
        setShowSendSticks(false);
        setStickSuccess('');
      }, 2000);

    } catch (error) {
      console.error("Error sending sticks:", error);
      setStickError('Произошла ошибка при отправке');
    } finally {
      setIsSendingSticks(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full p-4 pt-6 overflow-y-auto"
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Настройки</h1>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center text-sm font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white transition-colors"
          >
            <Edit2 className="w-4 h-4 mr-1.5" />
            Редактировать
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mr-1.5"></div>
            ) : (
              <Check className="w-4 h-4 mr-1.5" />
            )}
            Сохранить
          </button>
        )}
      </div>

      <div className="flex flex-col items-center mb-8">
        <div className="relative group">
          <img
            src={formData.avatar}
            alt={formData.name}
            className="w-28 h-28 rounded-full object-cover border-4 border-white dark:border-stone-900 shadow-md"
          />
          {isEditing && (
            <div 
              className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center cursor-pointer transition-opacity hover:bg-black/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-8 h-8 text-white opacity-90" />
            </div>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            accept="image/*" 
            className="hidden" 
          />
        </div>
        {!isEditing && (
          <div className="mt-4 text-center">
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">{user.name}</h2>
            <p className="text-stone-500 dark:text-stone-400 font-medium">{user.nickname}</p>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4 flex-1">
          <div>
            <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Имя
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-stone-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Никнейм
            </label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-stone-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              О себе
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-stone-500 focus:outline-none resize-none"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4 flex-1">
          {/* Sticks Balance Section */}
          <div className="bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 rounded-2xl p-5 shadow-sm border border-amber-200/50 dark:border-amber-700/30">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center text-amber-800 dark:text-amber-400">
                <Gift className="w-5 h-5 mr-2" />
                <h3 className="font-bold uppercase tracking-wider text-sm">Баланс палки</h3>
              </div>
              <span className="text-2xl font-black text-amber-600 dark:text-amber-500">{currentBalance}</span>
            </div>
            
            <AnimatePresence>
              {!showSendSticks ? (
                <motion.button
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={() => setShowSendSticks(true)}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors shadow-sm"
                >
                  Отправить палки
                </motion.button>
              ) : (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleSendSticks}
                  className="space-y-3 mt-2"
                >
                  <div>
                    <input
                      type="text"
                      placeholder="Никнейм (например, @ivan)"
                      value={stickRecipient}
                      onChange={(e) => setStickRecipient(e.target.value)}
                      className="w-full px-3 py-2 bg-white/80 dark:bg-stone-900/80 border border-amber-200 dark:border-amber-700/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="1"
                      max={currentBalance}
                      value={stickAmount}
                      onChange={(e) => setStickAmount(parseInt(e.target.value) || 1)}
                      className="w-24 px-3 py-2 bg-white/80 dark:bg-stone-900/80 border border-amber-200 dark:border-amber-700/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-sm text-amber-800 dark:text-amber-400 font-medium">палок</span>
                  </div>
                  
                  {stickError && <p className="text-xs text-red-500 font-medium">{stickError}</p>}
                  {stickSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{stickSuccess}</p>}
                  
                  <div className="flex space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowSendSticks(false)}
                      className="flex-1 py-2 bg-stone-200/50 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 rounded-lg text-sm font-semibold hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingSticks || currentBalance <= 0}
                      className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {isSendingSticks ? 'Отправка...' : 'Отправить'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800">
            <h3 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">О себе</h3>
            <p className="text-stone-900 dark:text-stone-100 leading-relaxed">
              {user.bio || 'Нет описания'}
            </p>
          </div>
          
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 mt-4">
            <div className="flex items-center text-stone-500 dark:text-stone-400 mb-2">
              <Info className="w-4 h-4 mr-1.5" />
              <h3 className="text-xs font-semibold uppercase tracking-wider">О приложении</h3>
            </div>
            <p className="text-stone-900 dark:text-stone-100 font-medium">Messenger Stone v1.0 (1)</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Быстрый и безопасный мессенджер.
            </p>
          </div>

          <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800">
            <button
              onClick={() => setShowDevelopers(!showDevelopers)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center text-stone-900 dark:text-stone-100 font-semibold">
                <Users className="w-5 h-5 mr-3 text-emerald-500" />
                Разработчики
              </div>
            </button>
            <AnimatePresence>
              {showDevelopers && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 space-y-3 overflow-hidden"
                >
                  <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                    <p className="font-medium text-stone-900 dark:text-stone-100">Данил</p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">Пишет код, исправляет ошибки, тестирует новые функции и следит за стабильностью работы мессенджера.</p>
                  </div>
                  <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-xl">
                    <p className="font-medium text-stone-900 dark:text-stone-100">Иван</p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">Главный проекта, придумывает идеи, следит за реализацией и развитием продукта.</p>
                  </div>
                  <button
                    onClick={() => speakText("Данил пишет код, исправляет ошибки, тестирует новые функции и следит за стабильностью работы мессенджера. Иван главный проекта, придумывает идеи, следит за реализацией и развитием продукта.")}
                    className="w-full flex items-center justify-center py-2.5 mt-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                  >
                    <Volume2 className="w-4 h-4 mr-2" />
                    Прослушать
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center py-3.5 mt-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Выйти из аккаунта
          </button>
        </div>
      )}
    </motion.div>
  );
};
