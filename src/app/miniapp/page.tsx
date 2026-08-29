import { MiniApp } from "@/components/MiniApp";

export const dynamic = "force-dynamic";

export default function MiniAppPage() {
  return (
    <>
      <link rel="preload" href="/miniapp-loft-studio.jpg" as="image" />
      <link rel="preload" href="/miniapp-trainer-product-fast.jpg" as="image" />
      <MiniApp />
    </>
  );
}
