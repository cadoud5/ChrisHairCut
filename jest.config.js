module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/server/__tests__/env.setup.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/__tests__/**/*.test.js'],
};