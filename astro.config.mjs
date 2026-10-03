import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import keystatic from '@keystatic/astro';

// The Keystatic editor (/keystatic) only runs in local dev, so the
// published site stays fully static.
const isDev = process.argv.includes('dev');

export default defineConfig({
  site: 'https://moviemanufacturing.com',
  integrations: [react(), sitemap(), ...(isDev ? [keystatic()] : [])],
});
