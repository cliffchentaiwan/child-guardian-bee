// src/server/scripts/markSuccess.ts
import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { dataSyncLogs } from '../../../drizzle/schema'; // 注意路徑

async function markSuccess() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  await db.insert(dataSyncLogs).values({
    sourceName: 'manual_seed',
    status: 'success',
    recordCount: 99,
    startedAt: new Date(),
    completedAt: new Date(),
  });

  console.log("✅ 系統狀態已更新為：最新");
  await connection.end();
  process.exit(0);
}

markSuccess();