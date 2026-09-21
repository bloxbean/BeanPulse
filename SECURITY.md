# Security

BeanPulse publishes a static snapshot of GitHub project information. Its primary
security boundary is keeping collection credentials out of that public snapshot.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for the BeanPulse repository when
it is enabled. Otherwise, contact a Bloxbean repository maintainer privately.
Do not include tokens, private repository data, or exploit details in a public
issue.

## Credential rules

- Store the production token only as the `BEANPULSE_GITHUB_TOKEN` Actions secret.
- Use a fine-grained, read-only token limited to monitored repositories.
- Never place token values in configuration, generated data, browser code,
  workflow arguments, documentation, screenshots, or logs.
- Rotate the token immediately if it is exposed and remove the exposed value from
  Git history according to the organization's incident process.
- Remove access when a repository is no longer monitored.
- Keep discovery-issue writes scoped to the BeanPulse repository's built-in token.

## Publishing private data

The current projects are public. Before adding a private repository, confirm that
publishing its repository name, PR and issue titles, authors, labels, milestones,
dates, statuses, and roadmap information is explicitly approved. A private source
does not make the GitHub Pages output private.

## Supported version

Security fixes are applied to the latest version on the repository's default
branch.
