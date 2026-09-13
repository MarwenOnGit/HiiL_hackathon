import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const relationship = db.getRelationship(id);
  if (!relationship) return NextResponse.json({ error: "relationship not found" }, { status: 404 });
  return NextResponse.json({ relationship });
}