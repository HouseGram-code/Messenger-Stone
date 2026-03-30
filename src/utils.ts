import { Timestamp } from 'firebase/firestore';
import { isToday, isYesterday, format } from 'date-fns';
import { ru } from 'date-fns/locale';

export function formatLastSeen(timestamp?: Timestamp): string {
  if (!timestamp) return 'был(а) недавно';
  const date = timestamp.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'был(а) только что';
  if (diffMins < 60) {
    // Basic pluralization for minutes
    let minStr = 'минут';
    if (diffMins % 10 === 1 && diffMins % 100 !== 11) minStr = 'минуту';
    else if ([2, 3, 4].includes(diffMins % 10) && ![12, 13, 14].includes(diffMins % 100)) minStr = 'минуты';
    return `был(а) ${diffMins} ${minStr} назад`;
  }
  if (diffHours < 24 && isToday(date)) {
    return `был(а) сегодня в ${format(date, 'HH:mm')}`;
  }
  if (isYesterday(date)) {
    return `был(а) вчера в ${format(date, 'HH:mm')}`;
  }
  
  return `был(а) ${format(date, 'd MMM в HH:mm', { locale: ru })}`;
}

export function formatTime(timestamp?: Timestamp): string {
  if (!timestamp) return '';
  return timestamp.toDate().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
