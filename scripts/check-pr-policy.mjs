import assert from 'node:assert/strict';

const { PR_BASE, PR_BODY = '', PR_HEAD_REPO, PR_REPO } = process.env;
assert.equal(PR_BASE, 'main', 'PRs must target main.');
assert.equal(PR_HEAD_REPO, PR_REPO, 'PRs must come from this repository, not a fork.');
assert(
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+\b/i.test(PR_BODY),
  'PR description must include a closing reference, e.g. Closes #42.',
);
console.log('PR policy passed.');
