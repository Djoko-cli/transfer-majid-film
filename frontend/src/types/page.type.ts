import { NextPage } from "next";
import { ReactElement, ReactNode } from "react";

// A page can opt into a persistent layout (currently just the admin
// section's AdminLayout) by assigning `.getLayout` on its default export —
// _app.tsx calls it instead of wrapping the page in the default site
// Header/Container/Footer. "Persistent" because _app.tsx instantiates the
// layout itself, so it isn't remounted when navigating between pages that
// share it.
export type NextPageWithLayout<P = object, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};
