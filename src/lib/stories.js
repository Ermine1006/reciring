import { supabase, isSupabaseConfigured } from './supabase'
import { validateStory } from '../data/storiesContent'

// Stories never use aiRewrite, Ask Mutu, matching, profile backfills, or Tokens.
// No caller supplies an author/reporter id. Raw tables are not client-readable.
async function rpc(name, args = {}) {
  if (!isSupabaseConfigured) return { data: null, error: { code: 'UNCONFIGURED', message: 'Story Garden needs a connection.' } }
  try {
    return await supabase.rpc(name, args)
  } catch {
    return { data: null, error: { code: 'NETWORK', message: 'Story connection failed.' } }
  }
}
export const fetchStoryAccess = communityId => rpc('story_access', { p_community_id: communityId })
export const fetchStoryNotebook = communityId => rpc('story_notebook_get', { p_community_id: communityId })
export const saveStoryNotebook = (communityId, cover) => rpc('story_notebook_save', {
  p_community_id: communityId, p_color: cover.color, p_stamp: cover.stamp,
  p_pen_name: cover.pen_name, p_expected_version: cover.version,
})
export const fetchStories = ({ communityId, view = 'garden', topic = null, cursor = null, limit = 4 }) =>
  rpc('story_list', { p_community_id: communityId, p_view: view, p_topic: topic,
    p_before: cursor?.at || null, p_before_id: cursor?.id || null, p_limit: limit })
export const fetchStory = storyId => rpc('story_get', { p_story_id: storyId })
export function saveStory({ communityId, draft, publish = false, pledge = false }) {
  const invalid = validateStory(draft, { publish, pledge })
  if (invalid) return Promise.resolve({ data: null, error: { code: 'CLIENT_INPUT', message: invalid } })
  return rpc('story_save', {
    p_id: draft.id, p_community_id: communityId, p_title: draft.title, p_body: draft.body,
    p_topic: draft.topic, p_identity_mode: draft.identity_mode, p_response_mode: draft.response_mode,
    p_expected_version: draft.version || 0, p_publish: publish, p_pledge: pledge,
  })
}
export const withdrawStory = story => rpc('story_withdraw', { p_story_id: story.id, p_expected_version: story.version })
export const setStoryBookmark = (id, value) => rpc('story_set_bookmark', { p_story_id: id, p_value: value })
export const setStoryReaction = (id, kind, value) => rpc('story_set_reaction', { p_story_id: id, p_kind: kind, p_value: value })
export const fetchStoryReplies = (id, cursor = null) => rpc('story_list_replies', {
  p_story_id: id, p_before: cursor?.at || null, p_before_id: cursor?.id || null, p_limit: 20,
})
export const saveStoryReply = (storyId, reply) => rpc('story_save_reply', {
  p_story_id: storyId, p_id: reply.id, p_body: reply.body, p_identity_mode: reply.identity_mode,
  p_expected_version: reply.version || 0,
  p_pledge: reply.pledge === true,
})
export const deleteStoryReply = reply => rpc('story_delete_reply', { p_reply_id: reply.id, p_expected_version: reply.version })
export const reportStory = ({ storyId, replyId = null, reason, details = '' }) =>
  rpc('story_report', { p_story_id: storyId, p_reply_id: replyId, p_reason: reason, p_details: details })
export const muteStoryWriter = (storyId, replyId = null) => rpc('story_mute_writer', { p_story_id: storyId, p_reply_id: replyId })
export const clearStoryMutes = () => rpc('story_clear_mutes')
export const fetchStoryReports = communityId => rpc('story_moderation_queue', { p_community_id: communityId })
export const reviewStoryReport = (id, action) => rpc('story_review_report', { p_report_id: id, p_action: action })
