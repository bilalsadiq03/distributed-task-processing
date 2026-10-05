import { z } from 'zod';

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const createJobSchema = z.object({
  type: z.enum([
    'CPU_TASK',
    'IO_TASK',
    'DOCUMENT_PROCESSING',
    'WEBHOOK',
  ]),

  payload: z.record(z.string(), jsonValueSchema),

  priority: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5),

  scheduledAt: z.coerce.date().optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;