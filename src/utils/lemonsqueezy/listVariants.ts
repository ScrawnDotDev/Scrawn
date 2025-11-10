import { lemonSqueezySetup, listVariants } from "@lemonsqueezy/lemonsqueezy.js";
import "dotenv/config";

const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;

async function main() {
  if (!LEMON_SQUEEZY_API_KEY) {
    console.error(
      "❌ LEMON_SQUEEZY_API_KEY is not set in environment variables",
    );
    process.exit(1);
  }

  console.log("🍋 Fetching variants from Lemon Squeezy...\n");

  lemonSqueezySetup({
    apiKey: LEMON_SQUEEZY_API_KEY,
    onError: (error) => console.error("SDK Error:", error),
  });

  try {
    const response = await listVariants();

    if (response.error) {
      console.error("❌ Error fetching variants:");
      console.error(response.error);
      process.exit(1);
    }

    if (!response.data || response.data.data.length === 0) {
      console.log("⚠️  No variants found");
      if (LEMON_SQUEEZY_STORE_ID) {
        console.log(`   Store ID filter: ${LEMON_SQUEEZY_STORE_ID}`);
      }
      process.exit(0);
    }

    console.log(`✅ Found ${response.data.data.length} variant(s):\n`);

    response.data.data.forEach((variant, index) => {
      console.log(`${index + 1}. Variant ID: ${variant.id}`);
      console.log(`   Name: ${variant.attributes.name}`);
      console.log(`   Description: ${variant.attributes.description || "N/A"}`);
      console.log(`   Price: $${(variant.attributes.price / 100).toFixed(2)}`);
      console.log(`   Status: ${variant.attributes.status}`);
      const productData = variant.relationships?.product?.data;
      const productId =
        productData && !Array.isArray(productData)
          ? (productData as { id: string; type: string }).id
          : "N/A";
      console.log(`   Product ID: ${productId}`);
      console.log("");
    });

    console.log(
      "💡 Copy the Variant ID you want to use and set it as LEMON_SQUEEZY_VARIANT_ID in your .env file",
    );
  } catch (error) {
    console.error("❌ Unexpected error:");
    console.error(error);
    process.exit(1);
  }
}

main();
