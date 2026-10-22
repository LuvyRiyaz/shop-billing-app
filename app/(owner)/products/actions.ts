"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { ClientResponseError } from "pocketbase"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import { productFormSchema, type ActionResult, type ProductFormInput } from "@/lib/validators/products"
import type { ProductRecord } from "@/lib/types/pocketbase"

function toPocketBaseBody(input: ProductFormInput) {
  const isPaint = input.categoryType === "paint"
  return {
    shop_id: input.shopId,
    name: input.name,
    sku: input.sku || "",
    category: input.category || "",
    category_type: input.categoryType,
    pack_size: input.packSize || "",
    hsn_code: input.hsnCode || "",
    gst_rate: input.gstRate,
    unit: input.unit,
    price: input.price,
    cost_price: input.costPrice ?? 0,
    stock_qty: input.stockQty,
    low_stock_threshold: input.lowStockThreshold,
    reorder_level: input.reorderLevel,
    expiry_date: input.expiryDate || null,
    is_active: input.isActive,
    // Blanked out for non-paint items so switching a product's category
    // type away from "paint" doesn't leave a stale shade/color behind.
    shade_code: isPaint ? input.shadeCode || "" : "",
    color_base: isPaint ? input.colorBase || "" : "",
  }
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ClientResponseError) {
    return err.response?.message || err.message
  }
  return err instanceof Error ? err.message : fallback
}

export async function createProduct(input: ProductFormInput): Promise<ActionResult<ProductRecord>> {
  const parsed = productFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data" }
  }

  const pb = createServerPocketBase(cookies().toString())
  const user = await requireRole(pb, ["owner", "manager"])

  if (parsed.data.shopId !== user.shop_id) {
    return { ok: false, error: "Shop mismatch" }
  }

  try {
    const record = await pb.collection("products").create(toPocketBaseBody(parsed.data))
    revalidatePath("/products")
    return { ok: true, data: record }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to create product") }
  }
}

export async function updateProduct(
  id: string,
  input: ProductFormInput
): Promise<ActionResult<ProductRecord>> {
  const parsed = productFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data" }
  }

  const pb = createServerPocketBase(cookies().toString())
  const user = await requireRole(pb, ["owner", "manager"])

  if (parsed.data.shopId !== user.shop_id) {
    return { ok: false, error: "Shop mismatch" }
  }

  try {
    // PocketBase's own updateRule (shop_id = @request.auth.shop_id, checked
    // against the EXISTING record) already blocks editing another shop's
    // product via a forged id — this is a second, explicit check purely so
    // the UI gets a specific error message instead of a generic rule
    // rejection, same defense-in-depth pattern as the billing actions.
    const existing = await pb.collection("products").getOne(id)
    if (existing.shop_id !== user.shop_id) {
      return { ok: false, error: "Product does not belong to this shop" }
    }

    const record = await pb.collection("products").update(id, toPocketBaseBody(parsed.data))
    revalidatePath("/products")
    return { ok: true, data: record }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to update product") }
  }
}

export async function deleteProduct(id: string): Promise<ActionResult<null>> {
  const pb = createServerPocketBase(cookies().toString())
  // POCKETBASE_SETUP.md §3: products.deleteRule is owner-only (not
  // manager) — requireRole here only confirms "some" role, the UI itself
  // hides the delete button for a manager (components/products/ProductTable.tsx),
  // and PocketBase's own deleteRule is the actual enforcement either way.
  const user = await requireRole(pb, ["owner", "manager"])

  try {
    const existing = await pb.collection("products").getOne(id)
    if (existing.shop_id !== user.shop_id) {
      return { ok: false, error: "Product does not belong to this shop" }
    }

    await pb.collection("products").delete(id)
    revalidatePath("/products")
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, error: errorMessage(err, "Failed to delete product") }
  }
}
