import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ciSummary,
  compareVersionsDescending,
  isVersionName,
  plainSummary,
  releaseAssignments,
  reviewSummary,
} from './release-data-utils.mjs'

test('recognises version metadata and rejects category labels', () => {
  assert.equal(isVersionName('3.0.0-beta4'), true)
  assert.equal(isVersionName('2.0.x'), true)
  assert.equal(isVersionName('Blockfrost API'), false)
})

test('collects release assignments from labels, milestones, and branches', () => {
  assert.deepEqual(releaseAssignments({
    labels: [{ name: '3.0.0-beta4' }, { name: 'bug' }],
    milestone: { title: '3.1.0-rc1' },
    base: { ref: 'release/2.0.x' },
  }), [
    { name: '3.0.0-beta4', source: 'label' },
    { name: '3.1.0-rc1', source: 'milestone' },
    { name: '2.0.x', source: 'branch' },
  ])
})

test('sorts release versions newest first', () => {
  assert.deepEqual(['2.0.0-beta5', '3.0.0-beta4', '2.0.x', '2.0.1'].sort(compareVersionsDescending), [
    '3.0.0-beta4', '2.0.x', '2.0.1', '2.0.0-beta5',
  ])
})

test('summarises review and check signals', () => {
  assert.equal(reviewSummary([{ user: { login: 'a' }, state: 'APPROVED' }]).status, 'approved')
  assert.equal(ciSummary([{ status: 'completed', conclusion: 'failure' }]).status, 'failure')
})

test('turns markdown bodies into concise product context', () => {
  assert.equal(plainSummary('## Summary\n\nAdds a useful network endpoint for downstream applications.'), 'Adds a useful network endpoint for downstream applications.')
  assert.equal(plainSummary(null), '')
})
