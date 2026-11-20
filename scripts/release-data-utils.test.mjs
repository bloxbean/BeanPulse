import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ciSummary,
  compareReleaseNames,
  compareVersionsDescending,
  isVersionName,
  itemArea,
  itemPriority,
  itemType,
  plainSummary,
  releaseAssignments,
  reviewSummary,
  roadmapClaims,
  typeLabel,
} from './release-data-utils.mjs'

test('recognises version metadata and rejects category labels', () => {
  assert.equal(isVersionName('3.0.0-beta4'), true)
  assert.equal(isVersionName('2.0.x'), true)
  assert.equal(isVersionName('0.0.12.1'), true)
  assert.equal(isVersionName('Blockfrost API'), false)
})

test('assigns releases from the milestone alone', () => {
  assert.deepEqual(releaseAssignments({
    labels: [{ name: '3.0.0-beta4' }, { name: 'bug' }],
    milestone: { title: '3.1.0-rc1' },
    base: { ref: 'release/2.0.x' },
  }), [{ name: '3.1.0-rc1', source: 'milestone' }])
})

test('ignores version labels and release branches now that milestones own releases', () => {
  assert.deepEqual(releaseAssignments({ labels: [{ name: '3.0.0-beta4' }], base: { ref: 'release/2.0.x' } }), [])
  assert.deepEqual(releaseAssignments({ milestone: null }), [])
  assert.deepEqual(releaseAssignments({ milestone: '  ' }), [])
})

test('reads the change type from a conventional-commit title, then from a type: label', () => {
  assert.equal(itemType({ title: 'feat(core): add endpoint' }), 'feat')
  assert.equal(itemType({ title: 'fix!: guard against nulls' }), 'fix')
  assert.equal(itemType({ title: 'feature: spelled out' }), 'feat')
  assert.equal(itemType({ title: 'Bug: capitalised alias' }), 'fix')
  assert.equal(itemType({ title: 'no prefix here', labels: [{ name: 'type:chore' }] }), 'chore')
  assert.equal(itemType({ title: 'devnet: not a change type', labels: [] }), null)
  assert.equal(itemType({ title: 'plain title' }), null)
  assert.equal(typeLabel('perf'), 'Performance')
})

test('reads area and priority from namespaced labels', () => {
  const item = { labels: [{ name: 'bug' }, { name: 'area:bf-api' }, { name: 'priority:P1' }] }
  assert.equal(itemArea(item), 'bf-api')
  assert.equal(itemPriority(item), 'P1')
  assert.equal(itemArea({ labels: [{ name: 'Area:Core API' }] }), 'Core API')
  assert.equal(itemArea({ labels: [{ name: 'bug' }] }), null)
  assert.equal(itemArea({}), null)
})

test('sorts non-version milestones after versioned ones', () => {
  assert.deepEqual(['Backlog', '2.0.1', '3.0.0'].sort(compareReleaseNames), ['3.0.0', '2.0.1', 'Backlog'])
})

test('sorts release versions newest first', () => {
  assert.deepEqual(['2.0.0-beta5', '3.0.0-beta4', '2.0.x', '2.0.1'].sort(compareVersionsDescending), [
    '3.0.0-beta4', '2.0.x', '2.0.1', '2.0.0-beta5',
  ])
  assert.deepEqual(['0.0.12', '0.0.12.1'].sort(compareVersionsDescending), ['0.0.12.1', '0.0.12'])
})

test('summarises review and check signals', () => {
  assert.equal(reviewSummary([{ user: { login: 'a' }, state: 'APPROVED' }]).status, 'approved')
  assert.equal(ciSummary([{ status: 'completed', conclusion: 'failure' }]).status, 'failure')
})

test('turns markdown bodies into concise product context', () => {
  assert.equal(plainSummary('## Summary\n\nAdds a useful network endpoint for downstream applications.'), 'Adds a useful network endpoint for downstream applications.')
  assert.equal(plainSummary(null), '')
})

test('a curated roadmap claims the work it names, so its release survives without a milestone', () => {
  assert.deepEqual(roadmapClaims({
    '3.0.0-beta4': { outcomes: [{ pullRequests: [866], issues: [] }, { pullRequests: [984, 866], issues: [12] }] },
  }), [{ release: '3.0.0-beta4', pullRequests: [866, 984], issues: [12] }])
})

test('tolerates roadmaps with missing or empty outcome references', () => {
  assert.deepEqual(roadmapClaims({}), [])
  assert.deepEqual(roadmapClaims({ '  ': { outcomes: [] } }), [])
  assert.deepEqual(roadmapClaims({ '1.0.0': {} }), [{ release: '1.0.0', pullRequests: [], issues: [] }])
})
