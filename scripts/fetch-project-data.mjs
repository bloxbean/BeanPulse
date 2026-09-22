import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  ciSummary,
  compareReleaseNames,
  itemArea,
  itemPriority,
  itemType,
  plainSummary,
  releaseAssignments,
  reviewSummary,
  roadmapClaims,
} from './release-data-utils.mjs'
import { collectPublicPreview } from './public-github-preview.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(path.join(root, 'config/projects.json'), 'utf8'))
const roadmaps = JSON.parse(await readFile(path.join(root, 'config/roadmaps.json'), 'utf8'))
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const apiRoot = process.env.GITHUB_API_URL || 'https://api.github.com'
const detailLimit = Number(process.env.PR_DETAIL_LIMIT || (token ? 100 : 8))
const discovery = config.discovery ?? {}
const areaAliases = new Map(Object.entries(config.areaAliases ?? {}).map(([label, area]) => [label.toLowerCase(), area]))

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'bean-pulse-dashboard',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
}

async function github(endpoint) {
  const response = await fetch(`${apiRoot}${endpoint}`, { headers })
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining')
    throw new Error(`GitHub API ${response.status} for ${endpoint}${remaining === '0' ? ' (rate limit reached)' : ''}`)
  }
  return response.json()
}

async function paginate(endpoint, maxPages = 20) {
  const items = []
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = endpoint.includes('?') ? '&' : '?'
    const batch = await github(`${endpoint}${separator}per_page=100&page=${page}`)
    items.push(...batch)
    if (batch.length < 100) break
  }
  return items
}

function color(value, fallback = '7b8ba7') {
  return /^[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback
}

async function collectProject(project) {
  const [owner, repository] = project.repository.split('/')
  console.log(`Collecting ${project.repository}…`)

  const [repositoryInfo, milestones, pullRequests, repositoryItems] = await Promise.all([
    github(`/repos/${owner}/${repository}`),
    paginate(`/repos/${owner}/${repository}/milestones?state=all`),
    paginate(`/repos/${owner}/${repository}/pulls?state=all&sort=updated&direction=desc`),
    paginate(`/repos/${owner}/${repository}/issues?state=all&sort=updated&direction=desc`, 10),
  ])

  const issues = repositoryItems.filter((item) => !item.pull_request)
  const pullAssignments = new Map(pullRequests.map((pullRequest) => [pullRequest.number, releaseAssignments(pullRequest)]))
  const issueAssignments = new Map(issues.map((issue) => [issue.number, releaseAssignments(issue)]))

  const projectRoadmap = roadmaps[project.slug] ?? {}
  const claims = roadmapClaims(projectRoadmap)
  const claim = (assignments, number, release) => {
    const existing = assignments.get(number)
    if (existing && !existing.some((assignment) => assignment.name === release)) existing.push({ name: release, source: 'roadmap' })
  }
  for (const { release, pullRequests: claimedPulls, issues: claimedIssues } of claims) {
    for (const number of claimedPulls) claim(pullAssignments, number, release)
    for (const number of claimedIssues) claim(issueAssignments, number, release)
  }
  const details = new Map()

  const detailTargets = pullRequests
    .filter((pullRequest) => pullRequest.state === 'open' || pullAssignments.get(pullRequest.number).length > 0)
    .sort((left, right) => {
      const assignedDifference = Number(pullAssignments.get(right.number).length > 0) - Number(pullAssignments.get(left.number).length > 0)
      return assignedDifference || new Date(right.updated_at) - new Date(left.updated_at)
    })
    .slice(0, detailLimit)

  for (let index = 0; index < detailTargets.length; index += 4) {
    const batch = detailTargets.slice(index, index + 4)
    const enriched = await Promise.all(batch.map(async (pullRequest) => {
      try {
        const [reviews, checks] = await Promise.all([
          github(`/repos/${owner}/${repository}/pulls/${pullRequest.number}/reviews?per_page=100`),
          github(`/repos/${owner}/${repository}/commits/${pullRequest.head.sha}/check-runs?per_page=100`),
        ])
        return {
          review: reviewSummary(reviews, (pullRequest.requested_reviewers ?? []).map((reviewer) => reviewer.login)),
          ci: ciSummary(checks.check_runs ?? []),
          available: true,
        }
      } catch (error) {
        console.warn(`Details unavailable for ${project.repository}#${pullRequest.number}: ${error.message}`)
        return { review: reviewSummary([], []), ci: ciSummary([]), available: false }
      }
    }))
    batch.forEach((pullRequest, batchIndex) => details.set(pullRequest.number, enriched[batchIndex]))
  }

  const compactPullRequests = pullRequests.map((pullRequest) => {
    const detail = details.get(pullRequest.number) ?? {
      review: reviewSummary([], (pullRequest.requested_reviewers ?? []).map((reviewer) => reviewer.login)),
      ci: ciSummary([]),
      available: false,
    }
    return {
      number: pullRequest.number,
      title: pullRequest.title,
      summary: plainSummary(pullRequest.body),
      url: pullRequest.html_url,
      state: pullRequest.merged_at ? 'merged' : pullRequest.state,
      draft: pullRequest.draft,
      author: { login: pullRequest.user?.login ?? 'ghost', avatarUrl: pullRequest.user?.avatar_url ?? '', url: pullRequest.user?.html_url ?? '' },
      labels: (pullRequest.labels ?? []).map((label) => ({ name: label.name, color: color(label.color) })),
      milestone: pullRequest.milestone?.title ?? null,
      baseBranch: pullRequest.base?.ref ?? '',
      type: itemType(pullRequest),
      area: itemArea(pullRequest, areaAliases),
      priority: itemPriority(pullRequest),
      releases: pullAssignments.get(pullRequest.number),
      review: detail.review,
      ci: detail.ci,
      detailsAvailable: detail.available,
      createdAt: pullRequest.created_at,
      updatedAt: pullRequest.updated_at,
      closedAt: pullRequest.closed_at,
      mergedAt: pullRequest.merged_at,
    }
  })

  const compactIssues = issues.map((issue) => ({
    number: issue.number,
    title: issue.title,
    summary: plainSummary(issue.body),
    url: issue.html_url,
    state: issue.state,
    author: { login: issue.user?.login ?? 'ghost', avatarUrl: issue.user?.avatar_url ?? '', url: issue.user?.html_url ?? '' },
    labels: (issue.labels ?? []).map((label) => ({ name: typeof label === 'string' ? label : label.name, color: typeof label === 'string' ? '7b8ba7' : color(label.color) })),
    milestone: issue.milestone?.title ?? null,
    type: itemType(issue),
    area: itemArea(issue, areaAliases),
    priority: itemPriority(issue),
    releases: issueAssignments.get(issue.number),
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
  }))

  const releasesByName = new Map()
  for (const milestone of milestones) {
    const name = String(milestone.title ?? '').trim()
    if (!name) continue
    releasesByName.set(name, {
      name,
      color: milestone.state === 'closed' ? '8b5cf6' : '14b8a6',
      sources: ['milestone'],
      state: milestone.state,
      dueOn: milestone.due_on ?? null,
      url: milestone.html_url ?? null,
    })
  }
  for (const { release: name } of claims) {
    if (releasesByName.has(name)) continue
    console.warn(`${project.repository}: curated roadmap "${name}" has no milestone. Keeping the release from the roadmap; create the milestone to restore automatic membership.`)
    releasesByName.set(name, { name, color: '14b8a6', sources: ['roadmap'], state: 'open', dueOn: null, url: null })
  }
  for (const assignments of [...pullAssignments.values(), ...issueAssignments.values()]) {
    for (const assignment of assignments) {
      const existing = releasesByName.get(assignment.name)
      if (!existing) releasesByName.set(assignment.name, { name: assignment.name, color: '14b8a6', sources: [assignment.source], state: 'open', dueOn: null, url: null })
      else if (!existing.sources.includes(assignment.source)) existing.sources.push(assignment.source)
    }
  }

  const releases = [...releasesByName.values()]
    .sort((left, right) => compareReleaseNames(left.name, right.name))
    .map((release) => {
      const scopedPullRequests = compactPullRequests.filter((pullRequest) => pullRequest.releases.some((assignment) => assignment.name === release.name))
      const scopedIssues = compactIssues.filter((issue) => issue.releases.some((assignment) => assignment.name === release.name))
      return {
        ...release,
        pullRequests: {
          total: scopedPullRequests.length,
          open: scopedPullRequests.filter((pullRequest) => pullRequest.state === 'open').length,
          merged: scopedPullRequests.filter((pullRequest) => pullRequest.state === 'merged').length,
          closed: scopedPullRequests.filter((pullRequest) => pullRequest.state === 'closed').length,
        },
        issues: {
          total: scopedIssues.length,
          open: scopedIssues.filter((issue) => issue.state === 'open').length,
          closed: scopedIssues.filter((issue) => issue.state === 'closed').length,
        },
      }
    })

  return {
    ...project,
    repositoryUrl: repositoryInfo.html_url,
    homepage: repositoryInfo.homepage,
    language: repositoryInfo.language,
    stars: repositoryInfo.stargazers_count,
    lastPushedAt: repositoryInfo.pushed_at,
    releaseConvention: 'Milestones. Labels carry area:, type: and priority: instead.',
    releases,
    pullRequests: compactPullRequests,
    issues: compactIssues,
    roadmap: roadmaps[project.slug] ?? {},
  }
}

function configuredCatalog() {
  return config.projects.map((project) => ({
    repository: project.repository,
    name: project.name,
    description: project.description,
    url: `https://github.com/${project.repository}`,
    language: null,
    stars: 0,
    archived: false,
    fork: false,
    createdAt: null,
    updatedAt: null,
    pushedAt: null,
    watched: true,
    watchedSlug: project.slug,
    isNew: false,
  }))
}

async function collectCatalog() {
  const repositories = await paginate(`/orgs/${config.organization}/repos?type=public&sort=created&direction=desc`)
  const watched = new Map(config.projects.map((project) => [project.repository.toLowerCase(), project]))
  const excluded = new Set((discovery.excludeRepositories ?? []).map((repository) => repository.toLowerCase()))
  const newWindow = Number(discovery.newRepositoryWindowDays ?? 30) * 86_400_000
  const now = Date.now()

  return repositories
    .filter((repository) => !excluded.has(repository.full_name.toLowerCase()))
    .map((repository) => {
      const project = watched.get(repository.full_name.toLowerCase())
      return {
        repository: repository.full_name,
        name: project?.name ?? repository.name,
        description: project?.description ?? repository.description ?? 'No repository description provided.',
        url: repository.html_url,
        language: repository.language,
        stars: repository.stargazers_count,
        archived: repository.archived,
        fork: repository.fork,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
        pushedAt: repository.pushed_at,
        watched: Boolean(project),
        watchedSlug: project?.slug ?? null,
        isNew: Boolean(repository.created_at) && now - new Date(repository.created_at).getTime() <= newWindow,
      }
    })
}

let cachedProjects = new Map()
let cachedCatalog = []
try {
  const cached = JSON.parse(await readFile(path.join(root, 'data/projects.json'), 'utf8'))
  cachedProjects = new Map((cached.projects ?? []).map((project) => [project.repository, project]))
  cachedCatalog = cached.catalog ?? []
} catch {
  // A cache is optional on the first run.
}

let catalog
try {
  console.log(`Discovering public repositories for ${config.organization}…`)
  catalog = await collectCatalog()
} catch (error) {
  console.warn(`${error.message}. Keeping the existing repository catalog.`)
  catalog = cachedCatalog.length ? cachedCatalog : configuredCatalog()
}

const projects = []
for (const project of config.projects) {
  try {
    projects.push(await collectProject(project))
  } catch (error) {
    const cached = cachedProjects.get(project.repository)
    if (cached) {
      console.warn(`${error.message}. Keeping the existing ${project.name} snapshot.`)
      projects.push({ ...cached, ...project, roadmap: roadmaps[project.slug] ?? {} })
    } else {
      console.warn(`${error.message}. Building a lighter public preview for ${project.name}.`)
      projects.push(await collectPublicPreview(project, roadmaps))
    }
  }
}

const output = {
  organization: config.organization,
  generatedAt: new Date().toISOString(),
  catalog,
  projects,
}

await mkdir(path.join(root, 'data'), { recursive: true })
await writeFile(path.join(root, 'data/projects.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(`Wrote ${projects.length} project${projects.length === 1 ? '' : 's'} to data/projects.json`)
