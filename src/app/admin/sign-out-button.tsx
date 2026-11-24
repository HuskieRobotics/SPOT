"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await fetch("/api/admin/session", { method: "DELETE" }).catch(() => null);
        router.push("/admin/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
