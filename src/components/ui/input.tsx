"use client"

import { NumberInput } from "@/components/ui/number-input";
import * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & {
  density?: "compact" | "comfortable";
};

function InputBase({
  className,
  type,
  density = "compact",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-input/20 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        density === "comfortable"
          ? "min-h-12 px-3 py-2 text-base"
          : "h-7 px-2 py-0.5 text-sm md:text-xs/relaxed",
        type === "number" &&
          "[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none",
        className
      )}
      {...props} />
  );
}

function Input({ type, formatNumber = false, ...props }: InputProps & { formatNumber?: boolean }) {
  if (type === "number" && formatNumber) {
    return <NumberInput customInput={InputBase} {...props} value={Array.isArray(props.value) ? props.value.join(",") : props.value as string | number | undefined} defaultValue={Array.isArray(props.defaultValue) ? props.defaultValue.join(",") : props.defaultValue as string | number | undefined} />
  }
  return <InputBase type={type} {...props} />
}

export { Input };
