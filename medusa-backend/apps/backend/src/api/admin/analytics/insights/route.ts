import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

// Store insights for the analytics page: revenue by product category, top
// delivery locations and new vs returning customers. Same ?from&to range as
// the other analytics routes; canceled orders are excluded.

type Bucket = { name: string; revenue: number; orders: number };

const bump = (map: Map<string, Bucket>, key: string, name: string, revenue: number, orderId: string, seen: Set<string>) => {
  const b = map.get(key) ?? { name, revenue: 0, orders: 0 };
  b.revenue += revenue;
  if (!seen.has(`${key}:${orderId}`)) {
    seen.add(`${key}:${orderId}`);
    b.orders += 1;
  }
  map.set(key, b);
};

const top = (map: Map<string, Bucket>, n = 8) =>
  [...map.values()]
    .map((b) => ({ ...b, revenue: Number(b.revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n);

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    const [{ data: rawOrders }, { data: categories }] = await Promise.all([
      query.graph({
        entity: "order",
        fields: [
          "id",
          "email",
          "status",
          "created_at",
          "shipping_address.city",
          "shipping_address.province",
          "items.id",
          "items.quantity",
          "items.unit_price",
                    "items.product_id",
        ],
        pagination: { take: 5000 },
      }),
      query.graph({
        entity: "product_category",
        fields: ["id", "name", "handle", "products.id"],
        pagination: { take: 1000 },
      }),
    ]);

    // product_id → [{ category name, handle }]
    const productCats = new Map<string, { name: string; handle: string }[]>();
    for (const c of categories as any[]) {
      for (const p of c.products ?? []) {
        const list = productCats.get(p.id) ?? [];
        list.push({ name: c.name, handle: c.handle });
        productCats.set(p.id, list);
      }
    }

    const orders = (rawOrders as any[]).filter((o) => o.status !== "canceled");

    // First order date per email, across all time, to tell new from returning.
    const firstOrderAt = new Map<string, number>();
    for (const o of orders) {
      const t = new Date(o.created_at).getTime();
      const e = (o.email || "").toLowerCase();
      if (e && (!firstOrderAt.has(e) || t < firstOrderAt.get(e)!)) firstOrderAt.set(e, t);
    }

    const inRange = orders.filter((o) => {
      const d = new Date(o.created_at);
      return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
    });

    const byCategory = new Map<string, Bucket>();
    const byCity = new Map<string, Bucket>();
    const byState = new Map<string, Bucket>();
    const seen = new Set<string>();
    let totalRevenue = 0;
    const newEmails = new Set<string>();
    const returningEmails = new Set<string>();

    for (const o of inRange) {
      let orderRevenue = 0;

      for (const item of o.items ?? []) {
        const revenue = Number(item.unit_price || 0) * Number(item.quantity || 0);
        orderRevenue += revenue;
        for (const cat of productCats.get(item.product_id) ?? []) {
          bump(byCategory, cat.handle, cat.name, revenue, o.id, seen);
        }
      }

      totalRevenue += orderRevenue;

      const city = o.shipping_address?.city?.trim();
      const state = o.shipping_address?.province?.trim();
      if (city) bump(byCity, city.toLowerCase(), city, orderRevenue, o.id, seen);
      if (state) bump(byState, state.toLowerCase(), state, orderRevenue, o.id, seen);

      const email = (o.email || "").toLowerCase();
      if (email) {
        const isFirst = firstOrderAt.get(email) === new Date(o.created_at).getTime();
        (isFirst ? newEmails : returningEmails).add(email);
      }
    }
    // A customer whose first order is in range but who ordered again is still "new".
    for (const e of newEmails) returningEmails.delete(e);

    res.json({
      insights: {
        total_orders: inRange.length,
        total_revenue: Number(totalRevenue.toFixed(2)),
        by_category: top(byCategory),
        top_cities: top(byCity, 6),
        top_states: top(byState, 6),
        customers: { new: newEmails.size, returning: returningEmails.size },
      },
    });
  } catch (error: any) {
    console.error("Error in GET /admin/analytics/insights:", error);
    res.status(500).json({ message: "Failed to load store insights", error: error.message || String(error) });
  }
}
