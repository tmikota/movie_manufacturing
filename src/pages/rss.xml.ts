import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getEssays } from '../lib/essays';

export async function GET(context: APIContext) {
  const essays = await getEssays();
  return rss({
    title: 'Movie Manufacturing',
    description: 'Essays on building film and animation production as a system, by Tom Mikota.',
    site: context.site!,
    items: essays.map((essay) => ({
      title: essay.data.title,
      description: essay.data.description,
      pubDate: essay.data.pubDate,
      link: `/essays/${essay.id}/`,
    })),
  });
}
