import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import SupplierCatalogPreview from "@/components/SupplierCatalogPreview";
import { fetchVidaxlCatalog } from "@/lib/suppliers";

export const metadata: Metadata = {
  title: "Supplier Catalog Preview",
  description: "Internal preview of the dropship supplier ingestion pipeline.",
};

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  try {
    const catalog = await fetchVidaxlCatalog();
    return <SupplierCatalogPreview catalog={catalog} />;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div className="container-page py-14">
        <div className="card flex max-w-2xl items-start gap-3 border-red-500/30 bg-red-500/5 p-5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <div className="text-sm text-cream-dim">
            <div className="font-semibold text-cream">Live VidaXL fetch failed.</div>
            <div className="mt-2 font-mono text-xs text-red-300">{message}</div>
            <p className="mt-3">
              This means credentials are set but the request itself failed — check the auth
              (email + token), the base URL, and whether the response shape matches what{" "}
              <code className="rounded bg-ink-panel px-1.5 py-0.5">lib/suppliers/vidaxl.ts</code>{" "}
              expects.
            </p>
          </div>
        </div>
      </div>
    );
  }
}
