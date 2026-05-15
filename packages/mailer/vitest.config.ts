import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      // APP_ENV defaults to 'local' in the env schema, which selects the
      // SMTP transport. Tests stub the transport at the module boundary
      // via setTransport() — these placeholders just let env.ts load.
      MAIL_FROM: 'test@example.com'
    }
  }
})
