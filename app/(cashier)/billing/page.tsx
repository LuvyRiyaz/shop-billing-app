import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import { BillingScreen } from "@/components/billing/BillingScreen"
import { createInvoice } from "./actions"

export default async function BillingPage() {
  const pb = createServerPocketBase(cookies().toString())

  const user = await requireRole(pb, ["cashier", "owner"]).catch(() => null)
  if (!user) {
    redirect("/login")
  }

  const shop = await pb.collection("shops").getOne(user.shop_id)

  const [products, customers] = await Promise.all([
    pb.collection("products").getFullList({
      filter: pb.filter("shop_id = {:shopId} && is_active = true", { shopId: shop.id }),
      sort: "name",
    }),
    pb.collection("customers").getFullList({
      filter: pb.filter("shop_id = {:shopId} && is_active = true", { shopId: shop.id }),
      sort: "name",
    }),
  ])

  return (
    <BillingScreen
      shop={shop}
      initialProducts={products}
      customers={customers}
      createInvoiceAction={createInvoice}
    />
  )
}
