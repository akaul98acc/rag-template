import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import { cn } from "@/lib/utils";

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn("inline-flex items-center justify-center gap-1", className)}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Root>
));
ToggleGroup.displayName = "ToggleGroup";

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-hover-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-surface data-[state=on]:text-primary data-[state=on]:shadow-sm",
      className
    )}
    {...props}
  >
    {children}
  </ToggleGroupPrimitive.Item>
));
ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem };
