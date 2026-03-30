import { motion } from 'motion/react';

export const TypingIndicator = () => (
  <div className="flex space-x-1.5 items-center bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 shadow-sm p-3 rounded-2xl rounded-tl-none h-10">
    <motion.div className="w-2 h-2 bg-stone-400 dark:bg-stone-500 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
    <motion.div className="w-2 h-2 bg-stone-400 dark:bg-stone-500 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
    <motion.div className="w-2 h-2 bg-stone-400 dark:bg-stone-500 rounded-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
  </div>
);
