/**
 * Downloads each named product's hero photo into a local folder in one go —
 * for feeding real reference images into an external image tool (AI Studio,
 * ChatGPT) instead of describing products in text, which is what actually
 * makes a manually-generated room recognizable as the real catalogue items.
 *
 * Files are named "<n>-<category>-<id>.<ext>" so they sort in the same
 * order you'd naturally place them (table, chair, storage...) and stay
 * identifiable once they're sitting loose in an upload dialog.
 *
 * Usage:
 *   npx tsx scripts/download-product-photos.ts vidaxl-869317,vidaxl-42007350,vidaxl-845421
 *   npx tsx scripts/download-product-photos.ts vidaxl-869317,vidaxl-42007350 ./my-folder
 *
 * Defaults to ./reference-photos in the repo root. Skips (doesn't
 * re-download) a file that's already there, so re-running after adding one
 * more id to the list is cheap.
 *
 * Reads DATABASE_URL from .env.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog } from "../lib/productSearchDb";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

function extensionFor(url: string, contentType: string | null): string {
  const fromUrl = url.split("?")[0].split(".").pop();
  if (fromUrl && fromUrl.length <= 4 && /^[a-z0-9]+$/i.test(fromUrl)) return fromUrl.toLowerCase();
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  return "jpg";
}

async function main() {
  const [idsArg, outDir = "./reference-photos"] = process.argv.slice(2);
  if (!idsArg) {
    console.error("Usage: npx tsx scripts/download-product-photos.ts <id1,id2,...> [outputDir]");
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  const ids = idsArg.split(",").map((s) => s.trim()).filter(Boolean);
  console.log("Loading product catalog...");
  const catalog = await loadProductCatalog();
  const byId = new Map(catalog.map((p) => [p.id, p]));

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let ok = 0;
  let skipped = 0;
  for (const [i, id] of ids.entries()) {
    const product = byId.get(id);
    if (!product) {
      console.warn(`  [${i + 1}/${ids.length}] ${id} — not in the catalogue, skipping.`);
      continue;
    }
    if (!product.imageUrl) {
      console.warn(`  [${i + 1}/${ids.length}] ${product.name} — no photo on file, skipping.`);
      continue;
    }

    const label = `${String(i + 1).padStart(2, "0")}-${product.category}-${id}`;
    // Extension isn't known until the response headers arrive, so the
    // existence check below happens after a HEAD-like peek rather than a
    // guessed filename — cheap enough for a handful of products.
    try {
      const res = await fetch(product.imageUrl);
      if (!res.ok) {
        console.warn(`  [${i + 1}/${ids.length}] ${product.name} — HTTP ${res.status}, skipping.`);
        continue;
      }
      const ext = extensionFor(product.imageUrl, res.headers.get("content-type"));
      const path = `${outDir}/${label}.${ext}`;
      if (existsSync(path)) {
        console.log(`  [${i + 1}/${ids.length}] ${product.name} — already downloaded, skipping.`);
        skipped++;
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, buffer);
      console.log(`  [${i + 1}/${ids.length}] ${product.name} -> ${path} (${(buffer.length / 1024).toFixed(0)}KB)`);
      ok++;
    } catch (err) {
      console.warn(`  [${i + 1}/${ids.length}] ${product.name} — download failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${ok} downloaded, ${skipped} already present, ${ids.length - ok - skipped} failed, in ${outDir}/`);
  console.log("Drag the whole folder into AI Studio / ChatGPT alongside your room prompt.");
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
