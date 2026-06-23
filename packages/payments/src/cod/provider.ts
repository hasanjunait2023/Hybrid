// Cash-on-delivery provider. No gateway, no network: createPayment confirms
// instantly ("success" state — the order is placed; collection happens at
// delivery). execute/query are no-ops that echo the confirmed state. refund is
// not offered (COD has no captured funds to reverse here). creds are optional.
import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  ExecutePaymentInput,
  ExecutePaymentResult,
  QueryPaymentInput,
  QueryPaymentResult,
} from "../types";

export class CodProvider implements PaymentProvider {
  readonly provider = "cod" as const;

  // Instant confirm. The order is considered placed; cod_amount = order total is
  // set by the commerce layer, payment_status stays unpaid until delivery.
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      state: "success",
      paymentId: input.merchantInvoiceNumber,
      raw: { confirmed: true, method: "cod" },
    };
  }

  async executePayment(input: ExecutePaymentInput): Promise<ExecutePaymentResult> {
    // No-op: COD has no gateway execute step.
    return { state: "success", raw: { paymentId: input.paymentId, method: "cod" } };
  }

  async queryPayment(input: QueryPaymentInput): Promise<QueryPaymentResult> {
    // No-op: status is whatever the order/fulfillment layer tracks.
    return { state: "success", raw: { paymentId: input.paymentId, method: "cod" } };
  }
}
