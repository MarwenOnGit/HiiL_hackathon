import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import db from "@/lib/server/db";
import { demoRelationship } from "@/lib/server/data/demoRelationship";
import insaf from "@/lib/server/services/insaf";

// Stands in for "Agent 1 finished ingesting and extracting" until the real
// RAG/extraction agent-service exists. Same output shape either way, so this
// route can be swapped for a real call later without touching anything
// downstream (mirrors backend/src/routes/relationships.js).
export async function POST() {
  const relationship: any = demoRelationship();
  relationship.raw_thread_hash = ethers.keccak256(
    ethers.toUtf8Bytes(relationship.evidence.map((e: any) => e.excerpt).join("\n"))
  );
  db.saveRelationship(relationship);
  return NextResponse.json({ relationship, insaf: insaf.onExtraction(relationship) });
}