# Architecture and data flow

BeanPulse is intentionally static. GitHub Actions performs collection and GitHub
Pages serves the result; there is no production application server or database.

## Data flow

```text
GitHub organization ──────┐
                          ├──> discovery catalog ───┐
GitHub repositories ──────┤                         │
                          │                         v
config/projects.json ─────┼──> collector ──> data/projects.json
                          │                         │
config/roadmaps.json ─────┘                         v
                                           static browser app
                                                    │
                                                    v
                                           GitHub Pages artifact
```

## Components

### Project configuration

`config/projects.json` defines the discovery organization, exclusions, new-project
window, and shared watchlist. Watchlist entries contain display information and
GitHub repository identifiers.

The collector fetches lightweight metadata for eligible public organization
repositories. The catalog marks entries as watched or available. Only watched
entries continue through detailed collection.

### Product roadmaps

`config/roadmaps.json` provides the context GitHub cannot infer reliably: the
goal of a release and the product outcomes delivered by its implementation work.

### Collector

`scripts/fetch-project-data.mjs` calls the GitHub REST API and normalizes data
from every configured repository. It:

- Fetches repository metadata, labels, PRs, and issues.
- Separates issues from PRs returned by GitHub's issues endpoint.
- Detects release assignments.
- Enriches a bounded number of relevant PRs with reviews and checks.
- Computes release totals.
- Merges curated roadmap configuration.
- Writes a single generated JSON snapshot.

The snapshot contains both `catalog` for repository discovery and `projects` for
the detailed watchlist.

When API access is temporarily unavailable, existing projects keep their cached
snapshot. A new project can use `scripts/public-github-preview.mjs` to create a
smaller preview from public GitHub pages.

### Browser application

`index.html`, `assets/app.js`, and `assets/styles.css` form a dependency-free
single-page application. Navigation uses query parameters, so project and release
views can be bookmarked without requiring server-side routing.

The browser fetches `data/projects.json` relative to the page location and renders
all views locally. It never calls the GitHub API and never receives credentials.

### Deployment workflow

`.github/workflows/deploy-pages.yml` validates the code, generates a fresh data
snapshot, stages only the static files, uploads a Pages artifact, and deploys it
to the `github-pages` environment.

Before packaging the site, `scripts/sync-discovery-issue.mjs` compares the current
catalog with a marker stored in one BeanPulse issue. It updates the inbox and adds
a comment only when new repositories are detected. The built-in workflow token
has issue-write permission in BeanPulse; the browser has no write permission.

## Release model

A GitHub milestone creates the release assignment, and every milestone in a
repository becomes a lane even before work is assigned to it. A curated roadmap
also holds a lane open and claims the items it names, so hand-written product
context is never orphaned by a missing milestone. Items with neither are
calculated by the UI as the **Unassigned** lane.

Labels are read on three independent axes, none of which affects the release:

| Prefix | Meaning | Example |
| --- | --- | --- |
| `area:` | Functional area | `area:bf-api` |
| `type:` | Change type, when the title carries no prefix | `type:chore` |
| `priority:` | Priority | `priority:P1` |

The change type is read from a conventional-commit title prefix first, such as
`feat(core): …`, and falls back to a `type:` label.

Release progress is calculated from its PRs and issues:

```text
resolved = merged PRs + closed unmerged PRs + closed issues
progress = resolved / all assigned PRs and issues
```

This is a delivery completion signal, not a product-readiness or release-quality
score.

## Data and trust boundaries

- The published snapshot contains public GitHub metadata and curated public copy.
- The collection token exists only in the GitHub Actions environment.
- No secret is embedded in HTML, JavaScript, JSON, or browser storage.
- All source text is rendered as escaped text by the browser application.
- Links point back to the original GitHub records for verification.
- BeanPulse reads source repositories; it does not label, edit, close, or merge
  their work items.
- The workflow writes only to the BeanPulse discovery inbox issue; it never writes
  to a discovered or watched source repository.

If private repositories are added later, review whether their names, titles,
authors, labels, and status may be published on a public Pages site before
granting access.

## Known limits

- Scheduled refreshes are not real-time. The expected maximum delay is about
  twelve hours unless a manual or external event triggers a run.
- Discovery currently covers public organization repositories. Private
  repositories require an explicitly approved access and publication model.
- Review and CI enrichment is intentionally limited by `PR_DETAIL_LIMIT`.
- The issues query is capped at 1,000 recently updated repository items; very
  old issues can be omitted in exceptionally large repositories.
- Pull request collection is capped at 2,000 records per repository.
- The public-page fallback is intentionally partial and may omit metadata,
  pagination, reviews, checks, and older work.
- Inferred roadmap areas are derived from metadata and require human review.
- The Pages artifact is the published history; scheduled snapshots are not
  committed to Git.

## Scaling guidance

Collection grows approximately linearly with the number of repositories. Before
adding a large project set:

1. Measure requests and workflow duration.
2. Lower `PR_DETAIL_LIMIT` if review and CI calls dominate.
3. Consider conditional requests or GraphQL for high-volume repositories.
4. Move authentication to an organization-owned GitHub App when long-lived
   maintainer tokens are no longer appropriate.
5. Consider event-driven refreshes only when the operational complexity is
   justified by the required freshness.
