// A trailing fourth segment is permitted so hotfix versions such as 0.0.12.1 sort correctly.
export const VERSION_PATTERN = /^v?\d+\.\d+\.(?:\d+|x)(?:\.\d+)?(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

export const AREA_PREFIX = 'area:'
export const TYPE_PREFIX = 'type:'
export const PRIORITY_PREFIX = 'priority:'

// Canonical change types. Aliases map onto these so `feature:` and `feat:` are one thing.
export const CHANGE_TYPES = ['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'build', 'ci', 'chore', 'style', 'revert']

const TYPE_ALIASES = new Map([
  ['feature', 'feat'], ['features', 'feat'], ['enhancement', 'feat'],
  ['bug', 'fix'], ['bugfix', 'fix'], ['hotfix', 'fix'],
  ['documentation', 'docs'], ['doc', 'docs'],
  ['tests', 'test'], ['testing', 'test'],
  ['performance', 'perf'],
  ['cleanup', 'chore'], ['deps', 'chore'], ['dependencies', 'chore'],
])

const TYPE_LABELS = new Map([
  ['feat', 'Feature'], ['fix', 'Fix'], ['docs', 'Documentation'], ['test', 'Test'],
  ['refactor', 'Refactor'], ['perf', 'Performance'], ['build', 'Build'], ['ci', 'CI'],
  ['chore', 'Chore'], ['style', 'Style'], ['revert', 'Revert'],
])

export function isVersionName(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value.trim())
}

export function typeLabel(type) {
  return TYPE_LABELS.get(type) ?? null
}

function labelNames(item) {
  return (item.labels ?? [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => name.trim())
}

function normalizeType(value) {
  if (!value) return null
  const candidate = String(value).trim().toLowerCase()
  const resolved = TYPE_ALIASES.get(candidate) ?? candidate
  return CHANGE_TYPES.includes(resolved) ? resolved : null
}

function prefixedLabel(item, prefix) {
  const match = labelNames(item).find((name) => name.toLowerCase().startsWith(prefix))
  return match ? match.slice(prefix.length).trim() || null : null
}

// A release is a milestone. Version labels and release/* branches are no longer release signals.
export function releaseAssignments(item) {
  const milestone = typeof item.milestone === 'string' ? item.milestone : item.milestone?.title
  const name = typeof milestone === 'string' ? milestone.trim() : ''
  return name ? [{ name, source: 'milestone' }] : []
}

// A curated roadmap is itself a release assignment: it names the work belonging to a
// release, so the release survives even when no milestone exists for it yet.
export function roadmapClaims(projectRoadmap = {}) {
  return Object.entries(projectRoadmap).map(([release, entry]) => ({
    release: String(release).trim(),
    pullRequests: [...new Set((entry?.outcomes ?? []).flatMap((outcome) => outcome?.pullRequests ?? []))],
    issues: [...new Set((entry?.outcomes ?? []).flatMap((outcome) => outcome?.issues ?? []))],
  })).filter((claim) => claim.release)
}

// Type comes from a conventional-commit title prefix, and falls back to a `type:` label.
export function itemType(item) {
  const prefix = String(item.title ?? '').match(/^\s*([A-Za-z]+)(?:\([^)]*\))?!?:\s/)?.[1]
  return normalizeType(prefix) ?? normalizeType(prefixedLabel(item, TYPE_PREFIX))
}

// Functional area, e.g. `area:bf-api` -> "bf-api". An `area:` label always wins; the alias
// map lets existing labels stand in as areas until repositories are renamed.
export function itemArea(item, aliases) {
  const prefixed = prefixedLabel(item, AREA_PREFIX)
  if (prefixed) return prefixed
  if (!aliases) return null
  for (const name of labelNames(item)) {
    const alias = aliases.get(name.toLowerCase())
    if (alias) return alias
  }
  return null
}

export function itemPriority(item) {
  return prefixedLabel(item, PRIORITY_PREFIX)
}

function versionParts(version) {
  const [core, prerelease = ''] = version.replace(/^v/, '').split('-', 2)
  const [major = '0', minor = '0', patch = '0', build = '0'] = core.split('.')
  return {
    major: Number(major),
    minor: Number(minor),
    patch: patch === 'x' ? Number.POSITIVE_INFINITY : Number(patch),
    build: Number(build) || 0,
    prerelease,
  }
}

// Milestones that are not versions still deserve a place; they sort after the versioned ones.
export function compareReleaseNames(left, right) {
  const leftVersion = isVersionName(left)
  const rightVersion = isVersionName(right)
  if (leftVersion && rightVersion) return compareVersionsDescending(left, right)
  if (leftVersion !== rightVersion) return leftVersion ? -1 : 1
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

export function compareVersionsDescending(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  for (const key of ['major', 'minor', 'patch', 'build']) {
    if (a[key] !== b[key]) return b[key] - a[key]
  }
  if (!a.prerelease && b.prerelease) return -1
  if (a.prerelease && !b.prerelease) return 1
  return b.prerelease.localeCompare(a.prerelease, undefined, { numeric: true })
}

export function reviewSummary(reviews = [], requestedReviewers = []) {
  const latestByReviewer = new Map()
  for (const review of reviews) {
    if (review?.user?.login && review?.state) latestByReviewer.set(review.user.login, review.state.toUpperCase())
  }
  const states = [...latestByReviewer.values()]
  let status = 'not-requested'
  if (states.includes('CHANGES_REQUESTED')) status = 'changes-requested'
  else if (states.includes('APPROVED')) status = 'approved'
  else if (requestedReviewers.length > 0) status = 'requested'
  else if (states.length > 0) status = 'commented'
  return { status, approvals: states.filter((state) => state === 'APPROVED').length, requested: requestedReviewers }
}

export function ciSummary(checkRuns = []) {
  if (checkRuns.length === 0) return { status: 'not-available', total: 0 }
  const pending = checkRuns.some((check) => check.status !== 'completed')
  const failedStates = new Set(['action_required', 'cancelled', 'failure', 'startup_failure', 'timed_out'])
  const failed = checkRuns.some((check) => failedStates.has(check.conclusion))
  return { status: pending ? 'pending' : failed ? 'failure' : 'success', total: checkRuns.length }
}

export function plainSummary(markdown = '', limit = 240) {
  const paragraphs = String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((paragraph) => paragraph.length > 35 && !/^(summary|description|test plan|checklist)$/i.test(paragraph))
  const summary = paragraphs[0] ?? ''
  return summary.length > limit ? `${summary.slice(0, limit - 1).trim()}…` : summary
}
