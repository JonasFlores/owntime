import { NextRequest, NextResponse } from "next/server";

// Language picker uses ?lang=pt|en on any URL: we store the cookie,
// strip the param and redirect, so URLs stay clean.
export function middleware(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  if (lang !== "pt" && lang !== "en") return NextResponse.next();

  const url = new URL(req.url);
  url.searchParams.delete("lang");
  const res = url.toString() === req.url ? NextResponse.next() : NextResponse.redirect(url);
  res.cookies.set("lang", lang, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico).*)"],
};
