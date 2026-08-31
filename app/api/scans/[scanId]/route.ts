import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/server/auth";
import { getOwnedScan, scanResponse } from "../../../../lib/server/data";
import { handleError } from "../../../../lib/server/http";
export async function GET(_: Request, { params }: { params: Promise<{ scanId: string }> }) { try { const session = await requireSession(); return NextResponse.json(scanResponse(await getOwnedScan((await params).scanId, session))); } catch (error) { return handleError(error); } }
