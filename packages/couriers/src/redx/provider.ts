// RedX courier adapter — SKELETON. Interface-conformant, but every operation
// throws CourierNotConfiguredError("redx"). RedX has no public API docs and its
// auth model was unverifiable during Phase-2 research; this is an explicit
// not-configured stub (NEVER a silent fake-success), to be implemented once the
// founder obtains RedX developer credentials + docs. The union and DB enum
// already include "redx" so wiring this in later is a single-file change.
import type {
  CourierAdapter,
  CourierCreds,
  ConsignmentInput,
  ConsignmentResult,
  StatusResult,
} from "../types";
import { CourierNotConfiguredError } from "../types";

export class RedxProvider implements CourierAdapter {
  readonly provider = "redx" as const;

  async createConsignment(_input: ConsignmentInput, _creds: CourierCreds): Promise<ConsignmentResult> {
    throw new CourierNotConfiguredError("redx");
  }

  async getStatus(_consignmentId: string, _creds: CourierCreds): Promise<StatusResult> {
    throw new CourierNotConfiguredError("redx");
  }

  async getBalance(_creds: CourierCreds): Promise<number> {
    throw new CourierNotConfiguredError("redx");
  }
}
