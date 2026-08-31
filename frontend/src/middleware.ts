import { jwtDecode } from "jwt-decode";
import { NextRequest, NextResponse } from "next/server";
import configService from "./services/config.service";
import { getDefaultConfig } from "./utils/defaultConfig.util";

// This middleware redirects based on different conditions:
// - Authentication state
// - Setup status
// - Admin privileges

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next).*)",
};

async function fetchConfig(apiUrl: string): Promise<any> {
  try {
    const response = await fetch(`${apiUrl}/api/configs`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(1000),
    });

    if (!response.ok) {
      throw new Error(`Config fetch failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Config fetch failed, using defaults:", error);
    return getDefaultConfig();
  }
}

// A fresh instance (no users at all yet) has no obvious way to become admin
// from the public upload page — this lets every route converge on sign-up
// until the first account (which auto-becomes admin, see auth.service.ts)
// exists. Defaults to false on any fetch failure so a transient backend
// hiccup doesn't lock an already-set-up instance out of its own site.
async function fetchNeedsSetup(apiUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/api/auth/needsSetup`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(1000),
    });

    if (!response.ok) {
      throw new Error(`needsSetup fetch failed: ${response.status}`);
    }

    return (await response.json()).needsSetup === true;
  } catch (error) {
    console.error("needsSetup fetch failed, assuming false:", error);
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const routes = {
    unauthenticated: new Routes(["/auth/*"]),
    public: new Routes([
      "/share/*",
      "/s/*",
      "/upload/*",
      "/error",
      "/imprint",
      "/privacy",
    ]),
    admin: new Routes(["/admin/*"]),
    account: new Routes(["/account*"]),
    disabled: new Routes([]),
  };

  // Get config from backend with caching and error handling
  const apiUrl = process.env.API_URL || "http://localhost:8080";
  const [config, needsSetup] = await Promise.all([
    fetchConfig(apiUrl),
    fetchNeedsSetup(apiUrl),
  ]);

  const getConfig = (key: string) => {
    return configService.get(key, config);
  };

  const route = request.nextUrl.pathname;
  let user: { isAdmin: boolean } | null = null;
  const accessToken = request.cookies.get("access_token")?.value;

  try {
    const claims = jwtDecode<{ exp: number; isAdmin: boolean }>(
      accessToken as string,
    );
    if (claims.exp * 1000 > Date.now()) {
      user = claims;
    }
  } catch {
    user = null;
  }

  if (!getConfig("share.allowRegistration")) {
    routes.disabled.routes.push("/auth/signUp");
  }

  // Anonymous uploads and site-wide visibility are the same decision here —
  // if signed-out visitors can create shares, they need to see the site to
  // do it; if they can't, there's nothing for them to see. One flag for
  // both (see share.allowUnauthenticatedShares) rather than a second,
  // separately-configurable "is the site public" toggle that only ever
  // mattered in the narrow, currently-unused case of shares being anonymous
  // but the site not being public.
  if (getConfig("share.allowUnauthenticatedShares")) {
    routes.public.routes = ["*"];
  }

  if (!getConfig("smtp.enabled")) {
    routes.disabled.routes.push("/auth/resetPassword*");
  }

  if (!getConfig("legal.enabled")) {
    routes.disabled.routes.push("/imprint", "/privacy");
  } else {
    if (!getConfig("legal.imprintText")) {
      routes.disabled.routes.push("/imprint");
    }
    if (!getConfig("legal.privacyPolicyText")) {
      routes.disabled.routes.push("/privacy");
    }
  }

  // prettier-ignore
  const rules = [
    // No admin exists yet — converge everything on sign-up instead of
    // showing the normal (public, pre-admin) site with no obvious way in.
    // Guarded on allowRegistration so a fresh instance with registration
    // disabled doesn't deadlock against the "Disabled routes" rule below,
    // which would otherwise bounce /auth/signUp right back to "/".
    {
      condition: needsSetup && route !== "/auth/signUp" && getConfig("share.allowRegistration"),
      path: "/auth/signUp",
    },
    // Disabled routes
    {
      condition: routes.disabled.contains(route),
      path: "/",
    },
     // Authenticated state
     {
      condition: user && routes.unauthenticated.contains(route) && !getConfig("share.allowUnauthenticatedShares"),
      path: "/",
    },
    // Unauthenticated state
    {
      condition: !user && !routes.public.contains(route) && !routes.unauthenticated.contains(route),
      path: "/auth/signIn",
    },
    {
      condition: !user && routes.account.contains(route),
      path: "/",
    },
    // Admin privileges
    {
      condition: routes.admin.contains(route) && !user?.isAdmin,
      path: "/",
    },
  ];
  for (const rule of rules) {
    if (rule.condition) {
      let { path } = rule;

      if (path == "/auth/signIn") {
        path = path + "?redirect=" + encodeURIComponent(route);
      }
      const response = NextResponse.redirect(new URL(path, request.url));
      response.headers.set("Vary", "x-nextjs-data");
      return response;
    }
  }
}

// Helper class to check if a route matches a list of routes
class Routes {
  // eslint-disable-next-line no-unused-vars
  constructor(public routes: string[]) {}

  contains(_route: string) {
    for (const route of this.routes) {
      if (new RegExp("^" + route.replace(/\*/g, ".*") + "$").test(_route))
        return true;
    }
    return false;
  }
}
