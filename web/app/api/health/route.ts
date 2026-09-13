import { NextResponse } from "next/server";
import insaf from "@/lib/server/services/insaf";
import { chainService } from "@/lib/server/chain";

export async function GET() {
  return NextResponse.json({
    ok: true,
    chain_mode: chainService.mode,
    insaf: insaf.idle()
  });
}