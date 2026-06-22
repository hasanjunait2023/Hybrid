import { redirect } from "next/navigation";

// admin.<root> -> /admin. P0 admin has one surface: products.
export default function AdminHome() {
  redirect("/admin/products");
}
