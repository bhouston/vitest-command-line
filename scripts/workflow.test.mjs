import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { checkPullRequest } from './check-pr.mjs';
import config from '../release.config.js';

const valid = { base: { ref: 'main' }, body: 'Closes #42' };
/** @type {[string, object, boolean][]} */
const policyCases = [
  ['implementation', {}, true],
  ['any branch name', { head: { ref: 'anything-i-want' } }, true],
  ['missing issue', { body: '' }, false],
  ['wrong target branch', { base: { ref: 'dev' } }, false],
];
for (const [name, overrides, passes] of policyCases) {
  void test(`PR policy: ${name}`, () => {
    let threw = false;
    try {
      checkPullRequest({ ...valid, ...overrides });
    } catch {
      threw = true;
    }
    assert.equal(!threw, passes);
  });
}

/** @type {[string, string | null][]} */
const releaseCases = [
  ['fix: handle empty output', 'patch'],
  ['feat: add export', 'minor'],
  ['feat!: remove old API', 'major'],
  ['fix: change API\n\nBREAKING CHANGE: remove legacy arguments', 'major'],
  ['chore: update workflow', null],
];
for (const [message, expected] of releaseCases) {
  void test(`release analysis: ${message.split('\n')[0]}`, async () => {
    const actual = await analyzeCommits(config.plugins[0][1], {
      cwd: process.cwd(),
      commits: [{ hash: 'test', message }],
      logger: { log() {} },
    });
    assert.equal(actual, expected);
  });
}

void test('release branch is only main', () => assert.deepEqual(config.branches, ['main']));
