import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db, { getUserByUsername, createUser, getInviteCode, useInviteCode } from '../db';
import { config } from '../config';
import type { User, RegisterInput, LoginInput } from 'shared';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: User): string {
  return jwt.sign({ userId: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token: string): { userId: string; username: string } | null {
  try {
    return jwt.verify(token, config.jwtSecret) as { userId: string; username: string };
  } catch {
    return null;
  }
}

export async function register(
  input: RegisterInput
): Promise<{ user: User; token: string } | { error: string }> {
  const existingUser = getUserByUsername(input.username);
  if (existingUser) {
    return { error: 'Username already taken' };
  }

  const inviteCode = getInviteCode(input.inviteCode);
  if (!inviteCode) {
    return { error: 'Invalid invite code' };
  }
  if (inviteCode.usedBy) {
    return { error: 'Invite code already used' };
  }

  const id = uuidv4();
  const passwordHash = await hashPassword(input.password);
  const user = createUser(id, input.username, passwordHash);

  useInviteCode(input.inviteCode, user.id);

  const token = generateToken(user);
  return { user, token };
}

export async function login(
  input: LoginInput
): Promise<{ user: User; token: string } | { error: string }> {
  const user = getUserByUsername(input.username);
  if (!user) {
    return { error: 'Invalid username or password' };
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as {
    password_hash: string;
  };
  const valid = await verifyPassword(input.password, row.password_hash);
  if (!valid) {
    return { error: 'Invalid username or password' };
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now, user.id);

  const token = generateToken(user);
  return { user, token };
}

export function createInviteCodes(count: number, createdBy: string): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = uuidv4().slice(0, 8).toUpperCase();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO invite_codes (code, created_by, created_at) VALUES (?, ?, ?)').run(
      code,
      createdBy,
      now
    );
    codes.push(code);
  }
  return codes;
}
