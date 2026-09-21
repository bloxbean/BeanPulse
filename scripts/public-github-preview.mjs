import { isVersionName, releaseAssignments, reviewSummary, ciSummary } from './release-data-utils.mjs'

const headers = {
  Accept: 'text/html',
  'User-Agent': 'bean-pulse-dashboard',
}

async function page(url) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`GitHub page ${response.status} for ${url}`)
  return response.text()
}

function text(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim()
}

function issueNodes(html) {
  const match = html.match(/<script type="application\/json" data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/)
  if (!match) return []
  const payload = JSON.parse(match[1])
  const queries = payload?.payload?.preloadedQueries ?? []
  return queries.flatMap((query) => query?.result?.data?.repository?.search?.edges ?? []).map((edge) => edge.node).filter(Boolean)
}

function compactIssue(node, owner, repository) {
  const labels = (node.labels?.edges ?? []).map(({ node: label }) => ({ name: text(label.name), color: label.color || '7b8ba7' }))
  const issue = { labels, milestone: node.milestone, base: null }
  return {
    number: node.number,
    title: text(node.titleHtml),
    summary: '',
    url: `https://github.com/${owner}/${repository}/issues/${node.number}`,
    state: String(node.state).toLowerCase(),
    author: { login: node.author?.login ?? 'ghost', avatarUrl: '', url: node.author?.login ? `https://github.com/${node.author.login}` : '' },
    labels,
    milestone: node.milestone?.title ?? null,
    releases: releaseAssignments(issue),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    closedAt: node.closedAt,
  }
}

function compactPullRequests(html, owner, repository) {
  const starts = [...html.matchAll(/<div id="issue_(\d+)"[^>]*js-issue-row/g)]
  return starts.map((start, index) => {
    const number = Number(start[1])
    const end = starts[index + 1]?.index ?? html.length
    const row = html.slice(start.index, end)
    const status = row.match(/aria-label="([^"]*Pull Request)"/)?.[1] ?? 'Open Pull Request'
    const title = text(row.match(new RegExp(`<a id="issue_${number}_link"[^>]*>([\\s\\S]*?)<\\/a>`))?.[1])
    const author = row.match(/data-hovercard-url="\/users\/([^/]+)\/hovercard"/)?.[1] ?? 'ghost'
    const date = row.match(/<relative-time datetime="([^"]+)"/)?.[1] ?? new Date().toISOString()
    const state = status.startsWith('Merged') ? 'merged' : status.startsWith('Closed') ? 'closed' : 'open'
    return {
      number,
      title,
      summary: '',
      url: `https://github.com/${owner}/${repository}/pull/${number}`,
      state,
      draft: status.startsWith('Draft'),
      author: { login: author, avatarUrl: '', url: author === 'ghost' ? '' : `https://github.com/${author}` },
      labels: [],
      milestone: null,
      baseBranch: '',
      releases: [],
      review: reviewSummary([], []),
      ci: ciSummary([]),
      detailsAvailable: false,
      createdAt: date,
      updatedAt: date,
      closedAt: state === 'open' ? null : date,
      mergedAt: state === 'merged' ? date : null,
    }
  }).filter((pullRequest) => pullRequest.title)
}

function releaseList(pullRequests, issues) {
  const releases = new Map()
  for (const item of [...pullRequests, ...issues]) {
    for (const assignment of item.releases) {
      if (!releases.has(assignment.name) && isVersionName(assignment.name)) {
        const label = item.labels.find((candidate) => candidate.name === assignment.name)
        releases.set(assignment.name, { name: assignment.name, color: label?.color || '14b8a6', sources: [assignment.source] })
      }
    }
  }
  return [...releases.values()].map((release) => {
    const scopedPullRequests = pullRequests.filter((item) => item.releases.some((assignment) => assignment.name === release.name))
    const scopedIssues = issues.filter((item) => item.releases.some((assignment) => assignment.name === release.name))
    return {
      ...release,
      pullRequests: {
        total: scopedPullRequests.length,
        open: scopedPullRequests.filter((item) => item.state === 'open').length,
        merged: scopedPullRequests.filter((item) => item.state === 'merged').length,
        closed: scopedPullRequests.filter((item) => item.state === 'closed').length,
      },
      issues: {
        total: scopedIssues.length,
        open: scopedIssues.filter((item) => item.state === 'open').length,
        closed: scopedIssues.filter((item) => item.state === 'closed').length,
      },
    }
  })
}

export async function collectPublicPreview(project, roadmaps = {}) {
  const [owner, repository] = project.repository.split('/')
  const root = `https://github.com/${owner}/${repository}`
  const [openPullPage, closedPullPage, openIssuePage, closedIssuePage] = await Promise.all([
    page(`${root}/pulls?q=is%3Apr+is%3Aopen`),
    page(`${root}/pulls?q=is%3Apr+is%3Aclosed`),
    page(`${root}/issues?q=is%3Aissue+is%3Aopen`),
    page(`${root}/issues?q=is%3Aissue+is%3Aclosed`),
  ])
  const pullRequests = [
    ...compactPullRequests(openPullPage, owner, repository),
    ...compactPullRequests(closedPullPage, owner, repository),
  ]
  const issues = [
    ...issueNodes(openIssuePage),
    ...issueNodes(closedIssuePage),
  ].map((node) => compactIssue(node, owner, repository))

  return {
    ...project,
    repositoryUrl: root,
    homepage: null,
    language: 'Java',
    stars: 0,
    lastPushedAt: new Date().toISOString(),
    releaseConvention: 'Version labels, then version milestones, then release/* branches',
    releases: releaseList(pullRequests, issues),
    pullRequests,
    issues,
    roadmap: roadmaps[project.slug] ?? {},
    previewData: true,
  }
}
