# Series Plan (draft)

`outline.md` is Tom's personal completeness map. This file is a separate, loose
idea of how articles or videos might come out of it later. Each article needs a real
production problem up front; the map is just reference.

## The spine: one event stream
The strongest idea running through the outline is that everything emits events
into one stream:

- Registries (3.8) define the Event System
- Tracker events (4.11) feed into it
- Task phases (5.8) emit into it
- Analytics (12.3) derives time actuals from it — no timesheets
- Ticket hydration (10.6) turns a coordinate into agent context

Second thread: **the Coordinate Object** (1.3). It shows up again in 10.6 and is
probably what makes agents useful at all. It needs its own article.

Use these two as the recurring callbacks that tie the series together.

## Proposed order

| # | Working title | Outline sections | Why here |
|---|---------------|------------------|----------|
| 0 | Hire the Critiquer | The Result + Commentary | The "why" and the part most likely to be shared. Readers who aren't pipeline TDs (producers, studio heads) care about this one. |
| 1 | Creative CI/CD | 5 | Novel framing, easy to picture: Start → Build → Art → Render → Review → Refresh → Publish. |
| 2 | Tokens, Paths, and the Coordinate Object | 1 | The foundation. Show how "where is this shot?" becomes one object that agents and humans share. |
| 3 | Versions and Manifests (and why they end up in USD) | 2 | Film vs engine VCS is a real split in the industry and worth arguing about. |
| 4 | Registries and the Event Stream | 3 | Introduces the spine properly. Strong contrarian point: manifests backed by Pydantic models beat a database for the first build-out. |
| 5 | Ontology Wins: One Language, Any Tracker | 4 | ShotGrid is what most studios know, so it's a familiar way in. House standard fields pulled from every tracker, a dictionary per tracker, sync toggled per show. Pairs with #6: same ontology idea applied to apps. |
| 6 | One Ontology, Every App: Plugins and MCP | 6 | This is the "agentic" part people are curious about. |
| 7 | The Cookbook: Recipes Agents Can Run | 7 | |
| 8 | Services | 8 | Image, video, mesh, AI, queuing, delivery. |
| 9 | Cloud IT for a Studio That Doesn't Have an IT Department | 9 | Identity, storage, workstations, burst render, cost per show. |
| 10 | Artists File Their Own Tickets | 10 | Agentic scrum, ticket hydration. |
| 11 | Nobody Budgets for Support | 11 | Your strong opinion: studios skip support & maintenance when they build out. Could move early, alongside #0. |
| 12 | Timesheets Are Dead | 12 | Pays off the event stream. |

## Open questions
- Who is the primary reader: pipeline TDs, supervisors/producers, or studio owners?
  That changes how technical each piece should be.
- `dev/production_tokens.md` is referenced in the outline but isn't in this repo.
  Bring it in if it can be shared.
- Section 5 note: "In a pinch Review first, then publish". Is that saying the
  phases can be collapsed down to Review → Publish on small jobs? Worth making explicit.
- Tracker field assessment (4.5) hasn't been done recently. Worth redoing before
  writing #5 so the house standard reflects current ShotGrid/Flow, Ftrack, Ayon, Kitsu.
