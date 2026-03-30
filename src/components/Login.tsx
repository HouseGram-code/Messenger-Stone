import React, { useState } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth } from '../firebase';
import { motion } from 'motion/react';

export const Login = ({ onLogin }: { onLogin: (uid: string) => void }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const uid = user.uid;

      // Check if user profile exists
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // Create user profile in Firestore
        const baseNickname = user.email ? user.email.split('@')[0] : `user_${uid.substring(0, 5)}`;
        
        await setDoc(userRef, {
          uid,
          name: user.displayName || 'Пользователь',
          nickname: `@${baseNickname}`,
          avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
          bio: 'Привет! Я использую Мессенджер Камень.',
          isOnline: true,
          lastSeen: serverTimestamp(),
        });
      }
      
      onLogin(uid);
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Ошибка при входе через Google. ' + (err.message || ''));
    } finally {
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
          <p className="text-stone-500 dark:text-stone-400">Добро пожаловать! Войдите, чтобы начать общение.</p>
        </motion.div>

        <div className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-xl text-center">
              {error}
            </div>
          )}
          
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-xl font-semibold shadow-md hover:bg-stone-800 dark:hover:bg-white transition-colors disabled:opacity-70 flex justify-center items-center mt-4"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white dark:border-stone-900 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Войти через Google
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
