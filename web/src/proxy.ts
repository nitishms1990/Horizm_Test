import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps signed-out visitors on the login page. This is a convenience only: the API
 * checks the session on every request, so a forged cookie here gets nothing back.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("horizm_session");
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|media|_next/static|_next/image|favicon.ico).*)"],
};
