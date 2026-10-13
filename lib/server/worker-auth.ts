import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWorkerRequest(raw: string, signature: string | null, timestamp: string | null) {
  const secret = process.env.WORKER_INGEST_SECRET;
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature) || !timestamp || !/^\d+$/.test(timestamp)) return false;

  const time = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(time) || Math.abs(now - time) > 300) return false;

  const expected = createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
  return timingSafeEqual(Buffer.from(signature.slice(7), "hex"), Buffer.from(expected, "hex"));
}
