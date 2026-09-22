# Operations and deployment

This guide covers the initial GitHub Pages setup, routine refreshes, access
credentials, monitoring, and recovery.

## Initial GitHub setup

After the BeanPulse implementation reaches the repository's default branch:

1. Open **Settings → Pages** in the BeanPulse repository.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Add the `BEANPULSE_GITHUB_TOKEN` Actions secret described below.
4. Open **Actions → Refresh and deploy BeanPulse**.
5. Select **Run workflow** for the first deployment.
6. Confirm the build and deploy jobs succeed.
7. Open the URL shown in the deployment summary and check all configured projects.
8. Open the **Repository discovery inbox** issue and subscribe to notifications.

Scheduled workflows run only from the default branch, so the schedule becomes
active after the workflow is merged there.

## Authentication

Create a fine-grained token owned by the Bloxbean organization or an approved
maintainer account. Limit it to the repositories monitored by BeanPulse.

Recommended read-only repository permissions:

- Metadata
- Contents
- Issues
- Pull requests
- Checks

In the BeanPulse repository, open **Settings → Secrets and variables → Actions →
New repository secret**. Save the value with the name
`BEANPULSE_GITHUB_TOKEN`. Never place it in `config/`, `data/`, browser code,
documentation examples, commits, or workflow logs.

The workflow uses the secret only while collecting data. GitHub Pages receives
the generated public JSON, HTML, CSS, and JavaScript—not the token.

If the secret is missing, the collector attempts the built-in workflow token and
then its cached/public fallbacks. These fallbacks are useful for previews but are
not the preferred production data source across repositories.

## Refresh schedule

The workflow runs every day at:

- 07:17 Europe/Dublin
- 19:17 Europe/Dublin

The IANA timezone setting follows daylight-saving changes. The non-zero minute
reduces the chance of delays caused by heavy GitHub Actions traffic at the top of
the hour.

The same workflow also runs:

- On a push to `main`, so code and configuration changes are deployed.
- Through the **Run workflow** button.
- On a `repository_dispatch` event named `refresh-dashboard`, reserved for a
  future event-driven integration.

## Repository discovery inbox

Each refresh fetches the Bloxbean public repository catalog and compares it with
the watchlist. The workflow maintains one issue titled **Repository discovery
inbox** in BeanPulse:

- Newly created repositories appear first and retain a New badge for the
  configured window.
- Other unwatched repositories remain available for review.
- A comment is added when repositories are newly discovered.
- Repositories disappear from the inbox after they are watched or excluded.
- The issue closes automatically when no repositories remain to review.

Subscribe to the issue to receive new-repository notifications. The workflow's
`issues: write` permission applies to BeanPulse only and is not used on source
repositories.

From the published home page, select repositories under **Available projects**
and choose **Prepare tracking request**. This opens a separate pre-filled issue.
A maintainer reviews the request, adds approved entries to
`config/projects.json`, and follows the normal PR process.

## What happens during a refresh

1. Check out the latest BeanPulse default branch.
2. Set up Node.js.
3. Run the verification suite.
4. Fetch repository, PR, issue, review, and CI information.
5. Generate the organization catalog and watched-project snapshot.
6. Synchronize the Repository discovery inbox.
7. Package only the static site files as a GitHub Pages artifact.
8. Deploy the artifact to the `github-pages` environment.

The generated snapshot is not committed by scheduled runs. This avoids noisy
twice-daily commits while ensuring the published site contains the latest data.

## API budget

`PR_DETAIL_LIMIT` controls how many relevant PRs per project receive the extra
review and CI requests. The workflow currently uses `20`.

API usage depends on the size and activity of the configured watchlist. Runs are
twelve hours apart and should remain comfortably within the authenticated limit
for the current watchlist. If many more projects are added, lower
`PR_DETAIL_LIMIT`, move to a GitHub App, or optimize collection before increasing
refresh frequency.

GitHub's unauthenticated allowance is much smaller than its authenticated
allowance, so production refreshes should use the configured secret even though
all current source repositories are public.

The collector prioritizes version-assigned and open PRs for enrichment. Every PR
still appears even when its review or CI detail was not enriched.

## Manual refresh

Use a manual run when:

- A release assignment was corrected and should be visible immediately.
- A project or roadmap was added.
- A newly created repository should be discovered immediately.
- The previous scheduled run failed.
- A token was added or rotated.

In GitHub, open **Actions**, choose **Refresh and deploy BeanPulse**, select
**Run workflow**, and wait for both jobs to complete.

Locally, run:

```bash
npm run data:refresh
```

## Freshness and fallback behavior

The dashboard header shows when `data/projects.json` was generated. If a GitHub
API request fails:

- An existing project keeps its previous cached snapshot.
- A newly configured project attempts a reduced public-page preview.
- Review and CI details may be marked unavailable in fallback data.

This keeps the dashboard usable during a temporary rate limit, but a successful
authenticated run should be restored promptly.

## Troubleshooting

### The site is stale

1. Check the synchronization time in the BeanPulse header.
2. Inspect the latest workflow run in the Actions tab.
3. Run the workflow manually.
4. Confirm `BEANPULSE_GITHUB_TOKEN` still exists and can read every monitored
   repository.
5. Check for renamed, transferred, private, or archived repositories.

### The collector reports 403 or a rate limit

- Confirm the token was not omitted, expired, or revoked.
- Confirm the required repositories and read permissions are selected.
- Do not repeatedly retry while GitHub reports no remaining allowance.
- Reduce `PR_DETAIL_LIMIT` if the monitored project count has grown materially.

### A repository reports 404

- Check the exact `owner/repository` value in `config/projects.json`.
- Confirm the token can see the repository if it is private.
- Confirm the repository was not renamed or transferred.

### A new repository is not discovered

- Confirm it is public and belongs to the configured organization.
- Check whether it appears under `excludeRepositories`.
- Run the workflow manually and inspect the collection step.
- Confirm the organization endpoint is accessible to the collection token.

### No discovery notification was received

- Confirm the Repository discovery inbox exists and is open.
- Subscribe to that issue; an issue edit alone may not notify every watcher.
- Confirm the workflow has `issues: write` permission.
- Check whether the repository was already recorded in the inbox marker.

### GitHub Pages returns 404

- Confirm **Settings → Pages → Source** is set to **GitHub Actions**.
- Confirm the deploy job completed successfully.
- Confirm the workflow is present on the default branch.
- Open the deployment URL from the latest workflow summary rather than guessing
  the path.

### A PR or issue is in the wrong release

Check its milestone, which is the only thing that places an item in a release.
Correct the milestone in the source repository and run a refresh. An item with no
milestone appears under **Unassigned**.

### A roadmap reference is missing

The referenced PR or issue must belong to the same project and release. Check the
number and its release assignment, then refresh.

## Routine maintenance

- Review failed scheduled runs and stale synchronization times.
- Review and triage tracking requests from the Available projects catalog.
- Rotate the read-only token according to the organization's credential policy.
- Remove token access when a project leaves the dashboard.
- Review inferred roadmaps and curate important active releases.
- Revisit `PR_DETAIL_LIMIT` whenever the monitored project count grows.
- Keep the workflow actions and Node.js version current through reviewed PRs.

Useful GitHub references:

- [Scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
- [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [Custom GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
