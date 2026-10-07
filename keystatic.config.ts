import { config, collection, fields } from '@keystatic/core';

// Pasted screenshots all arrive as "image.png", so every image gets a unique,
// time-sortable id: 20261007-143012-k3f9.png. A meaningful original name is
// kept as a prefix: build-vs-buy-chart-20261007-143012-k3f9.png.
function imageId(originalFilename: string) {
  const dot = originalFilename.lastIndexOf('.');
  const ext = dot > 0 ? originalFilename.slice(dot + 1).toLowerCase() : 'png';
  const stem = (dot > 0 ? originalFilename.slice(0, dot) : originalFilename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const generic = /^(image|img|clipboard|screenshot|screen-shot|untitled|pasted)?(-?\d+)?$/.test(stem);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 6);

  return `${generic ? '' : `${stem}-`}${stamp}-${suffix}.${ext}`;
}

export default config({
  storage: { kind: 'local' },
  ui: { brand: { name: 'Movie Manufacturing' } },
  collections: {
    essays: collection({
      label: 'Essays',
      slugField: 'title',
      path: 'articles/*',
      format: { contentField: 'content' },
      entryLayout: 'content',
      columns: ['title', 'pubDate'],
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
        description: fields.text({
          label: 'Summary',
          description: 'One or two sentences. Shown in the essay list and link previews.',
          multiline: true,
        }),
        pubDate: fields.date({ label: 'Publish date', defaultValue: { kind: 'today' } }),
        draft: fields.checkbox({
          label: 'Draft',
          description: 'Drafts show up locally but are never published.',
          defaultValue: true,
        }),
        content: fields.markdoc({
          label: 'Content',
          extension: 'md',
          // Images added in the editor land in public/images/essays/<essay-slug>/
          // and are served as-is at /images/essays/<essay-slug>/<file>.
          options: {
            image: {
              directory: 'public/images/essays',
              publicPath: '/images/essays/',
              transformFilename: imageId,
              // The markdown image title doubles as a display size; see
              // src/lib/image-sizes.mjs for how the site applies it.
              schema: {
                title: fields.select({
                  label: 'Size',
                  options: [
                    { label: 'Full width', value: '' },
                    { label: 'Large (75%)', value: 'large' },
                    { label: 'Medium (50%)', value: 'medium' },
                    { label: 'Small (33%)', value: 'small' },
                  ],
                  defaultValue: '',
                }),
              },
            },
          },
        }),
      },
    }),
  },
});
