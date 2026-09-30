import { buddyRpc } from './buddy/api'
import { fetchStories } from './stories'
import { fetchCommunityBySlug, fetchMyPracticeEdges, fetchProfilesByIds } from './practice'
import { buildBuddyContext, buildStoriesContext, buildCircleContext } from './askMutuExtras'

// Each source fails independently, so an unavailable Story Garden cannot hide
// verified relationships or the member's Buddy Program record.
export async function loadAskMutuContextExtras(userId) {
  if (!userId) return { buddy: null, stories: null, circle: null }
  const community = fetchCommunityBySlug('rotman').catch(() => ({ data: null }))
  const [buddy, stories, circle] = await Promise.allSettled([
    (async () => {
      const listing = await buddyRpc('buddy_choice_state')
      const programStates = await Promise.all((listing?.programs || []).slice(0, 10).map(async program => {
        const [state, assigned] = await Promise.all([
          buddyRpc('buddy_choice_state', { p_program: program.id }),
          buddyRpc('buddy_assigned_state', { p_program: program.id }).catch(() => null),
        ])
        return { program, state, assigned }
      }))
      return buildBuddyContext({ programStates })
    })(),
    (async () => {
      const { data: comm } = await community
      if (!comm?.id) throw new Error('Community unavailable')
      const result = await fetchStories({ communityId: comm.id, view: 'mine', limit: 10 })
      if (result.error) throw result.error
      return buildStoriesContext({ stories: result.data?.items || [], userId })
    })(),
    (async () => {
      const result = await fetchMyPracticeEdges()
      if (result.error) throw result.error
      const edges = (result.data || []).filter(e => e.user_lo === userId || e.user_hi === userId)
      const ids = [...new Set(edges.map(e => e.user_lo === userId ? e.user_hi : e.user_lo))]
      const profiles = await fetchProfilesByIds(ids)
      if (profiles.error) throw profiles.error
      return buildCircleContext({ edges, namesById: profiles.data || {}, userId })
    })(),
  ])
  const sources = { buddy, my_stories: stories, strongest_relationships: circle }
  return {
    buddy: buddy.status === 'fulfilled' ? buddy.value : null,
    stories: stories.status === 'fulfilled' ? stories.value : null,
    circle: circle.status === 'fulfilled' ? circle.value : null,
    unavailableSources: Object.entries(sources).filter(([, result]) => result.status === 'rejected').map(([name]) => name),
  }
}
