const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

function resolvePnpmPackageDir(packagePrefix) {
  const pnpmDir = path.resolve(__dirname, '../../node_modules/.pnpm');
  const match = fs
    .readdirSync(pnpmDir)
    .find((entry) => entry === packagePrefix || entry.startsWith(`${packagePrefix}@`));

  if (!match) {
    throw new Error(`Could not resolve pnpm package directory for ${packagePrefix}.`);
  }

  return path.join(pnpmDir, match, 'node_modules', packagePrefix);
}

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  assert: resolvePnpmPackageDir('assert')
};

module.exports = config;
