# How to Build an Agentic Pipeline From Scratch

> Personal system map. Used to check the whole system is modeled; the reference to come back to when writing articles or making videos.

Scope: pipeline substrate only — the story layer (script, editorial, boards, previs) sits on top of this.

## 1. File Management
1. Production Tokens (see dev/production_tokens.md)
2. Path Mapping
   1. Map tokens based on project type, etc…
   2. Automated Spec Sheet Generation
3. Coordinate Object
4. Visual Previews

## 2. Version Systems
1. VCS
   1. Film/Animation Centric (v001, 001.015, etc…)
   2. Engine Centric (Perforce, Plastic, Diversion)
2. Version Manifests
   1. Scene Descriptions as part of it
   2. Scene Description → USD

## 3. Production Registries
Manifests first, database later.

1. Project Registry
2. Asset Registry
3. Scene/Sequence Registry
4. Task Registry
5. Status Registry
6. Software Registry
7. People Registry
   1. Identity (one person across tracker, storage, workstations, chat; ties to Cloud IT identity)
   2. Role, department, seniority
   3. Employment type (staff, freelance, vendor) and contract dates
   4. Rates and budget codes
   5. Skills and software proficiency
   6. Location, time zone, working hours
   7. Availability and capacity (bookings across shows, PTO)
   8. Show assignments and permissions
   9. Assigned workstation and licenses
   10. Preferences (apps, menus, notifications)
   11. History (tasks, versions, time actuals from the event stream)
   12. Privacy (who can see rates and personal info)
8. Event System
9. Storage: Manifests over Database
   1. One solid manifest per entity type, each backed by a Pydantic model
   2. Files you can read live: see the data directly, and it often shows things a database hides
   3. Databases bloat quickly
   4. More efficient for the first build-out of a studio
   5. Can move to a database later

## 4. Production Tracking
1. Tracker of Record
   1. ShotGrid (Autodesk Flow Production Tracking) most common; Ftrack, Ayon, Kitsu
   2. Spreadsheets / Airtable / Notion on small shows
2. House Standard Fields — ontology wins
   1. One central language for fields; common terms wherever possible (same ontology as plugins)
   2. Built by pulling fields from every tracker, not modeled on any one of them
   3. Once the central language exists, any tracker fits
3. Tracker Dictionaries
   1. One dictionary per tracker: house field ↔ tracker field
   2. Tracker entities (Project, Sequence, Shot, Asset, Task, Version, Playlist, Note) → house terms
   3. Status mapping per tracker
   4. Custom fields per show
4. Universal Sync — toggle per show
5. Field Assessment — periodically survey all trackers, fold new fields into the house standard
6. People — users as standalone models, not just fields; People Registry mapped through each tracker's dictionary
7. Bidding, Scheduling & Assignments
   1. Bidding
      1. Three complexity levels per item
      2. Default bid templates — build once, adjust per show
      3. Templates encode what the studio knows about itself
   2. Scheduling
      1. Gantt view
      2. Deliveries as milestones — clearly define which items must be done by each delivery
   3. Assignments
8. Versions & Review
   1. Publishes create tracker Versions automatically
   2. Playlists / dailies
   3. Notes flow back to tasks and artists
9. Producer Views (dashboards, reports, client status)
10. Artist View (my tasks, inside the DCC)
11. Tracker Events (webhooks / event daemon) → the one event stream

## 5. Creative CI/CD (Task Phases)
In a pinch Review first, then publish - these can be standardized.

1. Start
2. Build
3. Art
4. Render
5. Review
6. Refresh
7. Publish
8. Event Tracking — every phase emits events, one stream

## 6. Plugin Architecture
1. Headless Setup / Install
2. Environment Management
3. Common Ontology
   1. Nouns, verbs, adjectives common where possible across plugins.
4. MCP Framework
5. Custom Menu Integration

## 7. Pipeline Management
1. Company/Project focused Code Repo
2. Visual Manager (Cookbook)
   1. Task Phase Recipes
   2. Application Recipes (Menus, Shelves etc..)
   3. Custom Tool Management
3. Agentic Execution of "tools", recipe steps.
4. Release Management
   1. Pipeline versions pinned per show
   2. Rollout (staged: dev → test show → production shows)
   3. Rollback
   4. Release notes (feeds artist-facing docs)
5. Testing
   1. Tests for pipeline tools, plugins, and recipes
   2. Staging / test show
   3. Testing against each supported DCC / engine version

## 8. Services Architecture
1. Image
2. Video
3. Mesh / 3d
4. AI Services
5. Queuing Systems: (Deadline)
6. Delivery (conform, delivery variants, output specs)
7. Vendor / Outsource Exchange
   1. Packaging data out to vendors (assets, plates, specs, house standards)
   2. Ingesting vendor work back in (validation against house standards, renaming to tokens)
   3. Tracking what was sent and received

## 9. Cloud IT & Infrastructure
1. Identity & Access
   1. SSO, accounts, roles
   2. Onboarding / offboarding (staff, freelancers, vendors)
   3. Who can publish, approve, and see what
2. Storage
   1. On-prem, cloud, or hybrid
   2. Remote file access and caching for distributed artists
3. Workstations
   1. Physical vs cloud / virtual workstations
   2. Remote access (PCoIP, Parsec, etc…)
   3. Provisioning (ties to Headless Setup)
4. Compute
   1. Render farm, on-prem and cloud burst
   2. GPU for AI services
5. Networking & VPN
6. Licensing (license servers, seats, checkout tied to the Software Registry)
7. Security & Compliance (TPN / client security requirements)
8. Backup, Archive & Disaster Recovery (show wrap, cold storage, restoring a show)
9. Infrastructure as Code (repeatable studio / show spin-up)
10. Cost Management (cloud spend per show)

## 10. Agentic Scrum Management
1. Artists/Developers Submit tickets
2. Triage
3. Organization
4. Sprint Execution
5. Commit & PR documentation
6. Ticket Hydration (coordinate → agent context)

## 11. Support, Maintenance & Documentation
The part nobody budgets for when they build out a studio.

1. Support Channels
   1. Where artists ask for help (chat channel, in-app button, agent first responder)
   2. Tiers: agent answers → pipeline TD → developer
2. Bug Fix Lifecycle
   1. Report (auto-captured coordinate, logs, software versions)
   2. Repro
   3. Fix
   4. Hotfix vs scheduled release
   5. Notify the reporter and close the loop
3. Feature Request Lifecycle
   1. Request
   2. Evaluate (who else needs it, show vs studio scope)
   3. Roadmap
   4. Ship
   5. Announce
4. Artist-Facing Documentation
   1. Generated from recipes, ontology, and menus (docs stay in sync with the tools)
   2. How-tos per task phase
   3. Onboarding for new artists / new shows
   4. Release notes / changelogs written for artists, not developers
5. Maintenance
   1. DCC / engine version upgrades (keeping every plugin working on the new version)
   2. Dependency and environment updates
   3. Service upkeep (sync connectors break when the tracker's API changes)
   4. Tech debt budget
   5. Staffing: who owns the pipeline after the build (budget ongoing hours, not just the build)
6. Feedback Loop
   1. Support volume by tool feeds Analytics and the backlog

## 12. Analytics
1. Task Telemetry (machine time vs human time)
2. Pipeline Feature Telemetry
3. Time Actuals (derived from the event stream, no timesheets)
4. Effort Graph / Savings

## The Result
Supercharged Artists — you don't build this directly; the systems produce it.

1. All technical chores Automated
2. MCP integration with ALL software using standardized language & studio pipeline back end.
3. Artist file their own tickets & feature requests

**Commentary:** systems like this invert the hiring logic. You hire for experience, taste, and craft expertise — NOT for low wages. Because the system is a force multiplier, it's now cheaper to hire exceptional talent and 10x them. When you hire cheap, they are only as good as the person critiquing them — hire the critiquer.

