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

## Release train

The `releaseTrain` section of `config/projects.json` lists the watched projects
whose versions depend on each other. For each one the collector reads
`gradle.properties` and `gradle/libs.versions.toml` on its default branch, and its
GitHub releases.

```json
"releaseTrain": {
  "projects": [
    { "slug": "cardano-client-lib", "keys": ["cardano-client-lib", "cardanoClientLibVersion"] },
    { "slug": "yaci", "branch": "next", "keys": ["yaci"] },
    { "slug": "yano", "keys": [], "parts": [
      { "slug": "yano-foundation", "name": "Yano foundation", "note": "node API, host API",
        "keys": ["yanoVersion", "nodeApiVersion", "hostApiVersion"] }
    ] }
  ]
}
```

| Field | Rules |
| --- | --- |
| `slug` | A watched project from `projects`. |
| `branch` | Optional. The branch whose build files count, when it is not the default branch. |
| `keys` | The names other projects use to pin this project: a `gradle.properties` key, a `[versions]` key, or the artifact name in a `group:artifact:version` coordinate. |
| `parts` | Optional. Artifacts the project publishes on their own, such as its APIs, used by a project that the main project itself uses. A pin on a part's keys points at the part, which breaks what would otherwise be a cycle. |

How a pin is judged:

- **Latest release:** the pinned version is the newest GitHub release of its line
  (major.minor), in GitHub's release order.
- **Behind:** it is an older release.
- **Unreleased:** it is not a release at all, for example a `-SNAPSHOT` or a
  qualification build such as `0.1.0-pre6-a3ef67b36`. It blocks a release of the
  project that pins it.

Release rehearsal tags ending in `-dev<n>` are ignored. A project's release step
is one more than the highest step among the projects it uses. A project is also
flagged when its own version is already released, because its next release needs
a new version.

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

A release is a **GitHub milestone**. Nothing else creates one: version labels
and `release/<version>` branches are ignored. Every milestone becomes a release,
so an empty milestone still shows as planned work.

A curated roadmap is the one exception. Because it names the work belonging to a
release, its key holds the release open and claims the PRs and issues it lists, even
when no milestone exists yet. A refresh warns when this happens:

```text
bloxbean/yaci-store: curated roadmap "3.0.0-beta4" has no milestone.
```

Create the milestone to restore automatic membership. Until then the roadmap
still renders and its items stay out of **Unassigned**.

Labels classify work on three independent axes:

| Prefix | Meaning | Example |
| --- | --- | --- |
| `area:` | Functional area | `area:bf-api`, `area:core-api`, `area:mcp` |
| `type:` | Change type | `type:chore` |
| `priority:` | Priority | `priority:P1` |

The change type is taken from a conventional-commit title prefix when present
(`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`,
`style`, `revert`, plus aliases such as `feature` and `bug`), and falls back to a
`type:` label.

### Area aliases

Renaming labels across repositories takes time. Until then, `areaAliases` maps
existing label names onto canonical areas, so no repository has to be edited for
areas to appear:

```json
{
  "areaAliases": {
    "Blockfrost API": "bf-api",
    "bf-api": "bf-api",
    "Core API": "core-api"
  }
}
```

Matching is case-insensitive. An `area:` label on an item always wins over an
alias. Once a repository adopts `area:` labels, its aliases can be deleted.

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
