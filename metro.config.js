// Expo(Metro)가 백엔드 폴더(파이썬 가상환경 포함)를 읽지 않도록 제외
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const backendDir = path.resolve(__dirname, "backend").replace(/[/\\]/g, "[/\\\\]");
config.resolver.blockList = [
  new RegExp(`^${backendDir}[/\\\\].*`),
  // Ignore numbered dependency copies created by file sync; reading them can stall Metro.
  /[/\\]node_modules[/\\].* [2-9][0-9]*\.[^/\\]+$/,
];

module.exports = config;
