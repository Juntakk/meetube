import { Skeleton } from '@/components/ui/skeleton'

/**
 * Placeholders shaped like the real feed item — full-bleed thumbnail, avatar
 * circle, two title lines — so the layout doesn't jump when results land.
 */
export function VideoGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>
          <Skeleton className="aspect-video w-full rounded-none sm:rounded-xl" />

          <div className="flex gap-3 px-3 pb-3 pt-2.5 sm:mt-3 sm:px-0 sm:pb-0 sm:pt-0">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
