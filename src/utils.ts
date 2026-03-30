import { Timestamp } from 'firebase/firestore';

export function formatLastSeen(timestamp?: Timestamp): string {
  if (!timestamp) return 'Была в сети дальше';
  const date = timestamp.toDate();
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Была в сети только что';
  if (diffMins < 60) return `Была в сети ${diffMins} мин. назад`;
  if (diffHours < 24) return `Была в сети ${diffHours} ч. назад`;
  if (diffDays === 1) return 'Была в сети вчера';
  return 'Была в сети дальше';
}

export function formatTime(timestamp?: Timestamp): string {
  if (!timestamp) return '';
  return timestamp.toDate().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
