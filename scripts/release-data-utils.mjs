export const VERSION_PATTERN = /^v?\d+\.\d+\.(?:\d+|x)(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

export function isVersionName(value) {
  return typeof value === 'string' && VERSION_PATTERN.test(value.trim())
}

export function releaseAssignments(item) {
  const assignments = []

  for (const label of item.labels ?? []) {
    const name = typeof label === 'string' ? label : label?.name
    if (isVersionName(name)) assignments.push({ name: name.trim(), source: 'label' })
  }

  const milestone = typeof item.milestone === 'string' ? item.milestone : item.milestone?.title
  if (isVersionName(milestone)) assignments.push({ name: milestone.trim(), source: 'milestone' })

  const baseBranch = item.base?.ref ?? item.baseBranch ?? ''
  const releaseBranch = baseBranch.match(/^release\/(.+)$/)?.[1]
  if (isVersionName(releaseBranch)) assignments.push({ name: releaseBranch.trim(), source: 'branch' })

  return assignments.filter((assignment, index, all) => (
    all.findIndex((candidate) => candidate.name === assignment.name) === index
  ))
}

function versionParts(version) {
  const [core, prerelease = ''] = version.replace(/^v/, '').split('-', 2)
  const [major = '0', minor = '0', patch = '0'] = core.split('.')
  return {
    major: Number(major),
    minor: Number(minor),
    patch: patch === 'x' ? Number.POSITIVE_INFINITY : Number(patch),
    prerelease,
  }
}

export function compareVersionsDescending(left, right) {
  const a = versionParts(left)
  const b = versionParts(right)
  for (const key of ['major', 'minor', 'patch']) {
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
