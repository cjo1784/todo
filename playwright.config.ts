import { defineConfig } from "@playwright/test";

// 실행 중인 dev 서버(npm run dev)를 대상으로 한다. webServer는 띄우지 않음
// E2E 데이터는 .env.local의 MONGODB_URI(실제 DB)에 쓰이고 global-setup의 teardown이 지운다
process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60_000,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
});
