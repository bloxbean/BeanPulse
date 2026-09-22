# BeanPulse

BeanPulse is Bloxbean's central delivery dashboard. It collects public release,
pull request, issue, review, and CI information from multiple GitHub repositories
and publishes a single static GitHub Pages site.

The shared watchlist is defined in `config/projects.json`. BeanPulse also
discovers the rest of the organization's public repositories so maintainers can
choose which projects should receive full tracking.

## What BeanPulse provides

- An organization-level project directory and project selector.
- Automatic discovery of public repositories in the Bloxbean organization.
- An Available projects catalog for selecting and requesting new watchlist entries.
- Overview, release, pull request, and issue views for every project.
- Release grouping from GitHub milestones, with `area:`, `type:` and `priority:` labels for classification.
- A dedicated **Unassigned** lane for work without a release version.
- Product-outcome roadmaps with links to the implementing PRs and issues.
- Search, status filters, progress totals, review state, and CI state.
- Twice-daily, manual, and on-change GitHub Pages refreshes.
- A static site with no database, runtime service, or browser-side secret.

## Quick start

### Requirements

- Node.js 24 or later.
- Network access to public GitHub repositories.
- Optional: a read-only GitHub token for richer review and CI information.

### Run locally

From the repository root:

```bash
npm run data:refresh
npm run dev
```

Open <http://127.0.0.1:3001>. Do not open `index.html` directly with a
`file://` URL because the browser will not reliably load the generated JSON
snapshot from disk.

For complete authenticated collection, provide a read-only token only for the
refresh command:

```bash
GITHUB_TOKEN=your_read_only_token npm run data:refresh
```

The token is used by the collector process only. It is not written to the data
snapshot or sent to the browser.

## Using the dashboard

1. Open the BeanPulse home page and select a project.
2. Use **Overview** for the project's current delivery pulse.
3. Use **Releases** to select a version and see its product outcomes, PRs, issues,
   and completion totals.
4. Use **Pull requests** or **Issues** to search all collected work and filter by
   status.
5. Select **Unassigned** under Releases to find work that still needs a
   milestone.
6. Follow any item number to open the original GitHub record.

On the home page, **Available projects** lists repositories that BeanPulse has
discovered but does not yet track in detail. Select one or more repositories and
choose **Prepare tracking request**. BeanPulse opens one pre-filled GitHub issue
for maintainer review; no browser credential or direct repository write is needed.

The roadmap intentionally describes user or product outcomes rather than copying
PR titles. If a curated roadmap is unavailable, BeanPulse shows an inferred view
grouped by component labels and conventional title scopes.

## How release assignment works

BeanPulse recognizes version names such as `3.0.0-beta4`, `0.1.0-pre17`,
`2.0.1`, and `2.0.x`. A PR or issue is associated with a release when the version
appears in any of these places:

A GitHub milestone. Version labels and `release/*` base branches are no longer
release signals; labels carry area, type and priority instead.

If none applies, the item appears in **Unassigned**. See
[Project and roadmap configuration](docs/CONFIGURATION.md) for examples and edge
cases.

## Automatic refresh and GitHub Pages

The workflow in [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
runs at **07:17 and 19:17 Europe/Dublin time every day**. It also runs manually,
when `main` changes, or when a future integration sends the
`refresh-dashboard` repository event.

Each run discovers repositories, validates the dashboard, collects watched-project
data, synchronizes one Repository discovery inbox issue, creates a private Pages
artifact, and deploys that artifact. Subscribe to the inbox issue to be notified
when a repository appears. Scheduled runs do not create automated data commits in
the repository.

For dependable cross-repository access, add a repository Actions secret named
`BEANPULSE_GITHUB_TOKEN`. Use a fine-grained token with read-only access to the
monitored repositories and their metadata, contents, issues, pull requests, and
checks. The workflow falls back to its built-in token, cached data, or a lighter
public preview when full API access is unavailable.

API usage scales with the number and activity of watched projects. Two runs per
day are designed to remain comfortably below authenticated hourly limits. See
[Operations and deployment](docs/OPERATIONS.md) for the setup and recovery
procedures.

## Adding or updating a project

1. Find the repository under **Available projects** on the BeanPulse home page.
2. Select it and prepare a tracking request.
3. After review, add it to [`config/projects.json`](config/projects.json).
4. Optionally add curated release outcomes to
   [`config/roadmaps.json`](config/roadmaps.json).
5. Refresh the data.
6. Open the project locally and check its Overview, Releases, PRs, Issues, and
   Unassigned lane.
7. Run the verification suite before opening a PR.

The complete schema and examples are in
[Project and roadmap configuration](docs/CONFIGURATION.md).

## Verification

```bash
npm run verify
```

This runs the unit tests and checks every JavaScript module for syntax errors.
The site has no runtime dependencies and no compilation step.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html` | Static site entry point and browser metadata. |
| `assets/` | Dashboard interface and responsive styles. |
| `config/projects.json` | Organization discovery settings and the detailed watchlist. |
| `config/roadmaps.json` | Curated product outcomes for selected releases. |
| `scripts/fetch-project-data.mjs` | Main GitHub data collector. |
| `scripts/release-data-utils.mjs` | Release detection and status summaries. |
| `scripts/public-github-preview.mjs` | Reduced public fallback when API access is unavailable. |
| `scripts/serve.mjs` | Local static preview server. |
| `data/projects.json` | Generated local snapshot; untracked, rebuilt by `npm run data:refresh`. |
| `scripts/sync-discovery-issue.mjs` | Maintains the new-repository notification inbox. |
| `.github/workflows/deploy-pages.yml` | Refresh, validation, and Pages deployment. |

## Documentation

- [Project and roadmap configuration](docs/CONFIGURATION.md)
- [Operations and deployment](docs/OPERATIONS.md)
- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
