import { NextResponse } from "next/server";
import oauth from "@/lib/server/services/googleOAuth";
import { sessionCookieHeader } from "@/lib/server/services/sessionAuth";

function sanitize(user: any) {
  return {
    user_id: user.user_id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    is_demo: Boolean(user.is_demo)
  };
}

export async function POST() {
  const user = oauth.demoUser();
  const session = oauth.startSessionFor(user);
  const res = NextResponse.json({ user: sanitize(user), note: "demo account — seeded data only" });
  res.headers.set("Set-Cookie", sessionCookieHeader(session));
  return res;
}