import { lemonSqueezySetup, listStores } from "@lemonsqueezy/lemonsqueezy.js";
import "dotenv/config";

const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;

async function main() {
  if (!LEMON_SQUEEZY_API_KEY) {
    console.error("❌ LEMON_SQUEEZY_API_KEY is not set in environment variables");
    process.exit(1);
  }

  console.log("🍋 Fetching stores from Lemon Squeezy...\n");

  lemonSqueezySetup({
    apiKey: LEMON_SQUEEZY_API_KEY,
    onError: (error) => console.error("SDK Error:", error),
  });

  try {
    const response = await listStores();

    if (response.error) {
      console.error("❌ Error fetching stores:");
      console.error(response.error);
      process.exit(1);
    }

    if (!response.data || response.data.data.length === 0) {
      console.log("⚠️  No stores found");
      process.exit(0);
    }

    console.log(`✅ Found ${response.data.data.length} store(s):\n`);

    response.data.data.forEach((store, index) => {
      console.log(`${index + 1}. Store ID: ${store.id}`);
      console.log(`   Name: ${store.attributes.name}`);
      console.log(`   Slug: ${store.attributes.slug}`);
      console.log(`   Domain: ${store.attributes.domain}`);
      console.log(`   URL: ${store.attributes.url}`);
      console.log(`   Currency: ${store.attributes.currency}`);
      console.log("");
    });

    console.log("💡 Copy the Store ID you want to use and set it as LEMON_SQUEEZY_STORE_ID in your .env file");
  } catch (error) {
    console.error("❌ Unexpected error:");
    console.error(error);
    process.exit(1);
  }
}

main();
