export const DISCOVERY_ISSUE_TITLE = '[Automated] Repository discovery inbox'

const MARKER_PREFIX = '<!-- beanpulse-discovery:'

export function isDiscoveryIssue(body = '') {
  return String(body).includes(MARKER_PREFIX)
}

function safeText(value = '') {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/@/g, '@\u200b')
    .trim()
    .slice(0, 180)
}

function marker(repositories) {
  return `${MARKER_PREFIX}${JSON.stringify(repositories)} -->`
}

function repositoryList(repositories) {
  if (!repositories.length) return '_None._'
  return repositories.map((repository) => {
    const details = [repository.language, repository.archived ? 'archived' : '', repository.fork ? 'fork' : ''].filter(Boolean).join(' · ')
    const description = safeText(repository.description)
    return `- [ ] [\`${repository.repository}\`](${repository.url})${details ? ` — ${details}` : ''}${description ? `  \n  ${description}` : ''}`
  }).join('\n')
}

export function previousRepositories(body = '') {
  const match = body.match(/<!-- beanpulse-discovery:(\[[\s\S]*?\]) -->/)
  if (!match) return []
  try { return JSON.parse(match[1]) } catch { return [] }
}

export function repositoryChanges(previousNames, nextNames) {
  return {
    added: nextNames.filter((repository) => !previousNames.includes(repository)),
    removed: previousNames.filter((repository) => !nextNames.includes(repository)),
  }
}

export function discoveryIssueBody(data, available) {
  const recent = available.filter((repository) => repository.isNew)
  const older = available.filter((repository) => !repository.isNew)
  const watchedCount = (data.catalog ?? []).filter((repository) => repository.watched).length
  const repositories = available.map((repository) => repository.repository).sort()
  return `# Repository discovery inbox

> **Automated issue — please do not edit or close it by hand.**
> The BeanPulse refresh workflow rewrites this issue twice a day. Any manual
> change to the title or body is overwritten on the next run, and closing it
> will not stick while untracked repositories remain.
> To act on it, add repositories to \`config/projects.json\`; this issue closes
> itself once every discovered repository is tracked.

BeanPulse discovered **${data.catalog?.length ?? 0}** eligible public repositories in the **${data.organization}** organization. Detailed tracking is enabled for **${watchedCount}**.

Use the project catalog on the BeanPulse home page to select repositories and prepare a tracking request. A maintainer can then add the approved repositories to \`config/projects.json\`.

## Newly created repositories

${repositoryList(recent)}

## Other repositories available to watch

${repositoryList(older)}

Subscribe to this issue to be notified when the discovery catalog changes.

${marker(repositories)}
`
}
