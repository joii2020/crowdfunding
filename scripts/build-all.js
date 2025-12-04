#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function buildAllContracts() {
  const contractsDir = path.join(process.cwd(), 'contracts');

  if (!fs.existsSync(contractsDir)) {
    console.error('No contracts directory found!');
    process.exit(1);
  }

  const contracts = fs
    .readdirSync(contractsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name !== 'libs')
    .map((dirent) => dirent.name);

  if (contracts.length === 0) {
    console.log('No contracts found to build.');
    return;
  }

  console.log(`Building ${contracts.length} contract(s): ${contracts.join(', ')}`);

  for (const contractName of contracts) {
    console.log(`\n📦 Building contract: ${contractName}`);
    try {
      execSync(`node scripts/build-contract.js ${contractName}`, { stdio: 'inherit' });
      console.log(`✅ Successfully built: ${contractName}`);
    } catch (error) {
      console.error(`❌ Failed to build: ${contractName}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  console.log(`\n🎉 All contracts built successfully!`);
}

function getLatestMtime(dir) {
  const queue = [dir];
  let latest = 0;

  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const stat = fs.statSync(fullPath);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else {
        latest = Math.max(latest, stat.mtimeMs);
      }
    }
  }

  return latest;
}

function buildShared() {
  const sharedDir = path.join(process.cwd(), 'shared');
  if (!fs.existsSync(sharedDir)) {
    return;
  }

  const srcDir = path.join(sharedDir, 'src');
  const distEntry = path.join(sharedDir, 'dist', 'index.js');

  const distMtime = fs.existsSync(distEntry) ? fs.statSync(distEntry).mtimeMs : 0;
  const srcNewest = fs.existsSync(srcDir) ? getLatestMtime(srcDir) : 0;

  if (distMtime && srcNewest <= distMtime) {
    console.log('\n⏩ Shared package is up to date, skipping build.');
    return;
  }

  console.log('\n🧩 Building shared package needed by the app...');
  try {
    execSync('pnpm --filter shared run build', { stdio: 'inherit' });
    console.log('✅ Successfully built shared package.');
  } catch (error) {
    console.error('❌ Failed to build shared package.');
    console.error(error.message);
    process.exit(1);
  }
}

buildAllContracts();
buildShared();
