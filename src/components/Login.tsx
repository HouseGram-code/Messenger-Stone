import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'motion/react';

export const Login = ({ onLogin }: { onLogin: (uid: string) => void }) => {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !nickname.trim()) {
      setError('Пожалуйста, заполните все поля');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let uid = localStorage.getItem('messenger_uid');
      if (!uid) {
        uid = uuidv4();
        localStorage.setItem('messenger_uid', uid);
      }

      // Create user profile in Firestore
      await setDoc(doc(db, 'users', uid), {
        uid,
        name: name.trim(),
        nickname: nickname.startsWith('@') ? nickname.trim() : `@${nickname.trim()}`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
        bio: 'Привет! Я использую Мессенджер Камень.',
        isOnline: true,
        lastSeen: serverTimestamp(),
      });
      
      onLogin(uid);
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Ошибка сети. Проверьте подключение к интернету или VPN.');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center bg-stone-200 dark:bg-black min-h-screen">
      <div className="w-full max-w-md bg-white dark:bg-stone-950 h-[100dvh] flex flex-col justify-center px-8 shadow-2xl sm:rounded-3xl sm:h-[90vh] sm:my-auto sm:border border-stone-200 dark:border-stone-800">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="w-20 h-20 bg-stone-900 dark:bg-stone-100 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-lg transform rotate-3">
            <span className="text-4xl">🪨</span>
          </div>
          <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-2">Мессенджер Камень</h1>
          <p className="text-stone-500 dark:text-stone-400">Добро пожаловать! Представьтесь, чтобы начать общение.</p>
        </motion.div>

        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-xl text-center">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Ваше имя
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
              className="w-full px-4 py-3 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-stone-500 focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Юзернейм
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-stone-400 pointer-events-none">
                @
              </span>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.replace('@', ''))}
                placeholder="ivan_stone"
                className="w-full pl-8 pr-4 py-3 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-stone-500 focus:outline-none transition-all"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-xl font-semibold shadow-md hover:bg-stone-800 dark:hover:bg-white transition-colors disabled:opacity-70 flex justify-center items-center mt-4"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white dark:border-stone-900 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Войти'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
