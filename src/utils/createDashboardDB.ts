import postgres from "postgres";

async function main(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error("DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    await sql.unsafe("CREATE DATABASE dashboard");
    console.log("Created 'dashboard' database");
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("already exists")) {
      console.log("'dashboard' database already exists");
    } else {
      throw err;
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Failed to create dashboard database:", err);
  process.exit(1);
});
