// Release train: which tracked project pins which version of which, read from Gradle build files.
// Pure functions only; scripts/fetch-project-data.mjs does the fetching.

export const BUILD_FILES = ['gradle.properties', 'gradle/libs.versions.toml']

const COORDINATE = /^[\w.-]+:([\w.-]+):([^:\s]+)$/
const REHEARSAL = /-dev\d*$/

// Every `key = value` in gradle.properties, and every `key = "value"` in a TOML file. A Maven coordinate value
// (`group:artifact:version`) is read as its version, and its artifact name also counts as a key.
export function readBuildFile(text, file) {
  const toml = file.endsWith('.toml')
  const entries = []
  String(text ?? '').split(/\r?\n/).forEach((line, index) => {
    if (/^\s*[#!]/.test(line)) return
    const match = toml ? line.match(/^\s*([\w.-]+)\s*=\s*"([^"]*)"/) : line.match(/^\s*([\w.-]+)\s*[=:]\s*(\S.*?)\s*$/)
    if (!match) return
    const coordinate = match[2].match(COORDINATE)
    entries.push({
      key: match[1],
      artifact: coordinate?.[1] ?? null,
      value: coordinate ? coordinate[2] : match[2],
      source: `${file}:${index + 1}`,
    })
  })
  return entries
}

// The project's own version: `version` in gradle.properties.
export function ownVersion(entries) {
  return entries.find((entry) => entry.key === 'version' && entry.source.startsWith('gradle.properties'))?.value ?? null
}

const releaseLine = (version) => version.replace(/^v/, '').split('-')[0].split('.').slice(0, 2).join('.')

// Release tags newest first (GitHub's order), without drafts and release rehearsals.
export function releaseNames(releases) {
  return (releases ?? [])
    .filter((release) => !release.draft)
    .map((release) => String(release.tag_name ?? release.name ?? '').replace(/^v/, ''))
    .filter((name) => /^\d+\.\d+\./.test(name) && !REHEARSAL.test(name))
}

// A pin is current when it is the newest release of its line (major.minor), behind when it is an older release,
// and unreleased (it blocks a release of the project that pins it) otherwise: a snapshot or a qualification build.
export function pinStatus(version, releases) {
  if (!releases.includes(version)) {
    return { level: 'blocked', text: /SNAPSHOT/i.test(version) ? 'snapshot' : 'unreleased build', latest: null }
  }
  const latest = releases.find((name) => releaseLine(name) === releaseLine(version))
  return latest === version
    ? { level: 'current', text: 'latest release', latest }
    : { level: 'behind', text: `behind ${latest}`, latest }
}

// Nodes, pins, release steps and flags for the tracked projects.
// `projects`: [{ slug, name, repository, branch, keys, parts, entries, releases }] where `entries` come from
// readBuildFile and `releases` from releaseNames. A part ({ slug, name, note, keys }) is an artifact set a project
// publishes on its own (for example its APIs): pins on the part's keys point at the part, which takes the project's
// version and its pins, except pins on the projects that use the part.
export function buildReleaseTrain(projects) {
  const nodes = []
  const keyOwner = new Map()
  for (const project of projects) {
    const base = { repository: project.repository, branch: project.branch, releases: project.releases, version: ownVersion(project.entries) }
    nodes.push({ ...base, slug: project.slug, name: project.name, note: null, project: project.slug })
    for (const key of project.keys ?? []) keyOwner.set(key, project.slug)
    for (const part of project.parts ?? []) {
      nodes.push({ ...base, slug: part.slug, name: part.name, note: part.note ?? null, project: project.slug })
      for (const key of part.keys ?? []) keyOwner.set(key, part.slug)
    }
  }
  const node = new Map(nodes.map((item) => [item.slug, item]))

  const pins = []
  for (const project of projects) {
    const byTarget = new Map()
    for (const entry of project.entries) {
      const target = keyOwner.get(entry.key) ?? (entry.artifact && keyOwner.get(entry.artifact))
      if (!target || node.get(target).project === project.slug) continue
      const id = `${target}@${entry.value}`
      const pin = byTarget.get(id) ?? { from: target, to: project.slug, version: entry.value, keys: [], sources: [] }
      pin.keys.push(entry.key)
      pin.sources.push(entry.source)
      byTarget.set(id, pin)
    }
    pins.push(...byTarget.values())
  }
  for (const project of projects) {
    for (const part of project.parts ?? []) {
      const users = new Set(pins.filter((pin) => pin.from === part.slug).map((pin) => pin.to))
      pins.push(...pins.filter((pin) => pin.to === project.slug && !users.has(pin.from)).map((pin) => ({ ...pin, to: part.slug })))
    }
  }
  for (const pin of pins) pin.status = pinStatus(pin.version, node.get(pin.from).releases)

  // Release steps: the longest chain of pins below a node. An edge that closes a cycle is reported and not followed.
  const cycles = []
  const step = new Map()
  const visiting = new Set()
  const uses = (slug) => pins.filter((pin) => pin.to === slug)
  const depth = (slug) => {
    if (step.has(slug)) return step.get(slug)
    visiting.add(slug)
    let value = 0
    for (const pin of uses(slug)) {
      if (visiting.has(pin.from)) { cycles.push([pin.from, slug]); continue }
      value = Math.max(value, depth(pin.from) + 1)
    }
    visiting.delete(slug)
    step.set(slug, value)
    return value
  }
  nodes.forEach((item) => depth(item.slug))

  for (const item of nodes) {
    const blocked = uses(item.slug).filter((pin) => pin.status.level === 'blocked')
    const behind = uses(item.slug).filter((pin) => pin.status.level === 'behind')
    const released = item.slug === item.project && item.version && item.releases.includes(item.version)
    item.step = step.get(item.slug) + 1
    item.versionReleased = Boolean(released)
    item.latestRelease = item.releases[0] ?? null
    item.status = blocked.length ? { level: 'blocked', text: `Blocked by ${blocked.length} unreleased pin${blocked.length > 1 ? 's' : ''}` }
      : released ? { level: 'behind', text: 'Version not bumped after release' }
        : behind.length ? { level: 'behind', text: `${behind.length} pin${behind.length > 1 ? 's' : ''} behind` }
          : { level: 'current', text: 'Ready to release' }
    delete item.releases
  }

  return { nodes, pins, cycles, flags: flags(nodes, pins, cycles) }
}

function flags(nodes, pins, cycles) {
  const name = (slug) => nodes.find((item) => item.slug === slug)?.name ?? slug
  const list = (items) => items.map((pin) => `${name(pin.from)} ${pin.version}`).join(', ')
  const result = cycles.map(([from, to]) => ({
    level: 'blocked',
    title: `${name(from)} and ${name(to)} pin each other`,
    detail: `Neither can be released first. Split the shared artifacts into a part in config/projects.json, or release them in a fixed order.`,
  }))
  for (const item of nodes) {
    const blocked = pins.filter((pin) => pin.to === item.slug && pin.status.level === 'blocked')
    const behind = pins.filter((pin) => pin.to === item.slug && pin.status.level === 'behind')
    if (blocked.length) result.push({ level: 'blocked', title: `${item.name} pins unreleased builds`, detail: `${list(blocked)}. Release them first, then update the pins.` })
    if (item.versionReleased) result.push({ level: 'behind', title: `${item.name} has not bumped its version`, detail: `${item.version} is already released; the next release needs a new version.` })
    if (behind.length) result.push({ level: 'behind', title: `${item.name} uses older releases`, detail: behind.map((pin) => `${name(pin.from)} ${pin.version} (latest ${pin.status.latest})`).join(', ') + '.' })
  }
  const ready = nodes.filter((item) => item.status.level === 'current')
  if (ready.length) result.push({ level: 'current', title: `${ready.map((item) => item.name).join(', ')} can be released now`, detail: 'Every pin is the latest release of its line.' })
  const order = { blocked: 0, behind: 1, current: 2 }
  return result.sort((left, right) => order[left.level] - order[right.level])
}
