// userId가 없는 기존 문서를 지정한 GitHub 사용자에게 할당한다. 여러 번 실행해도 결과가 같다(멱등).
// 실행: node --env-file=.env.local scripts/migrate-add-user-id.ts --user <githubUsername> [--dry-run]
// Node 네이티브 TS 실행이라 @/ 별칭 없이 자체 완결로 작성함
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const COLLECTIONS = ["todos", "weeklyplans", "yeargoals"];

export async function migrateAddUserId(db: mongoose.mongo.Db, username: string, dryRun = false) {
  const users = await db.collection("users").find({ username }).limit(2).toArray();
  if (users.length === 0) throw new Error(`User "${username}" not found. Log in with GitHub once, then run again.`);
  if (users.length > 1) throw new Error(`Multiple users named "${username}". Assign manually.`);
  const userId = users[0]._id;

  const counts: Record<string, number> = {};
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const filter = { userId: null }; // 필드 없음 또는 null
    if (dryRun) {
      counts[name] = await col.countDocuments(filter);
    } else {
      counts[name] = (await col.updateMany(filter, { $set: { userId } })).modifiedCount;
      await col.createIndex({ userId: 1 }); // Mongoose 스키마의 index: true와 같은 인덱스(userId_1)
    }
  }
  return { userId, counts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { user: { type: "string" }, "dry-run": { type: "boolean", default: false } } });
  const uri = process.env.MONGODB_URI;
  if (!values.user || !uri) {
    console.error("Usage: node --env-file=.env.local scripts/migrate-add-user-id.ts --user <githubUsername> [--dry-run]");
    console.error(uri ? "--user is required" : "MONGODB_URI is not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  try {
    const dryRun = values["dry-run"];
    const { userId, counts } = await migrateAddUserId(mongoose.connection.db!, values.user, dryRun);
    console.log(`${dryRun ? "[dry-run] would assign" : "assigned"} to ${values.user} (${userId}):`);
    for (const [name, n] of Object.entries(counts)) console.log(`  ${name}: ${n}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
