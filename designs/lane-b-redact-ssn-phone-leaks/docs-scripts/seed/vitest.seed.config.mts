// Synthetic only. Runs the worktree's tests with fast-check's global seed set by fc-seed.setup.ts; nothing is written in the tree.
export default { cacheDir: '/home/user/work/tests-scratch/seed/.vite', test: { include: ['src/**/*.test.ts', '/home/user/work/tests-scratch/seed/*.probe.test.ts'], testTimeout: 600000, setupFiles: ['/home/user/work/tests-scratch/seed/fc-seed.setup.ts'] } };
