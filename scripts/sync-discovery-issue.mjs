import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { discoveryIssueBody, previousRepositories, repositoryChanges } from './discovery-issue-utils.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(await readFile(path.join(root, 'data/projects.json'), 'utf8'))
const token = process.env.GITHUB_TOKEN || ''
const targetRepository = process.env.GITHUB_REPOSITORY || ''
const apiRoot = process.env.GITHUB_API_URL || 'https://api.github.com'
const title = 'Repository discovery inbox'

if (!token || !targetRepository) {
  throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required to synchronize the discovery inbox')
}

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'bean-pulse-dashboard',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function github(endpoint, options = {}) {
  const response = await fetch(`${apiRoot}${endpoint}`, { ...options, headers: { ...headers, ...options.headers } })
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${endpoint}`)
  return response.status === 204 ? null : response.json()
}

const available = (data.catalog ?? []).filter((repository) => !repository.watched)
const issues = await github(`/repos/${targetRepository}/issues?state=all&per_page=100&sort=updated&direction=desc`)
const existing = issues.find((issue) => !issue.pull_request && issue.title === title)

if (!available.length && !existing) {
  console.log('Every discovered repository is already watched.')
  process.exit(0)
}

const body = discoveryIssueBody(data, available)
const nextNames = available.map((repository) => repository.repository).sort()

if (!existing) {
  await github(`/repos/${targetRepository}/issues`, { method: 'POST', body: JSON.stringify({ title, body }) })
  console.log(`Created discovery inbox with ${available.length} available repositories.`)
  process.exit(0)
}

const previousNames = previousRepositories(existing.body)
const { added, removed } = repositoryChanges(previousNames, nextNames)
const desiredState = available.length ? 'open' : 'closed'

if (!added.length && !removed.length && existing.state === desiredState) {
  console.log('Repository discovery inbox is already current.')
  process.exit(0)
}

await github(`/repos/${targetRepository}/issues/${existing.number}`, {
  method: 'PATCH',
  body: JSON.stringify({ body, state: desiredState }),
})

if (added.length) {
  const comment = `New repositories discovered:\n\n${added.map((repository) => `- \`${repository}\``).join('\n')}\n\nOpen the BeanPulse project catalog to review and request tracking.`
  await github(`/repos/${targetRepository}/issues/${existing.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: comment }),
  })
}

console.log(`Updated discovery inbox: ${added.length} added, ${removed.length} removed.`)
