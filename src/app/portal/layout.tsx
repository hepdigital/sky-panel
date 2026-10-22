import { PortalShell } from "@/components/shell/portal-shell";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return <PortalShell>{children}</PortalShell>;
}
