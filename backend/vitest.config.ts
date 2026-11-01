import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Las pruebas de integración levantan una BD pg-mem por archivo: sin Docker ni Postgres.
    testTimeout: 20000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'secreto-solo-para-pruebas-1234567890',
      LOG_LEVEL: 'silent',
      BCRYPT_ROUNDS: '4',
    },
  },
});
