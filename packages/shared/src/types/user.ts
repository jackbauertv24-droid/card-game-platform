export interface User {
  id: string;
  username: string;
  balance: number;
  createdAt: string;
  lastSeen: string;
}

export interface InviteCode {
  code: string;
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  createdAt: string;
}
