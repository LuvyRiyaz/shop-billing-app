import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createServerPocketBase, requireRole } from "@/lib/pocketbase-client"
import { ProductTable } from "@/components/products/ProductTable"
import { createProduct, updateProduct, deleteProduct } from "./actions"

export default async function ProductsPage() {
  const pb = createServerPocketBase(cookies().toString())

  const user = await requireRole(pb, ["owner", "manager"]).catch(() => null)
  if (!user) {
    redirect("/login")
  }

  // Unlike the billing page (active products only), this fetches
  // everything — an owner needs to see and reactivate inactive products,
  // not just what's currently sellable.
  const products = await pb.collection("products").getFullList({
    filter: pb.filter("shop_id = {:shopId}", { shopId: user.shop_id }),
    sort: "name",
  })

  return (
    <ProductTable
      shopId={user.shop_id}
      currentRole={user.role}
      initialProducts={products}
      createProduct={createProduct}
      updateProduct={updateProduct}
      deleteProduct={deleteProduct}
    />
  )
}
