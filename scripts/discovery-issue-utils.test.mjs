import assert from 'node:assert/strict'
import test from 'node:test'
import { discoveryIssueBody, previousRepositories, repositoryChanges } from './discovery-issue-utils.mjs'

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
