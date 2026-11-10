'use client'

import { PanelLeft, PanelLeftClose } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useRailPin } from '@/lib/rail-channels'

type PinToRailButtonProps = {
  channelId: string
  title: string
}

/**
 * Adds a shortcut to this channel in the side rail (and the phone's avatar
 * strip) next to the built-in ones. Local to this device, like Follow.
 */
export function PinToRailButton({ channelId, title }: PinToRailButtonProps) {
  const { isPinned, toggle } = useRailPin(channelId)

  if (!channelId) return null

  return (
    <Button
      variant="pill"
      size="pill"
      aria-pressed={isPinned}
      onClick={() => toggle({ id: channelId, title })}
      title={isPinned ? `Remove ${title} from the sidebar` : `Add ${title} to the sidebar`}
    >
      {isPinned ? <PanelLeftClose /> : <PanelLeft />}
      {isPinned ? 'In sidebar' : 'Add to sidebar'}
    </Button>
  )
}
