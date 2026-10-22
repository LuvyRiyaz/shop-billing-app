// Hand-written TypeScript types mirroring POCKETBASE_SETUP.md exactly.
// Keep these in sync with the collections/fields documented there.

import type PocketBase from "pocketbase"
import type { RecordModel, RecordService } from "pocketbase"

// PocketBase gives every record `created`/`updated` system fields by
// default; RecordModel's own TS type only declares them for LogModel, so we
// re-declare them here once and have every collection interface extend this
// instead of RecordModel directly.
interface BaseRecord extends RecordModel {
  created: string
  updated: string
}

export type ShopType = "paint" | "wood" | "agency"
export type UserRole = "owner" | "cashier" | "manager"
export type ProductUnit = "nos" | "L" | "ml" | "Kg" | "gram" | "cft" | "sqft"
export type ProductCategoryType = "paint" | "hardware" | "service"
export type PaymentMode = "cash" | "upi" | "card" | "credit" | "bank_transfer"
export type InvoicePaymentStatus = "paid" | "partial" | "unpaid"

export interface ShopRecord extends BaseRecord {
  name: string
  type: ShopType
  gst_number?: string
  address?: string
  phone?: string
  logo?: string
  is_active: boolean
}

export interface UserRecord extends BaseRecord {
  email: string
  name: string
  shop_id: string
  role: UserRole
  phone?: string
  is_active: boolean
}

export interface ProductRecord extends BaseRecord {
  shop_id: string
  name: string
  sku?: string
  category?: string
  category_type: ProductCategoryType
  pack_size?: string
  hsn_code?: string
  gst_rate: number
  unit: ProductUnit
  price: number
  cost_price?: number
  stock_qty: number
  low_stock_threshold: number
  /** Critical reorder tier — 0 means "not configured" (see POCKETBASE_SETUP.md §3). */
  reorder_level: number
  /** PocketBase date field — same space-separated format as `created`/`updated`; use toDate() from lib/reports.ts before comparing. */
  expiry_date?: string
  is_active: boolean
  // paint
  shade_code?: string
  color_base?: string
  // wood
  length_in?: number
  width_in?: number
  thickness_in?: number
  cft?: number
  // agency
  wholesale_price?: number
  scheme?: string
}

export interface CustomerRecord extends BaseRecord {
  shop_id: string
  name: string
  phone?: string
  address?: string
  gst_number?: string
  credit_limit: number
  current_due: number
  is_active: boolean
}

export interface InvoiceRecord extends BaseRecord {
  shop_id: string
  invoice_number: string
  customer_id?: string
  created_by: string
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  discount: number
  total: number
  amount_paid: number
  payment_mode: Exclude<PaymentMode, "bank_transfer">
  payment_status: InvoicePaymentStatus
  salesman?: string
  notes?: string
  remarks?: string
  place_of_supply?: string
}

export interface InvoiceItemRecord extends BaseRecord {
  shop_id: string
  invoice_id: string
  product_id: string
  product_name: string
  hsn_code?: string
  unit?: string
  pack_size?: string
  qty: number
  unit_price: number
  gst_rate: number
  line_total: number
}

export interface PaymentRecord extends BaseRecord {
  shop_id: string
  customer_id: string
  invoice_id?: string
  amount: number
  payment_mode: Exclude<PaymentMode, "credit">
  recorded_by: string
  note?: string
}

// Internal-only — never read/written from client code, see POCKETBASE_SETUP.md §7A.
export interface CounterRecord extends BaseRecord {
  shop_id: string
  last_number: number
}

/**
 * A PocketBase client narrowed to this app's collection names + record
 * shapes, so `pb.collection("products").getFullList()` etc. come back typed
 * instead of `RecordModel[]`.
 */
export type TypedPocketBase = PocketBase & {
  collection(idOrName: "shops"): RecordService<ShopRecord>
  collection(idOrName: "users"): RecordService<UserRecord>
  collection(idOrName: "products"): RecordService<ProductRecord>
  collection(idOrName: "customers"): RecordService<CustomerRecord>
  collection(idOrName: "invoices"): RecordService<InvoiceRecord>
  collection(idOrName: "invoice_items"): RecordService<InvoiceItemRecord>
  collection(idOrName: "payments"): RecordService<PaymentRecord>
  collection(idOrName: "counters"): RecordService<CounterRecord>
}
