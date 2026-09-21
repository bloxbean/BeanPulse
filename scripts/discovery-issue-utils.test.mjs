import assert from 'node:assert/strict'
import test from 'node:test'
import { DISCOVERY_ISSUE_TITLE, discoveryIssueBody, isDiscoveryIssue, previousRepositories, repositoryChanges } from './discovery-issue-utils.mjs'

const repositories = [
  { repository: 'bloxbean/new-project', name: 'new-project', description: 'A new @team project', url: 'https://github.com/bloxbean/new-project', language: 'Java', archived: false, fork: false, isNew: true, watched: false },
  { repository: 'bloxbean/older-project', name: 'older-project', description: 'An older project', url: 'https://github.com/bloxbean/older-project', language: null, archived: false, fork: false, isNew: false, watched: false },
  { repository: 'bloxbean/watched', name: 'watched', description: 'Already tracked', url: 'https://github.com/bloxbean/watched', language: 'Java', archived: false, fork: false, isNew: false, watched: true },
]

test('builds a discovery inbox and preserves its repository marker', () => {
  const body = discoveryIssueBody({ organization: 'bloxbean', catalog: repositories }, repositories.filter((repository) => !repository.watched))
  assert.match(body, /Repository discovery inbox/)
  assert.match(body, /bloxbean\/new-project/)
  assert.doesNotMatch(body, /@team/)
  assert.deepEqual(previousRepositories(body), ['bloxbean/new-project', 'bloxbean/older-project'])
})

test('detects repositories added to and removed from discovery', () => {
  assert.deepEqual(repositoryChanges(['bloxbean/old', 'bloxbean/keep'], ['bloxbean/keep', 'bloxbean/new']), {
    added: ['bloxbean/new'],
    removed: ['bloxbean/old'],
  })
})

test('warns that the discovery inbox is automated before listing repositories', () => {
  const body = discoveryIssueBody({ organization: 'bloxbean', catalog: repositories }, repositories.filter((repository) => !repository.watched))
  assert.match(body, /Automated issue/)
  assert.ok(body.indexOf('Automated issue') < body.indexOf('bloxbean/new-project'), 'the notice must appear above the repository list')
})

test('recognises a discovery inbox by its marker regardless of title', () => {
  const body = discoveryIssueBody({ organization: 'bloxbean', catalog: repositories }, repositories.filter((repository) => !repository.watched))
  assert.ok(isDiscoveryIssue(body))
  assert.ok(!isDiscoveryIssue('An unrelated issue body'))
  assert.ok(!isDiscoveryIssue(undefined))
  assert.match(DISCOVERY_ISSUE_TITLE, /Automated/)
})
