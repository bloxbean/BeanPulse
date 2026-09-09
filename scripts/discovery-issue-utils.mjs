function safeText(value = '') {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/@/g, '@\u200b')
    .trim()
    .slice(0, 180)
}

function marker(repositories) {
  return `<!-- beanpulse-discovery:${JSON.stringify(repositories)} -->`
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

BeanPulse discovered **${data.catalog?.length ?? 0}** eligible public repositories in the **${data.organization}** organization. Detailed tracking is enabled for **${watchedCount}**.

Use the project catalog on the BeanPulse home page to select repositories and prepare a tracking request. A maintainer can then add the approved repositories to \`config/projects.json\`.

## Newly created repositories

${repositoryList(recent)}

## Other repositories available to watch

${repositoryList(older)}

This issue is maintained automatically. Subscribe to it to be notified when the discovery catalog changes.

${marker(repositories)}
`
}
