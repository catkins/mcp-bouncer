import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  size?: 'sm' | 'md' | 'lg';
}

function Switch({
  className,
  size = 'md',
  ...props
}: SwitchProps) {
  const sizeClasses = {
    sm: {
      root: "h-4 w-7",
      thumb: "size-3 data-[state=checked]:translate-x-[calc(100%-1px)]"
    },
    md: {
      root: "h-6 w-11",
      thumb: "size-5 data-[state=checked]:translate-x-[calc(100%-1px)]"
    },
    lg: {
      root: "h-7 w-14",
      thumb: "size-6 data-[state=checked]:translate-x-[calc(100%-1px)]"
    }
  };

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700 dark:data-[state=checked]:bg-primary",
        sizeClasses[size].root,
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full ring-0 transition-transform data-[state=unchecked]:translate-x-0",
          "bg-white dark:bg-white shadow-sm",
          sizeClasses[size].thumb
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
