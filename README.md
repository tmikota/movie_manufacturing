# Movie Manufacturing

Workspace for articles, videos, and other content on building an agentic production
pipeline.

- [outline.md](outline.md): personal system map, used to check the whole system is modeled
- [notes/series-plan.md](notes/series-plan.md): how the outline breaks into articles
- [articles/](articles/): essays, one Markdown file per piece. This is the only folder the site publishes.
- [notes/article-template.md](notes/article-template.md): starting structure for a new essay

## The site

moviemanufacturing.com is an [Astro](https://astro.build) site built from `articles/`.

```
npm install
npm run dev
```

- Site: http://localhost:4321
- Editor: http://localhost:4321/keystatic (local only, saves straight to `articles/`)

Posts with `draft: true` show up locally with a Draft badge and are left out of `npm run build`.

