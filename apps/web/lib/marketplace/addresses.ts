import "server-only";

import { withBuyer } from "@hybrid/db";

export interface BuyerAddress {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  division: string;
  district: string;
  thana: string;
  addressLine: string;
  isDefault: boolean;
}

export interface AddressInput {
  label?: string | null;
  recipientName: string;
  phone: string;
  division: string;
  district: string;
  thana: string;
  addressLine: string;
  isDefault?: boolean;
}

function toAddress(r: {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  division: string;
  district: string;
  thana: string;
  address_line: string;
  is_default: boolean;
}): BuyerAddress {
  return {
    id: r.id,
    label: r.label,
    recipientName: r.recipient_name,
    phone: r.phone,
    division: r.division,
    district: r.district,
    thana: r.thana,
    addressLine: r.address_line,
    isDefault: r.is_default,
  };
}

export async function listBuyerAddresses(buyerId: string): Promise<BuyerAddress[]> {
  const rows = await withBuyer(buyerId, (tx) =>
    tx<{
      id: string; label: string | null; recipient_name: string; phone: string;
      division: string; district: string; thana: string; address_line: string; is_default: boolean;
    }[]>`
      select id, label, recipient_name, phone, division, district, thana, address_line, is_default
        from marketplace_address
       where buyer_id = ${buyerId}
       order by is_default desc, created_at desc
    `,
  );
  return rows.map(toAddress);
}

export async function saveBuyerAddress(buyerId: string, input: AddressInput): Promise<string> {
  if (input.isDefault) {
    await withBuyer(buyerId, (tx) =>
      tx`update marketplace_address set is_default = false where buyer_id = ${buyerId}`,
    );
  }
  const rows = await withBuyer(buyerId, (tx) =>
    tx<{ id: string }[]>`
      insert into marketplace_address
        (buyer_id, label, recipient_name, phone, division, district, thana, address_line, is_default)
      values
        (${buyerId}, ${input.label ?? null}, ${input.recipientName}, ${input.phone},
         ${input.division}, ${input.district}, ${input.thana}, ${input.addressLine},
         ${input.isDefault ?? false})
      returning id
    `,
  );
  return rows[0]!.id;
}

export async function updateBuyerAddress(
  buyerId: string,
  id: string,
  input: AddressInput,
): Promise<void> {
  if (input.isDefault) {
    await withBuyer(buyerId, (tx) =>
      tx`update marketplace_address set is_default = false where buyer_id = ${buyerId} and id != ${id}`,
    );
  }
  await withBuyer(buyerId, (tx) =>
    tx`
      update marketplace_address set
        label = ${input.label ?? null},
        recipient_name = ${input.recipientName},
        phone = ${input.phone},
        division = ${input.division},
        district = ${input.district},
        thana = ${input.thana},
        address_line = ${input.addressLine},
        is_default = ${input.isDefault ?? false},
        updated_at = now()
      where id = ${id} and buyer_id = ${buyerId}
    `,
  );
}

export async function setDefaultAddress(buyerId: string, id: string): Promise<void> {
  await withBuyer(buyerId, async (tx) => {
    await tx`update marketplace_address set is_default = false where buyer_id = ${buyerId}`;
    await tx`update marketplace_address set is_default = true where id = ${id} and buyer_id = ${buyerId}`;
  });
}

export async function deleteBuyerAddress(buyerId: string, id: string): Promise<void> {
  await withBuyer(buyerId, (tx) =>
    tx`delete from marketplace_address where id = ${id} and buyer_id = ${buyerId}`,
  );
}
