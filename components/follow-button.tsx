'use client'

import { Bell, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useFollowedChannels } from '@/lib/followed-channels'

type FollowButtonProps = {
  channelId: string
  title: string
  avatar?: string
  className?: string
}

/**
 * Occupies the slot where YouTube puts Subscribe, and does the local equivalent:
 * adds the channel to the home feed's seeds.
 *
 * Not called "Subscribe", because it isn't one — MeeTube's YouTube access is
 * read-only and nothing here reaches your Google account. "Following" is the
 * honest word for a list that only this device knows about.
 */
export function FollowButton({ channelId, title, avatar, className }: FollowButtonProps) {
  const { followedIds, toggle } = useFollowedChannels()

  if (!channelId) return null

  const following = followedIds.has(channelId)

  return (
    <Button
      // Filled when it's the action to take, quiet once it's done — the same
      // inversion YouTube uses between Subscribe and Subscribed.
      variant={following ? 'pill' : 'default'}
      size="pill"
      className={className}
      aria-pressed={following}
      onClick={() => toggle({ id: channelId, title, avatar })}
      title={
        following
          ? `Stop seeding your home feed from ${title}`
          : `Show more from ${title} on your home feed`
      }
    >
      {following ? <Bell /> : <Plus />}
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}
