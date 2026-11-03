import { pool, withTransaction } from "@/lib/db";
import { raiseAlert } from "@/lib/systemAlerts";

type Method = "razorpay" | "paypal";

const PROVIDER: Record<Method, string> = { razorpay: "Razorpay", paypal: "PayPal" };

type ClaimRow = {
  id: number;
  user_id: number;
  course_id: number;
  amount: string | null;
  currency: string | null;
  refunded_at: Date | null;
  email: string;
  course_title: string;
};

async function findClaim(method: Method, reference: string): Promise<ClaimRow | null> {
  const result = await pool.query<ClaimRow>(
    `SELECT pc.id, pc.user_id, pc.course_id, pc.amount, pc.currency, pc.refunded_at, u.email, c.title AS course_title
     FROM payment_claims pc JOIN users u ON u.id = pc.user_id JOIN courses c ON c.id = pc.course_id
     WHERE pc.method = $1 AND pc.reference = $2`,
    [method, reference],
  );
  return result.rows[0] || null;
}

/** A provider-confirmed refund. `refundId` makes redelivered webhooks a
 * no-op. A full refund takes PRO away (back to the free modules when the
 * course has them, otherwise off the course), unless another payment still
 * covers it. A partial refund only records it and alerts the owner. */
export async function handleRefund(opts: {
  method: Method;
  reference: string;
  refundId: string;
  /** This refund's amount, in major units (rupees, dollars). */
  amount: number | null;
  /** Total refunded on the payment so far, when the provider reports it. */
  totalRefunded?: number | null;
}): Promise<"unknown_payment" | "duplicate" | "partial" | "revoked" | "kept"> {
  const claim = await findClaim(opts.method, opts.reference);
  const provider = PROVIDER[opts.method];
  if (!claim) {
    await raiseAlert({
      kind: "refund_unmatched",
      dedupeKey: `refund_unmatched:${opts.method}:${opts.refundId}`,
      title: `${provider} refund for a payment we have no record of (${opts.reference})`,
      detail: "No course access was changed. Check the payment in your provider dashboard.",
    });
    return "unknown_payment";
  }

  const paid = Number(claim.amount || 0);
  const total = opts.totalRefunded ?? (claim.refunded_at ? null : opts.amount);
  const full = total != null && paid > 0 && total >= paid - 0.01;

  return withTransaction(async (client) => {
    // The alert row doubles as the idempotency key for this refund, and is
    // written in the same transaction as the access change.
    const inserted = await client.query(
      `INSERT INTO system_alerts (kind, dedupe_key, severity, title, detail, link)
       VALUES ('refund', $1, 'info', $2, $3, '/console/courses/students')
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [
        `refund:${opts.method}:${opts.refundId}`,
        `${full ? "Full" : "Partial"} ${provider} refund: ${claim.email}, ${claim.course_title}`,
        full
          ? `${opts.amount ?? "?"} ${claim.currency || ""} refunded. PRO access was removed automatically unless another payment covers it.`
          : `${opts.amount ?? "?"} ${claim.currency || ""} of ${paid} refunded. Access unchanged; adjust it by hand if needed.`,
      ],
    );
    if ((inserted.rowCount ?? 0) === 0) return "duplicate";

    await client.query(
      `UPDATE payment_claims SET refunded_at = COALESCE(refunded_at, now()),
         refund_amount = COALESCE($2, COALESCE(refund_amount, 0) + COALESCE($3, 0))
       WHERE id = $1`,
      [claim.id, opts.totalRefunded ?? null, opts.amount],
    );
    if (!full) return "partial";

    const otherPayment = await client.query(
      `SELECT 1 FROM payment_claims WHERE user_id = $1 AND course_id = $2 AND id <> $3
         AND status = 'approved' AND refunded_at IS NULL`,
      [claim.user_id, claim.course_id, claim.id],
    );
    if ((otherPayment.rowCount ?? 0) > 0) return "kept";

    const hasFree = await client.query(
      "SELECT 1 FROM course_modules WHERE course_id = $1 AND tier = 'free' LIMIT 1",
      [claim.course_id],
    );
    if ((hasFree.rowCount ?? 0) > 0) {
      await client.query(
        "UPDATE course_enrollments SET tier = 'free', granted_via = 'refund' WHERE user_id = $1 AND course_id = $2",
        [claim.user_id, claim.course_id],
      );
    } else {
      await client.query("DELETE FROM course_enrollments WHERE user_id = $1 AND course_id = $2", [claim.user_id, claim.course_id]);
    }
    return "revoked";
  });
}

/** A chargeback or dispute. Access stays: disputes are often won, so the
 * owner decides. Recorded and raised as urgent because providers set
 * response deadlines. */
export async function handleDispute(opts: { method: Method; reference: string; disputeId: string; reason?: string | null }): Promise<void> {
  const claim = await findClaim(opts.method, opts.reference);
  if (claim) await pool.query("UPDATE payment_claims SET disputed_at = COALESCE(disputed_at, now()) WHERE id = $1", [claim.id]);
  await raiseAlert({
    kind: "dispute",
    dedupeKey: `dispute:${opts.method}:${opts.disputeId}`,
    severity: "critical",
    title: `${PROVIDER[opts.method]} dispute opened${claim ? `: ${claim.email}, ${claim.course_title}` : ` on payment ${opts.reference}`}`,
    detail: `${opts.reason ? `Reason: ${opts.reason}. ` : ""}Respond in your ${PROVIDER[opts.method]} dashboard before its deadline. Course access was not changed.`,
    link: "/console/courses/students",
  });
}
