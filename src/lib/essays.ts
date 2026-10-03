import { getCollection } from 'astro:content';

// Drafts are visible in `npm run dev` and left out of production builds.
export async function getEssays() {
  const essays = await getCollection('essays', ({ data }) => import.meta.env.DEV || !data.draft);
  return essays.sort(
    (a, b) => (b.data.pubDate?.getTime() ?? 0) - (a.data.pubDate?.getTime() ?? 0),
  );
}

export function formatDate(date?: Date) {
  return date?.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
