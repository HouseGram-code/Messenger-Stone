import { Timestamp } from 'firebase/firestore';

export interface User {
  uid: string;
  name: string;
  nickname: string;
  avatar: string;
  bio: string;
  isOnline: boolean;
  lastSeen: Timestamp;
  balance?: number;
  blockedUsers?: string[];
  lastSeenPrivacy?: 'everyone' | 'nobody';
  stickers?: { id: string; name: string; url: string }[];
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[];
}

export interface Poll {
  question: string;
  options: PollOption[];
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp;
  isEdited?: boolean;
  isDeleted?: boolean;
  deletedFor?: string[];
  type?: 'text' | 'poll' | 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'gif';
  poll?: Poll;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageTime: Timestamp;
  typing?: { [uid: string]: boolean };
  unreadCount?: { [uid: string]: number };
  deletedFor?: string[];
  // Client-side only properties for UI
  otherUser?: User;
}
