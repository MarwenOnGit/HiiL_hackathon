import { NextResponse } from "next/server";
import db from "@/lib/server/db";
import { chainService } from "@/lib/server/chain";

export async function GET() {
  return NextResponse.json({ rows: db.dashboardRows(), chain_mode: chainService.mode });
}