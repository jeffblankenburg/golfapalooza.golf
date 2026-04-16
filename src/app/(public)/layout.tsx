import { SpectatorHeaderBar } from "@/components/SpectatorHeaderBar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SpectatorHeaderBar />
      <main>{children}</main>
    </>
  );
}
