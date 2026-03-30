import { useState } from 'react';
import { Camera, Edit2, Check, LogOut } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User } from '../types';
import { motion } from 'motion/react';

interface SettingsProps {
  user: User;
}

export const Settings = ({ user }: SettingsProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<User>(user);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: formData.name,
        nickname: formData.nickname.startsWith('@') ? formData.nickname : `@${formData.nickname}`,
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
    auth.signOut();
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
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center cursor-pointer transition-opacity">
              <Camera className="w-8 h-8 text-white opacity-80" />
            </div>
          )}
        </div>
        {!isEditing && (
          <div className="mt-4 text-center">
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">{user.name}</h2>
            <p className="text-stone-500 dark:text-stone-400 font-medium">{user.nickname}</p>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Аватар (URL)
            </label>
            <input
              type="text"
              value={formData.avatar}
              onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
              className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-stone-500 focus:outline-none"
            />
          </div>
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
        <div className="space-y-4">
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800">
            <h3 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">О себе</h3>
            <p className="text-stone-900 dark:text-stone-100 leading-relaxed">
              {user.bio || 'Нет описания'}
            </p>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center py-3.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Выйти из аккаунта
          </button>
        </div>
      )}
    </motion.div>
  );
};
