import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 font-medium rounded-md border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring-strong disabled:opacity-45 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-white border-primary hover:bg-primary-hover hover:border-primary-hover",
        secondary:
          "bg-surface text-fg border-border-strong hover:bg-hover-soft hover:border-hover-border",
        destructive:
          "bg-danger text-white border-danger hover:bg-danger-hover hover:border-danger-hover focus-visible:ring-danger-ring",
        success:
          "bg-success text-white border-success hover:bg-success-hover hover:border-success-hover disabled:bg-success-disabled disabled:border-success-disabled disabled:opacity-100",
        ghost: "border-transparent bg-transparent text-fg hover:bg-hover-soft",
      },
      size: {
        sm: "text-xs px-3 py-1.5",
        default: "text-sm px-4 py-2",
        lg: "text-base px-5 py-2.5",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type ?? "button"}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
