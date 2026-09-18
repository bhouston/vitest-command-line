export default {
  branches: ['main'],
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    '@anolilab/semantic-release-pnpm',
    [
      '@semantic-release/github',
      {
        assets: ['CHANGELOG.md'],
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
  ],
};
