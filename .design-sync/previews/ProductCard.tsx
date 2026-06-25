import * as React from "react";
import { ProductCard } from "@hybrid/ui";

export const Card = () => (
  <div style={{ maxWidth: 300, padding: 28, background: "#fbfaf8" }}>
    <ProductCard
      product={{
        id: "1",
        title: "সুতি পাঞ্জাবি",
        slug: "panjabi",
        price: 1290,
        compareAtPrice: 1690,
        codEnabled: true,
        inStock: true,
        imageUrl: null,
      }}
    />
  </div>
);
