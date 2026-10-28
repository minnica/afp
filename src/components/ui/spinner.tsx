
import { cn } from "@/lib/utils";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";

function Spinner({
  className,
  ...props
}: Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">) {
  return (
    <HugeiconsIcon
      data-slot="spinner"
      icon={Loading03Icon}
      strokeWidth={2}
      role="status"
      aria-label="Cargando"
      className={cn("size-4 animate-spin", className)}
      {...props} />
  );
}

export { Spinner };
