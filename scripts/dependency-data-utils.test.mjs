import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReleaseTrain, checkReleaseTrainConfig, ownVersion, pinStatus, readBuildFile, releaseNames } from './dependency-data-utils.mjs'

test('reads properties, TOML versions and library coordinates', () => {
  const properties = readBuildFile('# comment\nversion = 0.1.0-pre20-SNAPSHOT\njulcVersion=0.1.0-pre18\n', 'gradle.properties')
  assert.equal(ownVersion(properties), '0.1.0-pre20-SNAPSHOT')
  assert.deepEqual(properties[1], { key: 'julcVersion', artifact: null, value: '0.1.0-pre18', source: 'gradle.properties:3' })

  const toml = readBuildFile([
    '[versions]',
    'yaci = "0.5.0-pre16-f57fc88-SNAPSHOT"',
    "zeroj = '0.1.0-pre13'",
    '[libraries]',
    'yaci-core = { module = "com.bloxbean.cardano:yaci-core", version.ref = "yaci" }',
    'ccl = "com.bloxbean.cardano:cardano-client-lib:0.8.0-pre4"',
    'julc-vm = { module = "org.julclang:julc-vm", version = "0.1.0-pre20" }',
    'native = "org.example:native:1.0@jar"',
    '[plugins]',
    'julc = "org.julclang.plugin:0.1.0-pre20"',
  ].join('\n'), 'gradle/libs.versions.toml')
  assert.deepEqual(toml.map((entry) => [entry.key, entry.artifact, entry.value]), [
    ['yaci', null, '0.5.0-pre16-f57fc88-SNAPSHOT'],
    ['zeroj', null, '0.1.0-pre13'],
    ['ccl', 'cardano-client-lib', '0.8.0-pre4'],
    ['julc-vm', 'julc-vm', '0.1.0-pre20'],
    ['native', 'native', '1.0'],
  ])
})

test('keeps release order and drops drafts and rehearsals', () => {
  assert.deepEqual(releaseNames([
    { tag_name: 'v0.5.0-pre15' }, { tag_name: 'v0.4.7' }, { tag_name: 'v0.4.6-dev1' }, { tag_name: 'v0.4.6' },
    { tag_name: 'v9.9.9', draft: true }, { tag_name: 'conformance-reports' },
  ]), ['0.5.0-pre15', '0.4.7', '0.4.6'])
})

test('judges a pin against the newest release of its line', () => {
  const releases = ['0.8.0-pre7', '0.8.0-pre6', '0.7.3', '0.8.0-pre5', '0.8.0-preview1']
  assert.equal(pinStatus('0.8.0-pre7', releases).level, 'current')
  assert.deepEqual(pinStatus('0.8.0-pre5', releases), { level: 'behind', text: 'behind 0.8.0-pre7', latest: '0.8.0-pre7' })
  assert.equal(pinStatus('0.7.3', releases).level, 'current')
  assert.equal(pinStatus('0.8.0-pre8-SNAPSHOT', releases).text, 'snapshot')
  assert.equal(pinStatus('0.1.0-pre6-a3ef67b36', ['0.1.0-pre6']).text, 'unreleased build')
})

const project = (slug, properties, toml, releases, extra = {}) => ({
  slug, name: slug, repository: `bloxbean/${slug}`, branch: 'main', keys: [slug], ...extra,
  entries: [...readBuildFile(properties, 'gradle.properties'), ...readBuildFile(`[versions]\n${toml}`, 'gradle/libs.versions.toml')],
  releases,
})

test('orders releases and flags what blocks them', () => {
  const train = buildReleaseTrain([
    project('ccl', 'version = 0.8.0-pre8-SNAPSHOT', '', ['0.8.0-pre7', '0.8.0-pre6'], { keys: ['cardano-client-lib'] }),
    project('lib', 'version = 0.5.0-pre16-SNAPSHOT', 'cardano-client-lib = "0.8.0-pre7"', ['0.5.0-pre15']),
    project('app', 'version = 0.2.0-SNAPSHOT', 'lib = "0.5.0-pre16-abc1234-SNAPSHOT"\ncardano-client-lib = "0.8.0-pre6"', ['0.1.0'], { keys: [] }),
  ])
  assert.deepEqual(train.nodes.map((node) => [node.slug, node.step, node.status.level]), [
    ['ccl', 1, 'current'], ['lib', 2, 'current'], ['app', 3, 'blocked'],
  ])
  const appOnCcl = train.pins.find((pin) => pin.to === 'app' && pin.from === 'ccl')
  assert.equal(appOnCcl.status.level, 'behind')
  assert.deepEqual(appOnCcl.sources, ['gradle/libs.versions.toml:3 (cardano-client-lib)'])
  assert.equal(train.flags[0].title, 'app pins unreleased builds')
  assert.equal(train.flags.at(-1).title, 'ccl, lib can be released now')
})

test('a project without a version is never ready', () => {
  const train = buildReleaseTrain([project('empty', '', '', [])])
  assert.deepEqual(train.nodes[0].status, { level: 'blocked', text: 'No version found' })
  assert.equal(train.flags[0].title, 'empty has no version')
})

test('a part breaks a cycle between a project and its framework', () => {
  const train = buildReleaseTrain([
    project('x', 'version = 0.1.0-pre6\nyanoVersion = 0.1.0-pre20-bf45507fd', 'yaci = "0.5.0"', ['0.1.0-pre6'], { keys: ['frameworkVersion'] }),
    project('yano', 'version = 0.1.0-pre20-SNAPSHOT\nframeworkVersion = 0.1.0-pre6-a3ef67b36', 'yaci = "0.5.0"', ['0.1.0-pre19'], {
      keys: [], parts: [{ slug: 'yano-foundation', name: 'Yano foundation', note: 'APIs', keys: ['yanoVersion'] }],
    }),
    project('yaci', 'version = 0.6.0-SNAPSHOT', '', ['0.5.0']),
  ])
  const steps = Object.fromEntries(train.nodes.map((node) => [node.slug, node.step]))
  assert.deepEqual(steps, { yaci: 1, 'yano-foundation': 2, x: 3, yano: 4 })
  assert.deepEqual(train.pins.filter((pin) => pin.to === 'yano-foundation').map((pin) => pin.from), ['yaci'])
  assert.equal(train.nodes.find((node) => node.slug === 'x').status.level, 'blocked')
  assert.ok(train.flags.some((flag) => flag.title === 'x has not bumped its version'))
  assert.ok(!train.flags.some((flag) => flag.title.includes('cycle')))
})

test('flags a cycle only when an unreleased pin closes it', () => {
  const released = buildReleaseTrain([
    project('a', 'version = 1.1.0-SNAPSHOT\nb = 1.0.0', '', ['1.0.0']),
    project('b', 'version = 1.1.0-SNAPSHOT\na = 1.0.0', '', ['1.0.0']),
  ])
  assert.ok(!released.flags.some((flag) => flag.title.includes('cycle')))
  const unreleased = buildReleaseTrain([
    project('a', 'version = 1.1.0-SNAPSHOT\nb = 1.1.0-SNAPSHOT', '', ['1.0.0']),
    project('b', 'version = 1.1.0-SNAPSHOT\na = 1.1.0-SNAPSHOT', '', ['1.0.0']),
  ])
  assert.equal(unreleased.flags[0].title, 'b and a are in a cycle of pins')
})

test('rejects an ambiguous release train config', () => {
  const watched = [{ slug: 'a' }, { slug: 'b' }]
  assert.throws(() => checkReleaseTrainConfig({ projects: [{ slug: 'c' }] }, watched), /not a watched project/)
  assert.throws(() => checkReleaseTrainConfig({ projects: [{ slug: 'a', keys: ['k'] }, { slug: 'b', keys: ['k'] }] }, watched), /key k twice/)
  assert.throws(() => checkReleaseTrainConfig({ projects: [{ slug: 'a', parts: [{ slug: 'b' }] }] }, watched), /slug b twice/)
  assert.doesNotThrow(() => checkReleaseTrainConfig({ projects: [{ slug: 'a', keys: ['a'], parts: [{ slug: 'a-api', keys: ['aApi'] }] }] }, watched))
})
