import { cleanup, disconnect } from "./db";

// 이전 실행 잔여물 제거 → 테스트 → (성공·실패 무관) 정리 후 0건 확인
export default async function globalSetup() {
  await cleanup();
  await disconnect();
  return async () => {
    const left = await cleanup();
    await disconnect();
    console.log("[e2e cleanup] remaining:", JSON.stringify(left));
    if (Object.values(left).some((n) => n !== 0)) throw new Error(`E2E cleanup incomplete: ${JSON.stringify(left)}`);
  };
}
