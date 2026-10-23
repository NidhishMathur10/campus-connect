import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canAccess, isRole, OPEN_EXACT_ROUTES, OPEN_ROUTES, PUBLIC_ROUTES, ROLE_HOME, type Role } from "@/config/roles";

/**
 * Runs on every page request (see src/proxy.ts):
 * 1. refreshes the Supabase session cookie,
 * 2. sends signed-out users to /login,
 * 3. keeps each role inside the pages it is allowed to see.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response; // not configured yet: let the page show the error

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims (session refresh).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const { pathname, search } = request.nextUrl;
  const matches = (routes: string[]) =>
    routes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (matches(OPEN_ROUTES) || OPEN_EXACT_ROUTES.includes(pathname)) return response;
  const isPublic = matches(PUBLIC_ROUTES);

  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    if (path === "/login" && pathname !== "/") target.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(target);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!claims) {
    return isPublic ? response : redirectTo("/login");
  }

  const appMeta = (claims.app_metadata ?? {}) as { role?: unknown };
  const role: Role = isRole(appMeta.role) ? appMeta.role : "student";

  if (isPublic) return redirectTo(ROLE_HOME[role]);
  if (!canAccess(role, pathname)) return redirectTo(ROLE_HOME[role]);

  return response;
}
