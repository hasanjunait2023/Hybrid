// Steadfast courier adapter. PURE: fetch + creds injected per-call.
//
// Base https://portal.steadfast.com.bd/api/v1. Auth via Api-Key / Secret-Key
// headers. No sandbox exists → this is contract-tested against the documented
// request/response shapes; live verification is deferred until a merchant
// account exists (see Phase-1 brief).
//
//   create  POST /create_order  {invoice, recipient_name, recipient_phone,
//                                recipient_address, cod_amount, note}
//             → consignment.{consignment_id, tracking_code}
//   status  GET  /status_by_cid/{id}  → {delivery_status}
//   balance GET  /get_balance         → {current_balance}
import type {
  CourierAdapter,
  CourierCreds,
  FetchLike,
  ConsignmentInput,
  ConsignmentResult,
  StatusResult,
} from "./types";
import { mapSteadfastStatus } from "./statusMap";

const BASE_URL = "https://portal.steadfast.com.bd/api/v1";

export interface SteadfastProviderOptions {
  fetch: FetchLike;
}

export class SteadfastProvider implements CourierAdapter {
  readonly provider = "steadfast" as const;

  private readonly fetch: FetchLike;

  constructor(opts: SteadfastProviderOptions) {
    this.fetch = opts.fetch;
  }

  private headers(creds: CourierCreds): Record<string, string> {
    return {
      "Api-Key": creds.apiKey,
      "Secret-Key": creds.secretKey,
      "Content-Type": "application/json",
    };
  }

  async createConsignment(input: ConsignmentInput, creds: CourierCreds): Promise<ConsignmentResult> {
    const res = await this.fetch(`${BASE_URL}/create_order`, {
      method: "POST",
      headers: this.headers(creds),
      body: JSON.stringify({
        invoice: input.invoice,
        recipient_name: input.recipient_name,
        recipient_phone: input.recipient_phone,
        recipient_address: input.recipient_address,
        cod_amount: Math.round(input.cod_amount), // Steadfast expects an integer
        note: input.note ?? "",
      }),
    });

    const body = (await res.json()) as {
      status?: number;
      consignment?: { consignment_id?: number | string; tracking_code?: string };
      message?: string;
    };

    const consignment = body.consignment;
    if (!consignment?.consignment_id || !consignment.tracking_code) {
      throw new Error(`Steadfast create_order failed: ${body.message ?? res.status}`);
    }

    return {
      consignmentId: String(consignment.consignment_id),
      trackingCode: consignment.tracking_code,
      raw: body,
    };
  }

  async getStatus(consignmentId: string, creds: CourierCreds): Promise<StatusResult> {
    const res = await this.fetch(`${BASE_URL}/status_by_cid/${consignmentId}`, {
      method: "GET",
      headers: this.headers(creds),
    });

    const body = (await res.json()) as { delivery_status?: string; status?: number };
    const mapped = mapSteadfastStatus(body.delivery_status ?? "");

    return {
      status: mapped.shipment_status,
      fulfillment: mapped.order_fulfillment_status,
      raw: body,
    };
  }

  async getBalance(creds: CourierCreds): Promise<number> {
    const res = await this.fetch(`${BASE_URL}/get_balance`, {
      method: "GET",
      headers: this.headers(creds),
    });

    const body = (await res.json()) as { current_balance?: number; status?: number };
    return body.current_balance ?? 0;
  }
}
