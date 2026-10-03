import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const essays = defineCollection({
  loader: glob({ base: './articles', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { essays };
