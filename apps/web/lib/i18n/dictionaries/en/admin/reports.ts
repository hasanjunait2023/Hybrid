// Reports & Finance admin strings (tenant roadmap P2-1). English source of
// truth; bn/admin/reports.ts mirrors this shape exactly.
export const reports = {
  title: "Reports & Finance",

  // Range presets (days)
  range: {
    d7: "7 days",
    d30: "30 days",
    d90: "90 days",
  },

  // Stat strip
  stats: {
    totalSales: "Total sales",
    orders: "Orders",
    avgPrefix: "Avg",
    grossProfit: "Gross profit",
    marginPrefix: "Margin",
    setCostPrice: "Set a cost price",
    rtoRate: "RTO rate",
    deliveryPrefix: "Delivery",
  },

  // Sales trend
  salesTrend: "Sales trend",

  // Top products
  topProducts: "Top products",
  noSales: "No sales.",
  col: {
    product: "Product",
    units: "Units",
    sales: "Sales",
  },

  // Order status
  orderStatus: "Order status",
  noData: "No data.",

  // COD account
  cod: {
    heading: "COD summary",
    out: "Outstanding (in transit)",
    collected: "Collected",
    remitted: "Remitted",
    pending: "Remit pending",
  },

  // Courier performance
  courier: {
    heading: "Courier performance",
    empty: "No consignments yet.",
    col: {
      courier: "Courier",
      sent: "Sent",
      delivered: "Delivered",
      deliveryRate: "Delivery rate",
      rtoRate: "RTO rate",
      codCollected: "COD collected",
    },
  },
};
