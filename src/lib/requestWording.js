import { broadLabelsOf } from '../data/careerFocus'

// Use only the user's selections. Do not invent employers, roles or experience.
export function suggestedRequestTitle(helpTypes = [], focus = []) {
  const topic = broadLabelsOf(focus)[0]
  const templates = {
    Referral: topic ? `Looking for a referral in ${topic}` : 'Looking for a referral to a role or team',
    'Coffee Chat': topic ? `Coffee chat about ${topic}` : 'Coffee chat to learn from your experience',
    'Resume Review': topic ? `Resume feedback for ${topic}` : 'Looking for feedback on my resume',
    'Mock Interview': topic ? `Mock interview practice for ${topic}` : 'Looking for a mock interview partner',
    Intro: topic ? `An introduction to someone in ${topic}` : 'Looking for an introduction to someone who can help',
    'Study Group': topic ? `Study partner for ${topic}` : 'Looking for a study partner or group',
    Advice: topic ? `Advice on ${topic}` : 'Looking for advice and a fresh perspective',
  }
  return templates[helpTypes[0]] || ''
}
