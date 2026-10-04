import { z } from 'zod';

export const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export type AuthInput = z.infer<typeof authSchema>;