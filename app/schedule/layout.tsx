import { ReactNode } from "react";
import { Providers } from "~/components/providers";

export default function Layout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
