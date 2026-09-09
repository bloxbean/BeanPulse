# Project and roadmap configuration

BeanPulse separates repository data from product context:

- `config/projects.json` defines organization discovery and decides which
  repositories receive full tracking.
- `config/roadmaps.json` adds human-written product outcomes to selected releases.
- `data/projects.json` is generated and must not be edited manually.

## Organization discovery

The top-level discovery configuration controls the public repository catalog:

```json
{
  "organization": "bloxbean",
  "discovery": {
    "excludeRepositories": ["bloxbean/BeanPulse"],
    "newRepositoryWindowDays": 30
  },
  "projects": []
}
```

| Field | Purpose |
| --- | --- |
| `organization` | GitHub organization whose public repositories are discovered. |
| `excludeRepositories` | Repositories that should never appear in the Available projects catalog. Names are full `owner/repository` values and matching is case-insensitive. |
| `newRepositoryWindowDays` | Number of days a newly created repository keeps its **New** badge. |

Discovery collects lightweight metadata for every eligible public repository.
Detailed PR, issue, release, review, and CI collection runs only for entries in
the `projects` watchlist. This keeps API usage and the Pages artifact controlled.

The workflow also maintains a single **Repository discovery inbox** issue. Its
body lists unwatched repositories, and a new comment is added when the catalog
gains a repository. Subscribe to that issue for notifications.

## Add a project

Select one or more entries under **Available projects** and prepare a tracking
request. After approval, add one object per repository to the `projects` array in
`config/projects.json`:

```json
{
  "slug": "example-project",
  "name": "Example Project",
  "repository": "bloxbean/example-project",
  "description": "A short explanation of the project's purpose.",
  "accent": "#14b8a6"
}
```

| Field | Rules |
| --- | --- |
| `slug` | Unique, URL-safe identifier. Lowercase words separated by hyphens are recommended. |
| `name` | Human-readable project name shown in the selector and headings. |
| `repository` | Full GitHub `owner/repository` name. |
| `description` | One short product-level sentence, not implementation detail. |
| `accent` | Six-digit CSS hexadecimal color used on the project card. |

After changing the configuration:

```bash
npm run data:refresh
npm run dev
```

Check the project card and all four project tabs. A project with no version
metadata will still work; its PRs and issues will appear under **Unassigned**.

To remove a project, delete its configuration object and refresh the snapshot.
The repository returns to Available projects unless it is also excluded. This
changes BeanPulse only and never modifies the source repository.

## Release conventions

The recognized version format is:

```text
[optional v]major.minor.patch-or-x[-prerelease]
```

Examples:

- `3.0.0`
- `3.0.0-beta4`
- `0.1.0-pre17`
- `v2.1.0-rc1`
- `2.0.x`

Category labels such as `enhancement`, `bug`, or `documentation` are not treated
as releases.

BeanPulse checks these sources:

1. Version labels on PRs and issues.
2. Version milestones on PRs and issues.
3. PR base branches named `release/<version>`.

The same version found in more than one place is de-duplicated. If an item has
two different valid version assignments, it appears in both releases. Resolve
conflicting metadata in GitHub when that is not intended.

## Add a curated roadmap

Roadmaps are keyed first by project slug and then by release name:

```json
{
  "example-project": {
    "1.2.0-beta1": {
      "goal": "Make the first beta safe and useful for early adopters.",
      "outcomes": [
        {
          "id": "faster-sync",
          "title": "Faster initial synchronization",
          "description": "Operators can start a new instance with less waiting and clearer progress feedback.",
          "pullRequests": [123, 128],
          "issues": [97]
        }
      ]
    }
  }
}
```

| Field | Rules |
| --- | --- |
| `goal` | One sentence explaining the value of the release. |
| `outcomes` | A small set of product capabilities or user-visible results. |
| `id` | Stable, unique identifier within the release. |
| `title` | Outcome language, not a PR title or engineering task. |
| `description` | Explain who benefits and what becomes possible or better. |
| `pullRequests` | PR numbers from the same project and release. |
| `issues` | Issue numbers from the same project and release. |

References are linked only when the matching PR or issue is part of that release.
If a reference is missing, verify its repository, number, and release assignment.

### Outcome status

BeanPulse derives status from the linked implementation work:

- **In progress:** at least one linked PR is open.
- **Planned:** no PR is open and at least one linked issue is open.
- **Shipped:** linked PRs exist and all are merged.
- **Closed:** a linked PR was closed without merging and no higher-priority rule applies.
- **Done:** linked issues exist and all are closed.

An outcome without matching references remains **Planned**.

## Writing useful outcomes

Prefer:

> Applications can retrieve asset history reliably for large, high-activity
> policies.

Avoid:

> Fix asset history query in PR #123.

The first version communicates product value. PR and issue numbers already appear
as implementation references beneath it.

When no curated roadmap exists, BeanPulse creates an inferred view from component
labels and conventional title scopes such as `feat(api):`. Inferred roadmaps are
navigation aids, not a replacement for product decisions.
