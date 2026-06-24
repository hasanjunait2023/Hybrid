// Paperfly courier adapter — SKELETON. Interface-conformant, but every operation
// throws CourierNotConfiguredError("paperfly"). Paperfly issues credentials
// per-merchant with no public sandbox and no public API docs; this is an explicit
// not-configured stub (NEVER a silent fake-success), to be implemented once the
// founder obtains Paperfly merchant credentials + docs. Live build is deferred to
// Phase 3 per the blueprint; the union and DB enum already include "paperfly".
import type {
  CourierAdapter,
  CourierCreds,
  ConsignmentInput,
  ConsignmentResult,
  StatusResult,
} from "../types";
import { CourierNotConfiguredError } from "../types";

export class PaperflyProvider implements CourierAdapter {
  readonly provider = "paperfly" as const;

  async createConsignment(_input: ConsignmentInput, _creds: CourierCreds): Promise<ConsignmentResult> {
    throw new CourierNotConfiguredError("paperfly");
  }

  async getStatus(_consignmentId: string, _creds: CourierCreds): Promise<StatusResult> {
    throw new CourierNotConfiguredError("paperfly");
  }

  async getBalance(_creds: CourierCreds): Promise<number> {
    throw new CourierNotConfiguredError("paperfly");
  }
}
