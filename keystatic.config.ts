import { config, collection, fields } from '@keystatic/core';

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
        content: fields.markdoc({ label: 'Content', extension: 'md' }),
      },
    }),
  },
});
