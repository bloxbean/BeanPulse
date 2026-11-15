// Release train: which tracked project pins which version of which, read from Gradle build files.
// Pure functions only; scripts/fetch-project-data.mjs does the fetching.
import { isVersionName } from './release-data-utils.mjs'

export const BUILD_FILES = ['gradle.properties', 'gradle/libs.versions.toml']

const REHEARSAL = /-dev\d*$/
const QUOTED = `["']([^"']*)["']`
const VERSIONS_ENTRY = new RegExp(`^\\s*([\\w.-]+)\\s*=\\s*${QUOTED}`)
const LIBRARY_COORDINATE = /^\s*([\w.-]+)\s*=\s*["'][\w.-]+:([\w.-]+):([^:"'@]+)(?:@\w+)?["']/
const LIBRARY_INLINE = new RegExp(`^\\s*([\\w.-]+)\\s*=\\s*\\{.*\\bmodule\\s*=\\s*["'][\\w.-]+:([\\w.-]+)["'].*\\bversion\\s*=\\s*${QUOTED}`)

// Pins in a build file:
// - gradle.properties: every `key = value`;
// - libs.versions.toml: `[versions]` entries (`key = "1.0"`), and `[libraries]` entries written as a coordinate
//   (`key = "group:artifact:1.0"`) or inline (`key = { module = "group:artifact", version = "1.0" }`), whose artifact
//   name also counts as a key. Other sections, and `version.ref` entries, name no version.
export function readBuildFile(text, file) {
  const toml = file.endsWith('.toml')
  const entries = []
  let section = null
  String(text ?? '').split(/\r?\n/).forEach((line, index) => {
    if (/^\s*[#!]/.test(line)) return
    const source = `${file}:${index + 1}`
    if (!toml) {
      const match = line.match(/^\s*([\w.-]+)\s*[=:]\s*(\S.*?)\s*$/)
      if (match) entries.push({ key: match[1], artifact: null, value: match[2], source })
      return
    }
    const header = line.match(/^\s*\[([\w.-]+)\]/)
    if (header) {
      section = header[1]
    } else if (section === 'versions') {
      const match = line.match(VERSIONS_ENTRY)
      if (match) entries.push({ key: match[1], artifact: null, value: match[2], source })
    } else if (section === 'libraries') {
      const match = line.match(LIBRARY_COORDINATE) ?? line.match(LIBRARY_INLINE)
      if (match) entries.push({ key: match[1], artifact: match[2], value: match[3], source })
    }
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
    .filter((release) => !release.draft && isVersionName(release.tag_name))
    .map((release) => release.tag_name.replace(/^v/, ''))
    .filter((name) => !REHEARSAL.test(name))
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
// publishes on its own (for example its APIs): pins on the part's keys point at the part. A part shares its project's
// version and releases, and takes the project's pins except pins on the projects that use the part.
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
      const pin = byTarget.get(id) ?? { from: target, to: project.slug, version: entry.value, sources: [] }
      pin.sources.push(`${entry.source} (${entry.key})`)
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
  const uses = new Map(nodes.map((item) => [item.slug, pins.filter((pin) => pin.to === item.slug)]))

  // Release steps: the longest chain of pins below a node. A pin that closes a cycle is kept aside and not followed.
  const cycles = []
  const step = new Map()
  const visiting = new Set()
  const depth = (slug) => {
    if (step.has(slug)) return step.get(slug)
    visiting.add(slug)
    let value = 0
    for (const pin of uses.get(slug)) {
      if (visiting.has(pin.from)) { cycles.push(pin); continue }
      value = Math.max(value, depth(pin.from) + 1)
    }
    visiting.delete(slug)
    step.set(slug, value)
    return value
  }
  nodes.forEach((item) => depth(item.slug))

  const name = (slug) => node.get(slug)?.name ?? slug
  const flags = cycles
    .filter((pin) => pin.status.level === 'blocked')
    .map((pin) => ({
      level: 'blocked',
      title: `${name(pin.to)} and ${name(pin.from)} are in a cycle of pins`,
      detail: `${name(pin.to)} pins ${name(pin.from)} ${pin.version}, which itself depends on ${name(pin.to)}. Release them in a fixed order, or declare the shared artifacts as a part in config/projects.json.`,
    }))
  for (const item of nodes) {
    const blocked = uses.get(item.slug).filter((pin) => pin.status.level === 'blocked')
    const behind = uses.get(item.slug).filter((pin) => pin.status.level === 'behind')
    item.step = step.get(item.slug) + 1
    item.latestRelease = item.releases[0] ?? null
    item.versionReleased = item.slug === item.project && item.releases.includes(item.version)
    item.status = !item.version ? { level: 'blocked', text: 'No version found' }
      : blocked.length ? { level: 'blocked', text: `Blocked by ${blocked.length} unreleased pin${blocked.length > 1 ? 's' : ''}` }
        : item.versionReleased ? { level: 'behind', text: 'Version already released' }
          : behind.length ? { level: 'behind', text: `${behind.length} pin${behind.length > 1 ? 's' : ''} behind` }
            : { level: 'current', text: 'Ready to release' }
    delete item.releases
    if (!item.version) flags.push({ level: 'blocked', title: `${item.name} has no version`, detail: `No version key in gradle.properties on ${item.branch}.` })
    if (blocked.length) flags.push({ level: 'blocked', title: `${item.name} pins unreleased builds`, detail: `${blocked.map((pin) => `${name(pin.from)} ${pin.version}`).join(', ')}. Release them first, then update the pins.` })
    if (item.versionReleased) flags.push({ level: 'behind', title: `${item.name} has not bumped its version`, detail: `${item.version} is already released; the next release needs a new version.` })
    if (behind.length) flags.push({ level: 'behind', title: `${item.name} uses older releases`, detail: `${behind.map((pin) => `${name(pin.from)} ${pin.version} (latest ${pin.status.latest})`).join(', ')}.` })
  }
  const ready = nodes.filter((item) => item.status.level === 'current')
  if (ready.length) flags.push({ level: 'current', title: `${ready.map((item) => item.name).join(', ')} can be released now`, detail: 'Every pin is the latest release of its line.' })
  const order = { blocked: 0, behind: 1, current: 2 }
  return { nodes, pins, flags: flags.sort((left, right) => order[left.level] - order[right.level]) }
}

// Rejects a release train config that cannot be read unambiguously.
export function checkReleaseTrainConfig(releaseTrain, watched) {
  const slugs = new Set(watched.map((project) => project.slug))
  const seen = new Set()
  const keys = new Set()
  for (const entry of releaseTrain?.projects ?? []) {
    if (!slugs.has(entry.slug)) throw new Error(`releaseTrain names ${entry.slug}, which is not a watched project`)
    for (const item of [entry, ...(entry.parts ?? [])]) {
      if (seen.has(item.slug) || (item !== entry && slugs.has(item.slug))) throw new Error(`releaseTrain uses the slug ${item.slug} twice`)
      seen.add(item.slug)
      for (const key of item.keys ?? []) {
        if (keys.has(key)) throw new Error(`releaseTrain uses the key ${key} twice`)
        keys.add(key)
      }
    }
  }
}
