import { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  name: string;
  nickname: string;
  avatar: string;
  bio: string;
  isOnline: boolean;
  lastSeen: Timestamp;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageTime: Timestamp;
  typing?: { [uid: string]: boolean };
  // Client-side only properties for UI
  otherUser?: User;
}
