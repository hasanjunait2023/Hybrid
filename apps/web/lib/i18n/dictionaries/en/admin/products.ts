// Admin products surface strings (list, search, form, import). English source of
// truth; bn/admin/products.ts mirrors this shape exactly.
export const products = {
  title: "Products",
  productsUnit: "products",
  newProduct: "New product",
  collectionsLink: "Collections",
  empty: "No products.",

  subtitle: {
    activeSuffix: "active",
  },

  stats: {
    total: "Total products",
    active: "Active",
    lowStock: "Low stock",
    outOfStock: "Out of stock",
  },

  statusPills: {
    all: "All",
    active: "Active",
    draft: "Draft",
    archived: "Archived",
  },

  table: {
    product: "Product",
    status: "Status",
    price: "Price",
    stock: "Stock",
    variant: "Variant",
  },

  search: {
    placeholder: "Search by product name",
    aria: "Search products",
  },

  form: {
    name: "Name",
    description: "Description",
    variants: "Variants",
    addOption: "Add option",
    status: "Status",
    collections: "Collections",
    saved: "Saved.",
    saving: "Saving…",
    saveProduct: "Save",
    createProduct: "Create product",
    deleteProduct: "Delete product",
    saveFailed: "Failed to save.",
    optionNamePlaceholder: "Option name (e.g. Size)",
    removeOption: "Remove option",
    removeValueSuffix: "remove",
    valuePlaceholder: "Value + Enter",
    images: "Images",
    cover: "Cover",
    moveLeft: "Left",
    moveRight: "Right",
    removeImage: "Remove",
    uploadFailed: "Upload failed.",
    imageLabel: "Image",
    applyAllPrices: "Apply to all prices",
    applyAllStock: "Apply to all stock",
    bulkPricePlaceholder: "৳",
    bulkStockPlaceholder: "Stock",
    price: "Price",
    priceWithUnit: "Price (৳)",
    stock: "Stock",
    sku: "SKU",
  },

  import: {
    title: "Product import (CSV)",
    subtitle: "Add products in bulk from Excel",
    columnsLabel: "Columns:",
    columnsHelp:
      "is required. status: draft / active / archived (default draft). A default variant is created for each product.",
    sampleCsv: "title,price,inventory,status\nCotton panjabi,1290,20,active\nDenim shirt,990,15,draft",
    insertSample: "Insert sample",
    pastePlaceholder: "Paste CSV here…",
    importing: "Importing…",
    runImport: "Import",
    createdSuffix: "products added.",
    rowErrors: "Row errors:",
    lineLabel: "Line",
    notAdded: "Not added:",
  },
};
