#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function createPublishPackageJson(packageJson) {
  const {
    files: _files,
    scripts: _scripts,
    devDependencies: _devDependencies,
    packageManager: _packageManager,
    ...publishPackageJson
  } = packageJson;
  return publishPackageJson;
}

function main() {
  const rootPath = resolve(__dirname, '..');
  const packagePath = process.argv[2] ?? '.';
  const isDryRun = process.argv.includes('--dry-run');
  const resolvedPackagePath = resolve(rootPath, packagePath);
  const publishPath = join(resolvedPackagePath, 'publish');

  if (!existsSync(resolvedPackagePath)) {
    throw new Error(`Error: Package directory does not exist: ${resolvedPackagePath}`);
  }

  const packageJsonPath = join(resolvedPackagePath, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Error: package.json not found in: ${resolvedPackagePath}`);
  }

  console.log('Cleaning publish dir');
  if (existsSync(publishPath)) {
    rmSync(publishPath, { recursive: true, force: true });
  }
  mkdirSync(publishPath, { recursive: true });

  console.log('Building package');
  execSync('pnpm -s build', { cwd: resolvedPackagePath, stdio: 'inherit' });

  console.log('Copying files to publish directory...');

  const distPath = join(resolvedPackagePath, 'dist');
  if (!existsSync(distPath)) {
    throw new Error(`Error: dist directory not found at ${distPath}`);
  }
  cpSync(distPath, join(publishPath, 'dist'), { recursive: true });

  console.log('Copying package.json');
  const packageJsonContent = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const publishPackageJson = createPublishPackageJson(packageJsonContent);
  const publishPackageJsonPath = join(publishPath, 'package.json');
  writeFileSync(publishPackageJsonPath, `${JSON.stringify(publishPackageJson, null, 2)}\n`);

  const npmignorePath = join(resolvedPackagePath, '.npmignore');
  if (existsSync(npmignorePath)) {
    console.log('Copying .npmignore');
    cpSync(npmignorePath, join(publishPath, '.npmignore'));
  }

  const licensePath = join(rootPath, 'LICENSE');
  if (existsSync(licensePath)) {
    console.log('Copying LICENSE from root');
    cpSync(licensePath, join(publishPath, 'LICENSE'));
  } else {
    throw new Error('Error: LICENSE not found at repo root');
  }

  const packageReadmePath = join(resolvedPackagePath, 'README.md');
  const rootReadmePath = join(rootPath, 'README.md');
  const readmePath = existsSync(packageReadmePath) ? packageReadmePath : rootReadmePath;
  if (!existsSync(readmePath)) {
    throw new Error('Error: README.md not found in package or root');
  }
  console.log(`Copying README from ${existsSync(packageReadmePath) ? 'package' : 'root'}`);
  cpSync(readmePath, join(publishPath, 'README.md'));

  if (isDryRun) {
    console.log('Dry run complete. Skipping npm publish.');
    return;
  }

  console.log('Publishing package');
  execSync('npm publish ./publish/ --access public', {
    cwd: resolvedPackagePath,
    stdio: 'inherit',
  });

  console.log('Release completed successfully!');
}

try {
  main();
} catch (error) {
  console.error(`Error: Release failed: ${error}`);
  process.exit(1);
}
