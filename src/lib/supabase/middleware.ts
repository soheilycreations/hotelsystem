import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, ROLE_HOME, ROUTE_ACCESS, type StaffRole } from "@/lib/types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Server-side role check. The in-page RouteGuard only HIDES content, the
  // server component behind it would still render and send its data (e.g.
  // the staff list on /settings/users) — so a page the role can't use is
  // answered with 404 here, before it renders. "/" sends each role to its
  // own landing page instead.
  if (user && !isAuthRoute) {
    const pathname = request.nextUrl.pathname;
    if (isAppPage(pathname)) {
      const { data: role } = await supabase.rpc("get_my_role");
      const staffRole = (role as StaffRole | null) ?? null;
      if (!canAccess(staffRole, pathname)) {
        if (pathname === "/" && staffRole) {
          const url = request.nextUrl.clone();
          url.pathname = ROLE_HOME[staffRole];
          return NextResponse.redirect(url);
        }
        return new NextResponse("Not found", { status: 404 });
      }
    }
  }

  return response;
}

/** True for the app's own pages (anything listed in ROUTE_ACCESS) — Next
 * internals and static files are left alone. */
function isAppPage(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return false;
  return Object.keys(ROUTE_ACCESS).some((route) =>
    route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`)
  );
}
