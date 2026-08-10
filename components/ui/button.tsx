import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // `active:` states rather than hover-only: a phone has no hover, so without
  // them nothing on screen acknowledges a tap. select-none stops the long-press
  // text selection that otherwise fires before the tap registers.
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground md:hover:bg-primary/90 active:bg-primary/80',
        destructive:
          'bg-destructive text-destructive-foreground md:hover:bg-destructive/90 active:bg-destructive/80',
        outline: 'border border-input bg-transparent md:hover:bg-accent active:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground md:hover:bg-accent active:bg-accent',
        /** YouTube's grey action pill — Like, Share, Save under a video. */
        pill: 'bg-secondary text-secondary-foreground md:hover:bg-accent active:bg-accent',
        ghost: 'md:hover:bg-accent md:hover:text-accent-foreground active:bg-accent',
        link: 'rounded-md text-primary underline-offset-4 hover:underline',
      },
      size: {
        // 40px and up: Apple and Material both put the minimum tap target at
        // 44px, and these are the smallest that stay comfortable with padding.
        default: 'h-10 px-4',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
        /** The action-row pill: 36px tall, generous horizontal padding. */
        pill: 'h-9 px-3.5',
        icon: 'h-10 w-10',
        /** Bare icon button in the app bar, sized for a thumb. */
        iconLg: 'h-11 w-11 [&_svg]:size-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
