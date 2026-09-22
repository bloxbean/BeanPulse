const app = document.querySelector('#app')

const icons = {
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  back: '<path d="m15 18-6-6 6-6"/><path d="M19 12H9"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 7h4a6 6 0 0 1 6 6V9"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/>',
  external: '<path d="M15 4h5v5M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>',
  issue: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 17h.01"/>',
  merge: '<circle cx="7" cy="5" r="2"/><circle cx="17" cy="19" r="2"/><path d="M7 7v10M9 7c5 0 8 2 8 8v2"/>',
  pulse: '<path d="M3 12h4l2.3-6 4.2 12 2.2-6H21"/>',
  pull: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v12M18 17V9a4 4 0 0 0-4-4h-2"/>',
  refresh: '<path d="M20 7v5h-5"/><path d="M4.9 17A8 8 0 0 0 18.6 12M4 12a8 8 0 0 1 13.1-6L20 8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
  spark: '<path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3ZM5 15l.7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7L5 15Z"/>',
}

const icon = (name, size = 18) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${name === 'github' || name === 'spark' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
const formatNumber = (value) => new Intl.NumberFormat('en', { notation: value > 999 ? 'compact' : 'standard' }).format(value)
const longDate = (value) => value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

function relativeDate(value) {
  const delta = new Date(value).getTime() - Date.now()
  const days = Math.round(delta / 86_400_000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (Math.abs(days) < 1) return formatter.format(Math.round(delta / 3_600_000), 'hour')
  if (Math.abs(days) < 30) return formatter.format(days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return formatter.format(months, 'month')
  return formatter.format(Math.round(months / 12), 'year')
}

const query = new URLSearchParams(window.location.search)
const state = {
  project: query.get('project'),
  view: query.get('view') || 'overview',
  release: query.get('release'),
  search: '',
  status: 'all',
  page: 1,
  catalogSearch: '',
  catalogPage: 1,
  selectedRepositories: new Set(),
}

let data

try {
  const response = await fetch(`./data/projects.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Data request returned ${response.status}`)
  data = await response.json()
  render()
} catch (error) {
  app.innerHTML = `<div class="error-state"><span class="bean-mark">B</span><h1>BeanPulse needs a data snapshot</h1><p>${escapeHtml(error.message)}</p><code>npm run data:refresh</code></div>`
}

function updateRoute(next, push = true) {
  Object.assign(state, next, { search: '', status: 'all', page: 1 })
  const parameters = new URLSearchParams()
  if (state.project) parameters.set('project', state.project)
  if (state.project && state.view !== 'overview') parameters.set('view', state.view)
  if (state.release) parameters.set('release', state.release)
  const url = `${window.location.pathname}${parameters.size ? `?${parameters}` : ''}`
  window.history[push ? 'pushState' : 'replaceState']({}, '', url)
  window.scrollTo({ top: 0, behavior: 'smooth' })
  render()
}

function currentProject() {
  return data.projects.find((project) => project.slug === state.project)
}

function projectStats(project) {
  const openPullRequests = project.pullRequests.filter((item) => item.state === 'open').length
  const mergedPullRequests = project.pullRequests.filter((item) => item.state === 'merged').length
  const openIssues = project.issues.filter((item) => item.state === 'open').length
  const releasePullRequests = project.pullRequests.filter((item) => item.releases.length > 0)
  return { openPullRequests, mergedPullRequests, openIssues, releasePullRequests: releasePullRequests.length }
}

function projectReleaseLanes(project) {
  const unassignedPullRequests = project.pullRequests.filter((item) => item.releases.length === 0)
  const unassignedIssues = project.issues.filter((item) => item.releases.length === 0)
  if (!unassignedPullRequests.length && !unassignedIssues.length) return project.releases
  return [
    ...project.releases,
    {
      name: 'Unassigned',
      color: '7b8ba7',
      sources: ['unassigned'],
      pullRequests: {
        total: unassignedPullRequests.length,
        open: unassignedPullRequests.filter((item) => item.state === 'open').length,
        merged: unassignedPullRequests.filter((item) => item.state === 'merged').length,
        closed: unassignedPullRequests.filter((item) => item.state === 'closed').length,
      },
      issues: {
        total: unassignedIssues.length,
        open: unassignedIssues.filter((item) => item.state === 'open').length,
        closed: unassignedIssues.filter((item) => item.state === 'closed').length,
      },
    },
  ]
}

function render() {
  const project = currentProject()
  app.innerHTML = `
    <div class="app-shell">
      ${renderTopbar(project)}
      <main>${project ? renderProject(project) : renderPortfolio()}</main>
      ${renderFooter()}
    </div>`
  bindEvents()
}

function renderTopbar(project) {
  return `
    <header class="topbar">
      <button class="brand" data-home type="button" aria-label="BeanPulse home">
        <span class="bean-mark">B</span>
        <span><strong>BeanPulse</strong><small>Bloxbean delivery intelligence</small></span>
      </button>
      <div class="topbar-actions">
        ${project ? `
          <label class="project-switcher">
            <span>Project</span>
            <select data-project-select>
              ${data.projects.map((item) => `<option value="${escapeHtml(item.slug)}" ${item.slug === project.slug ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
            </select>
          </label>` : ''}
        <span class="sync-state"><i></i> Synced ${relativeDate(data.generatedAt)}</span>
        <button class="icon-button" data-refresh title="Reload local snapshot" type="button">${icon('refresh', 17)}</button>
      </div>
    </header>`
}

function renderPortfolio() {
  const totals = data.projects.reduce((summary, project) => {
    const stats = projectStats(project)
    summary.releases += project.releases.length
    summary.pullRequests += stats.openPullRequests
    summary.issues += stats.openIssues
    return summary
  }, { releases: 0, pullRequests: 0, issues: 0 })

  return `
    <section class="portfolio-hero page-width">
      <div class="hero-copy">
        <span class="eyebrow">${icon('pulse', 16)} Organization pulse</span>
        <h1>Every project.<br><em>One clear pulse.</em></h1>
        <p>Release scope, engineering work, and product outcomes across the Bloxbean ecosystem.</p>
      </div>
      <div class="orbit" aria-hidden="true"><span></span><span></span><span></span><b>B</b></div>
    </section>

    <section class="portfolio-strip">
      <div class="page-width portfolio-metrics">
        <div><span>Tracked projects</span><strong>${data.projects.length}</strong></div>
        <div><span>Release lanes</span><strong>${totals.releases}</strong></div>
        <div><span>Open pull requests</span><strong>${totals.pullRequests}</strong></div>
        <div><span>Open issues</span><strong>${totals.issues}</strong></div>
      </div>
    </section>

    <section class="project-picker page-width">
      <div class="section-heading">
        <div><span class="section-kicker">Watched projects</span><h2>Select a project</h2></div>
        <p>These projects receive full release, pull request, issue, and roadmap tracking.</p>
      </div>
      <div class="project-grid">
        ${data.projects.map(renderProjectCard).join('')}
      </div>
    </section>
    ${renderDiscoveryCatalog()}`
}

function renderDiscoveryCatalog() {
  const catalog = data.catalog ?? []
  const available = catalog.filter((repository) => !repository.watched)
  const normalized = state.catalogSearch.trim().toLowerCase()
  const filtered = available.filter((repository) => [repository.repository, repository.name, repository.description, repository.language].join(' ').toLowerCase().includes(normalized))
  const sorted = filtered.sort((left, right) => Number(right.isNew) - Number(left.isNew) || new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
  const visible = sorted.slice(0, state.catalogPage * 12)
  const newCount = available.filter((repository) => repository.isNew).length
  const selected = [...state.selectedRepositories].filter((repository) => available.some((candidate) => candidate.repository === repository))

  return `
    <section class="discovery page-width">
      <div class="discovery-head">
        <div><span class="section-kicker">Organization discovery</span><h2>Available projects</h2><p>BeanPulse automatically scans public Bloxbean repositories. Select the projects you want to bring into full tracking.</p></div>
        <div class="discovery-summary"><span><strong>${available.length}</strong> available</span><span><strong>${newCount}</strong> newly created</span></div>
      </div>
      <div class="discovery-controls">
        <label class="search">${icon('search', 17)}<input data-catalog-search type="search" value="${escapeHtml(state.catalogSearch)}" placeholder="Search discovered repositories…"></label>
        <span>${filtered.length} repositories</span>
      </div>
      <div class="catalog-grid">
        ${visible.length ? visible.map(renderCatalogCard).join('') : '<div class="empty-state compact"><strong>No matching repositories</strong><span>Try a broader search.</span></div>'}
      </div>
      ${visible.length < filtered.length ? `<button class="load-more catalog-more" data-catalog-more type="button">Show ${Math.min(12, filtered.length - visible.length)} more ${icon('arrow', 14)}</button>` : ''}
      <div class="watch-request ${selected.length ? 'active' : ''}">
        <div><span>${icon('check', 15)}</span><p><strong>${selected.length || 'No'} project${selected.length === 1 ? '' : 's'} selected</strong><small>A tracking request lets maintainers review and add them to the shared watchlist.</small></p></div>
        <button data-watch-request type="button" ${selected.length ? '' : 'disabled'}>Prepare tracking request ${icon('arrow', 15)}</button>
      </div>
    </section>`
}

function renderCatalogCard(repository) {
  const selected = state.selectedRepositories.has(repository.repository)
  const badge = repository.isNew ? '<b class="catalog-badge new">New</b>' : repository.archived ? '<b class="catalog-badge">Archived</b>' : repository.fork ? '<b class="catalog-badge">Fork</b>' : ''
  return `
    <article class="catalog-card ${selected ? 'selected' : ''}">
      <label>
        <input data-catalog-select type="checkbox" value="${escapeHtml(repository.repository)}" ${selected ? 'checked' : ''}>
        <span class="catalog-check">${icon('check', 12)}</span>
        <span class="catalog-glyph">${escapeHtml(repository.name.slice(0, 2).toUpperCase())}</span>
        <span class="catalog-copy"><span>${badge}<small>${escapeHtml(repository.language || 'Repository')}</small></span><strong>${escapeHtml(repository.name)}</strong><em>${escapeHtml(repository.repository)}</em><p>${escapeHtml(repository.description)}</p></span>
      </label>
      <a href="${escapeHtml(repository.url)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(repository.repository)} on GitHub">${icon('external', 14)}</a>
    </article>`
}

function openWatchRequest() {
  const repositories = (data.catalog ?? []).filter((repository) => state.selectedRepositories.has(repository.repository))
  if (!repositories.length) return
  const title = repositories.length === 1 ? `Track ${repositories[0].repository} in BeanPulse` : `Track ${repositories.length} projects in BeanPulse`
  const list = repositories.map((repository) => `- [ ] ${repository.repository}`).join('\n')
  const body = `## Repositories to watch\n\n${list}\n\n## Request\n\nPlease review these discovered repositories for full BeanPulse tracking. Add approved projects to config/projects.json and optionally define curated roadmap outcomes.`
  window.open(`https://github.com/bloxbean/BeanPulse/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer')
}

function renderProjectCard(project) {
  const stats = projectStats(project)
  const newest = project.releases[0] ?? projectReleaseLanes(project).find((release) => release.name === 'Unassigned')
  return `
    <article class="project-card" style="--accent:${escapeHtml(project.accent)}">
      <div class="project-card-head"><span class="project-glyph">${project.name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2)}</span><span class="language">${escapeHtml(project.language || 'Repository')}</span></div>
      <div><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.description)}</p></div>
      <div class="project-release"><span>${newest?.name === 'Unassigned' ? 'Current project work' : 'Latest tracked release'}</span><strong>${escapeHtml(newest?.name || 'No release')}</strong><div class="project-progress"><i style="width:${newest ? releaseProgress(newest) : 0}%"></i></div></div>
      <div class="project-stat-row"><span><strong>${project.releases.length}</strong> releases</span><span><strong>${stats.openPullRequests}</strong> open PRs</span><span><strong>${stats.openIssues}</strong> issues</span></div>
      <button data-project="${escapeHtml(project.slug)}" type="button">Open project ${icon('arrow', 16)}</button>
    </article>`
}

function renderProject(project) {
  return `
    <section class="project-banner">
      <div class="page-width">
        <button class="back-link" data-home type="button">${icon('back', 15)} All projects</button>
        <div class="project-title-row">
          <div><span class="eyebrow">Bloxbean / ${escapeHtml(project.slug)}</span><h1>${escapeHtml(project.name)}</h1><p>${escapeHtml(project.description)}</p></div>
          <a class="repo-link" href="${escapeHtml(project.repositoryUrl)}" target="_blank" rel="noreferrer">${icon('github', 17)} View repository ${icon('external', 14)}</a>
        </div>
        <nav class="project-tabs" aria-label="Project views">
          ${['overview', 'releases', 'pull-requests', 'issues'].map((view) => `<button data-view="${view}" class="${state.view === view ? 'active' : ''}" type="button">${view === 'pull-requests' ? 'Pull requests' : view[0].toUpperCase() + view.slice(1)}</button>`).join('')}
        </nav>
      </div>
    </section>
    <div class="page-width project-content">
      ${state.view === 'overview' ? renderOverview(project) : ''}
      ${state.view === 'releases' ? renderReleases(project) : ''}
      ${state.view === 'pull-requests' ? renderTracker(project, project.pullRequests, 'pr', 'Pull requests', 'Every code change across this project.') : ''}
      ${state.view === 'issues' ? renderTracker(project, project.issues, 'issue', 'Issues', 'Planned work, bugs, and product discussions across this project.') : ''}
    </div>`
}

function renderOverview(project) {
  const stats = projectStats(project)
  const openPullRequests = project.pullRequests.filter((item) => item.state === 'open').slice(0, 5)
  const openIssues = project.issues.filter((item) => item.state === 'open').slice(0, 5)
  return `
    <section class="summary-grid">
      <div class="summary-card featured"><span>Tracked releases</span><strong>${project.releases.length}</strong><small>${icon('pulse', 14)} Version-aware delivery lanes</small></div>
      <div class="summary-card"><span>Open pull requests</span><strong>${stats.openPullRequests}</strong><small>${stats.mergedPullRequests} merged historically</small></div>
      <div class="summary-card"><span>Open issues</span><strong>${stats.openIssues}</strong><small>${project.issues.length} total issues collected</small></div>
      <div class="summary-card"><span>Stars</span><strong>${formatNumber(project.stars)}</strong><small>Updated ${relativeDate(project.lastPushedAt)}</small></div>
    </section>
    ${renderReleaseDirectory(project, 6)}
    <section class="activity-grid">
      ${renderActivityPanel('Open pull requests', 'Code in motion', openPullRequests, 'pr', 'pull-requests')}
      ${renderActivityPanel('Open issues', 'Work to shape', openIssues, 'issue', 'issues')}
    </section>`
}

function renderActivityPanel(title, kicker, items, kind, targetView) {
  return `
    <article class="activity-panel">
      <div class="panel-heading"><div><span>${escapeHtml(kicker)}</span><h3>${escapeHtml(title)}</h3></div><button data-view="${targetView}" type="button">View all ${icon('arrow', 14)}</button></div>
      <div class="activity-list">
        ${items.length ? items.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><span class="activity-icon" data-kind="${kind}">${icon(kind === 'pr' ? 'pull' : 'issue', 14)}</span><span><strong>${escapeHtml(item.title)}</strong><small>#${item.number} · ${escapeHtml(item.author.login)} · ${relativeDate(item.updatedAt)}</small></span></a>`).join('') : '<div class="mini-empty">Nothing open right now.</div>'}
      </div>
    </article>`
}

function renderReleaseDirectory(project, limit) {
  const lanes = projectReleaseLanes(project)
  const releases = limit ? lanes.slice(0, limit) : lanes
  return `
    <section class="release-directory">
      <div class="section-heading"><div><span class="section-kicker">Release directory</span><h2>${state.view === 'overview' ? 'Delivery lanes' : 'Choose a release'}</h2></div><p>PRs and issues grouped by milestone.</p></div>
      <div class="release-grid">
        ${releases.map((release) => renderReleaseCard(project, release)).join('')}
      </div>
      ${limit && lanes.length > limit ? `<button class="text-button" data-view="releases" type="button">View all ${lanes.length} lanes ${icon('arrow', 14)}</button>` : ''}
    </section>`
}

function releaseProgress(release) {
  const total = release.pullRequests.total + release.issues.total
  const completed = release.pullRequests.merged + release.pullRequests.closed + release.issues.closed
  return total ? Math.round((completed / total) * 100) : 0
}

function renderReleaseCard(project, release) {
  const progress = releaseProgress(release)
  return `
    <button class="release-card ${state.release === release.name ? 'active' : ''}" data-release="${escapeHtml(release.name)}" type="button">
      <span class="release-card-top"><i style="background:#${escapeHtml(release.color)}"></i><strong>${escapeHtml(release.name)}</strong>${icon('arrow', 15)}</span>
      <span class="release-counts"><b>${progress}%</b><small>${release.pullRequests.open} PRs · ${release.issues.open} issues open</small></span>
      <span class="progress"><i style="width:${progress}%;background:#${escapeHtml(release.color)}"></i></span>
    </button>`
}

function renderReleases(project) {
  const release = projectReleaseLanes(project).find((item) => item.name === state.release)
  if (!release) return renderReleaseDirectory(project)

  const isUnassigned = release.name === 'Unassigned'
  const pullRequests = project.pullRequests.filter((item) => isUnassigned ? item.releases.length === 0 : item.releases.some((assignment) => assignment.name === release.name))
  const issues = project.issues.filter((item) => isUnassigned ? item.releases.length === 0 : item.releases.some((assignment) => assignment.name === release.name))
  return `
    <button class="back-link content-back" data-release-back type="button">${icon('back', 15)} All releases</button>
    <section class="release-detail-head">
      <div><span class="eyebrow">Release scope</span><h2>${escapeHtml(release.name)}</h2><p>${release.pullRequests.total} pull requests and ${release.issues.total} issues are associated with this release.</p></div>
      <div class="release-detail-metrics"><span><strong>${release.pullRequests.open}</strong> open PRs</span><span><strong>${release.issues.open}</strong> open issues</span><span><strong>${releaseProgress(release)}%</strong> resolved</span></div>
    </section>
    ${renderRoadmap(project, release, pullRequests, issues)}
    ${renderTracker(project, pullRequests, 'pr', 'Release pull requests', `Implementation work associated with ${release.name}.`, true)}
    ${renderTracker(project, issues, 'issue', 'Release issues', `Planned work and decisions associated with ${release.name}.`, true)}`
}

function renderRoadmap(project, release, pullRequests, issues) {
  const configured = project.roadmap?.[release.name]
  let outcomes
  let goal
  let curated = false

  if (configured) {
    curated = true
    goal = configured.goal
    outcomes = configured.outcomes.map((outcome) => {
      const linkedPullRequests = outcome.pullRequests.map((number) => pullRequests.find((item) => item.number === number)).filter(Boolean)
      const linkedIssues = outcome.issues.map((number) => issues.find((item) => item.number === number)).filter(Boolean)
      return { ...outcome, pullRequests: linkedPullRequests, issues: linkedIssues, status: outcomeStatus(linkedPullRequests, linkedIssues) }
    })
  } else {
    goal = 'An inferred product view of the release, grouped by area: labels and change types. Add curated outcomes when product context is available.'
    outcomes = inferredOutcomes(pullRequests, issues)
  }

  const planned = outcomes.filter((outcome) => outcome.status === 'planned').length
  const active = outcomes.filter((outcome) => outcome.status === 'in-progress').length
  const shipped = outcomes.filter((outcome) => ['shipped', 'done'].includes(outcome.status)).length

  return `
    <section class="roadmap">
      <div class="roadmap-head">
        <div><span class="section-kicker">${curated ? 'Curated product outcomes' : 'Inferred product areas'}</span><h2>What’s shipping</h2><p>${escapeHtml(goal)}</p></div>
        <div class="roadmap-totals"><span><strong>${planned}</strong> planned</span><span><strong>${active}</strong> active</span><span><strong>${shipped}</strong> shipped</span></div>
      </div>
      <div class="outcome-grid">
        ${outcomes.length ? outcomes.map((outcome, index) => renderOutcome(outcome, index, curated)).join('') : '<div class="empty-state compact"><strong>No roadmap outcomes yet</strong><span>Assign a milestone to an issue or pull request.</span></div>'}
      </div>
    </section>`
}

function outcomeStatus(pullRequests, issues) {
  if (pullRequests.some((item) => item.state === 'open')) return 'in-progress'
  if (issues.some((item) => item.state === 'open')) return 'planned'
  if (pullRequests.length && pullRequests.every((item) => item.state === 'merged')) return 'shipped'
  if (pullRequests.some((item) => item.state === 'closed')) return 'closed'
  return issues.length ? 'done' : 'planned'
}

function titleCase(value) {
  return value.split(/[-_\s]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

function inferredOutcomes(pullRequests, issues) {
  const themes = new Map()
  for (const item of [...pullRequests, ...issues]) {
    // area: labels are authoritative; a conventional-commit scope is the fallback.
    const scope = item.title.match(/^[a-z]+\(([^)]+)\)\s*:/i)?.[1]
    const theme = item.area ? titleCase(item.area) : (scope ? titleCase(scope) : 'Platform & general')
    const entry = { ...item, kind: 'ci' in item ? 'PR' : 'Issue' }
    themes.set(theme, [...(themes.get(theme) || []), entry])
  }
  return [...themes.entries()].map(([title, items]) => {
    const linkedPullRequests = items.filter((item) => item.kind === 'PR')
    const linkedIssues = items.filter((item) => item.kind === 'Issue')
    const features = items.filter((item) => item.type === 'feat').length
    const fixes = items.filter((item) => item.type === 'fix').length
    const changes = Math.max(0, items.length - features - fixes)
    const parts = [[features, 'feature'], [fixes, 'fix'], [changes, 'supporting change']].filter(([count]) => count).map(([count, label]) => `${count} ${label}${count === 1 ? '' : 's'}`)
    return {
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title,
      description: `Scope includes ${parts.join(', ')} across this product area.`,
      pullRequests: linkedPullRequests, issues: linkedIssues,
      status: outcomeStatus(linkedPullRequests, linkedIssues),
    }
  })
}

function renderOutcome(outcome, index, curated) {
  const references = [
    ...outcome.pullRequests.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${icon('pull', 12)} PR #${item.number}</a>`),
    ...outcome.issues.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${icon('issue', 12)} Issue #${item.number}</a>`),
  ]
  return `
    <article class="outcome-card">
      <div class="outcome-top"><span>${curated ? 'OUTCOME' : 'AREA'} ${String(index + 1).padStart(2, '0')}</span><b data-status="${outcome.status}">${statusText(outcome.status)}</b></div>
      <h3>${escapeHtml(outcome.title)}</h3>
      <p>${escapeHtml(outcome.description)}</p>
      <div class="references"><span>Implementation</span>${references.join('')}</div>
    </article>`
}

function statusText(status) {
  return ({ planned: 'Planned', 'in-progress': 'In progress', shipped: 'Shipped', done: 'Done', closed: 'Closed' })[status] || status
}

function renderTracker(project, sourceItems, kind, title, description, embedded = false) {
  const normalized = state.search.trim().toLowerCase()
  const filtered = sourceItems.filter((item) => {
    const haystack = [item.title, item.summary, item.number, item.author.login, item.milestone, ...item.labels.map((label) => label.name)].join(' ').toLowerCase()
    return (!normalized || haystack.includes(normalized)) && (state.status === 'all' || item.state === state.status)
  })
  const visible = filtered.slice(0, state.page * 20)
  const statusOptions = kind === 'pr' ? [['all', 'All statuses'], ['open', 'Open'], ['merged', 'Merged'], ['closed', 'Closed']] : [['all', 'All statuses'], ['open', 'Open'], ['closed', 'Closed']]
  return `
    <section class="tracker ${embedded ? 'embedded' : ''}">
      <div class="section-heading tracker-heading"><div><span class="section-kicker">${kind === 'pr' ? 'Engineering flow' : 'Product backlog'}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><span class="result-total">${filtered.length} results</span></div>
      <div class="filters">
        <label class="search">${icon('search', 17)}<input data-search type="search" value="${escapeHtml(state.search)}" placeholder="Search title, number, author, or label…"></label>
        <select data-status>${statusOptions.map(([value, label]) => `<option value="${value}" ${state.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </div>
      <div class="item-list">${visible.length ? visible.map((item) => renderWorkItem(item, kind)).join('') : '<div class="empty-state"><strong>No matching work</strong><span>Try a broader search or clear the status filter.</span></div>'}</div>
      ${visible.length < filtered.length ? `<button class="load-more" data-load-more type="button">Show ${Math.min(20, filtered.length - visible.length)} more ${icon('arrow', 14)}</button>` : ''}
    </section>`
}

function renderWorkItem(item, kind) {
  const statusIcon = kind === 'issue' ? 'issue' : item.state === 'merged' ? 'merge' : item.state === 'open' ? 'pull' : 'close'
  const statusLabel = item.state === 'merged' ? 'Merged' : item.state === 'open' ? 'Open' : 'Closed'
  return `
    <article class="work-item" data-state="${item.state}">
      <span class="work-rail"></span>
      <div class="work-main">
        <div class="work-kicker"><span class="status-badge" data-status="${item.state}">${icon(statusIcon, 13)} ${statusLabel}</span>${item.draft ? '<span class="draft">Draft</span>' : ''}<code>#${item.number}</code></div>
        <a class="work-title" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)} ${icon('external', 13)}</a>
        ${item.summary ? `<p class="work-summary">${escapeHtml(item.summary)}</p>` : ''}
        <div class="labels">${item.labels.slice(0, 5).map((label) => `<span style="--label:#${escapeHtml(label.color)}">${escapeHtml(label.name)}</span>`).join('')}</div>
        <div class="work-meta"><a href="${escapeHtml(item.author.url)}" target="_blank" rel="noreferrer">${item.author.avatarUrl ? `<img src="${escapeHtml(item.author.avatarUrl)}" alt="">` : ''}${escapeHtml(item.author.login)}</a><span title="${longDate(item.createdAt)}">Created ${relativeDate(item.createdAt)}</span><span title="${longDate(item.updatedAt)}">Updated ${relativeDate(item.updatedAt)}</span>${item.milestone ? `<span>${icon('spark', 12)} ${escapeHtml(item.milestone)}</span>` : ''}</div>
      </div>
      ${kind === 'pr' ? `<div class="signals"><span data-signal="${item.review.status}"><i></i><small>Review</small><strong>${reviewText(item)}</strong></span><span data-signal="${item.ci.status}"><i></i><small>CI status</small><strong>${ciText(item)}</strong></span></div>` : `<div class="issue-side"><span>${item.releases.length ? 'Release scoped' : 'Backlog'}</span><strong>${item.releases.map((release) => escapeHtml(release.name)).join(', ') || 'Unassigned'}</strong></div>`}
    </article>`
}

function reviewText(item) {
  return ({ approved: item.review.approvals > 1 ? `${item.review.approvals} approvals` : 'Approved', 'changes-requested': 'Changes requested', requested: 'Review requested', commented: 'Reviewed', 'not-requested': item.detailsAvailable ? 'No review' : 'Unavailable' })[item.review.status]
}

function ciText(item) {
  return ({ success: 'Checks passing', failure: 'Checks failing', pending: 'Checks running', 'not-available': 'Unavailable' })[item.ci.status]
}

function renderFooter() {
  return `<footer class="footer page-width"><span><b>BeanPulse</b> · Bloxbean delivery intelligence</span><span>Data from GitHub · Snapshot ${longDate(data.generatedAt)}</span><a href="https://github.com/bloxbean/BeanPulse" target="_blank" rel="noreferrer">Source ${icon('external', 12)}</a></footer>`
}

function bindEvents() {
  document.querySelectorAll('[data-home]').forEach((button) => button.addEventListener('click', () => updateRoute({ project: null, view: 'overview', release: null })))
  document.querySelectorAll('[data-project]').forEach((button) => button.addEventListener('click', () => updateRoute({ project: button.dataset.project, view: 'overview', release: null })))
  document.querySelector('[data-project-select]')?.addEventListener('change', (event) => updateRoute({ project: event.target.value, view: 'overview', release: null }))
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => updateRoute({ view: button.dataset.view, release: null })))
  document.querySelectorAll('[data-release]').forEach((button) => button.addEventListener('click', () => updateRoute({ view: 'releases', release: button.dataset.release })))
  document.querySelector('[data-release-back]')?.addEventListener('click', () => updateRoute({ view: 'releases', release: null }))
  document.querySelector('[data-refresh]')?.addEventListener('click', async (event) => {
    event.currentTarget.classList.add('spinning')
    try {
      const response = await fetch(`./data/projects.json?t=${Date.now()}`, { cache: 'no-store' })
      if (response.ok) data = await response.json()
    } finally {
      render()
    }
  })
  let searchTimer
  document.querySelectorAll('[data-search]').forEach((input, index) => input.addEventListener('input', (event) => {
      const value = event.target.value
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        state.search = value
        state.page = 1
        render()
        const search = document.querySelectorAll('[data-search]')[index]
        search?.focus()
        search?.setSelectionRange(value.length, value.length)
      }, 120)
    }))
  document.querySelectorAll('[data-status]').forEach((select) => select.addEventListener('change', (event) => { state.status = event.target.value; state.page = 1; render() }))
  document.querySelectorAll('[data-load-more]').forEach((button) => button.addEventListener('click', () => { state.page += 1; render() }))
  document.querySelector('[data-catalog-search]')?.addEventListener('input', (event) => {
    const value = event.target.value
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      state.catalogSearch = value
      state.catalogPage = 1
      render()
      const search = document.querySelector('[data-catalog-search]')
      search?.focus()
      search?.setSelectionRange(value.length, value.length)
    }, 120)
  })
  document.querySelectorAll('[data-catalog-select]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
    if (event.target.checked) state.selectedRepositories.add(event.target.value)
    else state.selectedRepositories.delete(event.target.value)
    render()
  }))
  document.querySelector('[data-catalog-more]')?.addEventListener('click', () => { state.catalogPage += 1; render() })
  document.querySelector('[data-watch-request]')?.addEventListener('click', openWatchRequest)
}

window.addEventListener('popstate', () => {
  const parameters = new URLSearchParams(window.location.search)
  state.project = parameters.get('project')
  state.view = parameters.get('view') || 'overview'
  state.release = parameters.get('release')
  state.search = ''
  state.status = 'all'
  state.page = 1
  render()
})
