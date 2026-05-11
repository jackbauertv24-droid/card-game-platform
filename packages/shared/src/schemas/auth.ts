import { z } from 'zod';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string().min(6).max(100),
  inviteCode: z.string().min(1),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(50),
  gameType: z.enum(['blackjack', 'poker', 'custom']),
  maxPlayers: z.number().int().min(1).max(8),
  minBet: z.number().int().min(10).max(10000),
});

export const gameActionSchema = z.object({
  type: z.enum(['bet', 'hit', 'stand', 'double', 'fold', 'surrender']),
  amount: z.number().int().positive().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type GameActionInput = z.infer<typeof gameActionSchema>;
