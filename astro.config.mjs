import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import keystatic from '@keystatic/astro';
import { satteri } from '@astrojs/markdown-satteri';
import { imageSizes } from './src/lib/image-sizes.mjs';
import { markdocTables } from './src/lib/markdoc-tables.mjs';

// The Keystatic editor (/keystatic) only runs in local dev, so the
// published site stays fully static.
const isDev = process.argv.includes('dev');

export default defineConfig({
  site: 'https://moviemanufacturing.com',
  integrations: [react(), sitemap(), ...(isDev ? [keystatic()] : [])],
  markdown: { processor: satteri({ hastPlugins: [markdocTables, imageSizes] }) },
});
