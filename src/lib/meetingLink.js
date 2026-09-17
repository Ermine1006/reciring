// Only known HTTPS meeting providers may become clickable invitations.
export function meetingLink(value) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const host = url.hostname.toLowerCase()
    const provider = host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'zoom.com' || host.endsWith('.zoom.com') ? 'Zoom'
      : host === 'meet.google.com' ? 'Google Meet'
      : ['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'].includes(host) ? 'Teams' : null
    return provider && url.pathname !== '/' ? { url: url.href, provider } : null
  } catch { return null }
}
