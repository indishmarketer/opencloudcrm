import { pool } from "@/lib/db";
import { sendApprovedEmail } from "@/lib/directoryReview";
import { raiseInboxAlert } from "@/lib/systemAlerts";

export type ListingPaymentProvider = "razorpay" | "paypal";
export type ListingPaymentCurrency = "INR" | "USD";

export type DirectoryListingOrder = {
  id: string;
  tool_id: number;
  user_id: number;
  provider: ListingPaymentProvider;
  amount_minor: number;
  currency: ListingPaymentCurrency;
  status: "created" | "paid" | "expired";
  provider_order_id: string | null;
  payment_reference: string | null;
  created_at: Date;
};

/** Statuses a paid listing can be charged for. Exported because the two
 * create-order routes check the listing before reserving, and a second
 * hardcoded list in each of them is how the two drift apart. */
export const PAYABLE_STATUSES = ["pending", "approved_unpaid"] as const;

export function isPayableListingStatus(status: string): boolean {
  return (PAYABLE_STATUSES as readonly string[]).includes(status);
}

export type ReserveListingOrderResult =
  | { state: "reserved"; order: DirectoryListingOrder }
  | { state: "reuse"; order: DirectoryListingOrder }
  | { state: "busy" }
  | { state: "paid" };

/** Reserve one live checkout for a listing/provider. The advisory lock keeps
 * two tabs from creating two provider orders at once. */
export async function reserveDirectoryListingOrder(input: {
  toolId: number;
  userId: number;
  provider: ListingPaymentProvider;
  amountMinor: number;
  currency: ListingPaymentCurrency;
}): Promise<ReserveListingOrderResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `directory-listing-order:${input.toolId}:${input.provider}`,
    ]);
    const tool = await client.query<{ status: string; paid_at: Date | null }>(
      `SELECT status, paid_at FROM directory_tools
       WHERE id = $1 AND submitted_by_user_id = $2 AND listing_tier = 'paid'
       FOR UPDATE`,
      [input.toolId, input.userId],
    );
    // Paying is allowed both before and after review. The owner wanted the
    // $5 tier payable in the submit flow itself, so a brand new 'pending'
    // listing can be paid for and goes into the reviewed-first queue;
    // 'approved_unpaid' is the older path, where review came first and the
    // payment email arrived afterwards. Everything else (published, already
    // paid, rejected) has nothing to charge for.
    if (!tool.rows[0] || !isPayableListingStatus(tool.rows[0].status)) {
      await client.query("ROLLBACK");
      return tool.rows[0]?.paid_at ? { state: "paid" } : { state: "busy" };
    }

    const previous = await client.query<DirectoryListingOrder & { stale: boolean }>(
      `SELECT id, tool_id, user_id, provider, amount_minor, currency, status, provider_order_id, payment_reference,
              created_at, created_at < now() - interval '30 minutes' AS stale
       FROM directory_listing_orders
       WHERE tool_id = $1 AND provider = $2 AND status = 'created'
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.toolId, input.provider],
    );
    const old = previous.rows[0];
    if (old) {
      if (
        old.provider_order_id && !old.stale &&
        old.amount_minor === input.amountMinor && old.currency === input.currency
      ) {
        await client.query("COMMIT");
        return { state: "reuse", order: old };
      }
      if (!old.provider_order_id && !old.stale) {
        await client.query("COMMIT");
        return { state: "busy" };
      }
      await client.query("UPDATE directory_listing_orders SET status = 'expired' WHERE id = $1", [old.id]);
    }

    const inserted = await client.query<DirectoryListingOrder>(
      `INSERT INTO directory_listing_orders (tool_id, user_id, provider, amount_minor, currency)
       VALUES ($1, $2, $3, $4, $5)
      RETURNING id, tool_id, user_id, provider, amount_minor, currency, status, provider_order_id, payment_reference, created_at`,
      [input.toolId, input.userId, input.provider, input.amountMinor, input.currency],
    );
    await client.query("COMMIT");
    return { state: "reserved", order: inserted.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function attachDirectoryListingProviderOrder(
  id: string,
  providerOrderId: string,
): Promise<void> {
  await pool.query(
    "UPDATE directory_listing_orders SET provider_order_id = $2 WHERE id = $1 AND status = 'created'",
    [id, providerOrderId],
  );
}

export async function expireDirectoryListingOrder(id: string): Promise<void> {
  await pool.query("UPDATE directory_listing_orders SET status = 'expired' WHERE id = $1 AND status = 'created'", [id]);
}

export async function getDirectoryListingOrder(
  provider: ListingPaymentProvider,
  providerOrderId: string,
): Promise<DirectoryListingOrder | null> {
  const result = await pool.query<DirectoryListingOrder>(
    `SELECT id, tool_id, user_id, provider, amount_minor, currency, status, provider_order_id, payment_reference
     FROM directory_listing_orders WHERE provider = $1 AND provider_order_id = $2 LIMIT 1`,
    [provider, providerOrderId],
  );
  return result.rows[0] ?? null;
}

export type SettleListingPaymentResult = "paid" | "already_paid" | "mismatch" | "unmatched";

/** Record only provider-confirmed payments. The payment reference uniqueness
 * and listing update happen in one transaction, so webhook retries cannot
 * publish twice or attach the same charge to two listings. */
export async function settleDirectoryListingPayment(input: {
  provider: ListingPaymentProvider;
  providerOrderId: string;
  paymentReference: string;
  amountMinor: number;
  currency: string | null;
}): Promise<SettleListingPaymentResult> {
  const client = await pool.connect();
  let toolId: number | null = null;
  let pendingToolId: number | null = null;
  try {
    await client.query("BEGIN");
    const result = await client.query<DirectoryListingOrder>(
      `SELECT id, tool_id, user_id, provider, amount_minor, currency, status, provider_order_id, payment_reference
       FROM directory_listing_orders WHERE provider = $1 AND provider_order_id = $2 FOR UPDATE`,
      [input.provider, input.providerOrderId],
    );
    const order = result.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return "unmatched";
    }
    if (order.status === "paid" && order.payment_reference === input.paymentReference) {
      await client.query("COMMIT");
      return "already_paid";
    }
    if (
      order.status !== "created" || order.amount_minor !== input.amountMinor ||
      order.currency !== input.currency || !input.paymentReference.trim()
    ) {
      await client.query("ROLLBACK");
      return "mismatch";
    }

    await client.query(
      `UPDATE directory_listing_orders
       SET status = 'paid', payment_reference = $2, paid_at = now()
       WHERE id = $1`,
      [order.id, input.paymentReference],
    );
    // A listing already approved goes live the moment the charge clears. One
    // paid before review stays 'pending' and keeps its place in the queue:
    // taking the money cannot be what publishes an unreviewed listing, or
    // the $5 tier becomes pay-to-rank, which is the one thing the directory
    // promises it is not. The reviewer's approve publishes it.
    const settled = await client.query<{ status: string }>(
      `UPDATE directory_tools
       SET status = CASE WHEN status = 'approved_unpaid' THEN 'published' ELSE status END,
           paid_amount_cents = $2, paid_currency = $3,
           paid_at = now(), payment_reference = $4, updated_at = now()
       WHERE id = $1 AND submitted_by_user_id = $5 AND listing_tier = 'paid'
         AND status IN ('pending', 'approved_unpaid') AND paid_at IS NULL
       RETURNING status`,
      [order.tool_id, input.amountMinor, input.currency, input.paymentReference, order.user_id],
    );
    if (!settled.rowCount) {
      await client.query("ROLLBACK");
      return "mismatch";
    }
    if (settled.rows[0].status === "published") toolId = order.tool_id;
    else pendingToolId = order.tool_id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if ((error as { code?: string })?.code === "23505") return "mismatch";
    throw error;
  } finally {
    client.release();
  }

  if (toolId !== null) {
    void sendApprovedEmail(toolId).catch((error) => console.error("Paid listing approval email failed:", error));
    void raiseInboxAlert({
      kind: "directory_listing_paid",
      dedupeKey: `directory_listing_paid:${toolId}`,
      title: "A paid directory listing is live",
      detail: `Listing #${toolId} passed review and its payment was confirmed.`,
      link: "/console/directory",
    });
  }
  if (pendingToolId !== null) {
    // Paid before review. The reviewer needs to know, because this one has
    // been promised a faster decision and a refund if it is turned down.
    void raiseInboxAlert({
      kind: "directory_listing_paid",
      dedupeKey: `directory_listing_paid:${pendingToolId}`,
      title: "A paid directory listing is waiting for review",
      detail: `Listing #${pendingToolId} has paid its $5 fee and has not been reviewed yet. Refund it if you reject it.`,
      link: "/console/directory",
    });
  }
  return "paid";
}
