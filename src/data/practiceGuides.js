// ── Guided Practice: THE guide configuration ────────────────────────
// Every stage, prompt, observation and suggested time lives here. The
// components render this; they never author guidance of their own.
//
// WHAT THE GUIDE IS
// A facilitator for two students: who starts, what happens next,
// roughly how long each stage takes, when to switch roles, what the
// interviewer should watch for, and when to finish.
//
// WHAT IT IS NOT
// It never judges whether an answer is correct, never scores, never
// says anyone is interview ready, and never decides that a session
// happened. Suggested times are guidance; a timer reaching zero
// proves nothing.
//
// MATERIALS
// Mutu supplies no cases, exhibits or questions. Every guide tells
// people to bring something they are permitted to share.

export const GUIDE_VERSION = 'g1'

/** Shown wherever a guide asks people to bring their own material. */
export const MATERIAL_NOTE = 'Use a case or question you are permitted to share.'

/** The oral feedback shape, used at the end of every round. */
export const FEEDBACK_PROMPTS = [
  'One thing that worked',
  'One priority to improve',
  'One action to try next round',
]

// ── Full Mock Swap · Case ───────────────────────────────────────────
const FULL_MOCK_CASE = {
  key: 'full_mock_swap:case',
  mode: 'full_mock_swap',
  category: 'case',
  title: 'Full Mock Swap',
  subtitle: 'Case interview',
  prepare: [
    'A case you are permitted to use',
    'Paper or a spreadsheet for calculations',
    'A video or voice call',
    'A quiet place for feedback',
  ],
  stages: [
    {
      key: 'set_up',
      title: 'Set up',
      time: null,
      shared: [
        'Confirm who is Candidate and who is Interviewer.',
        'Interviewer opens a case they are permitted to use.',
        'Candidate prepares paper or a spreadsheet.',
        'Agree on roughly 30 to 35 minutes for the case and 5 to 10 for feedback.',
      ],
      cta: 'Begin the case',
    },
    {
      key: 'understand',
      title: 'Understand the problem',
      time: '3-5 min',
      candidate: [
        'Restate the objective.',
        'Clarify the business model, scope and success measure.',
        'Confirm the exact question to solve.',
      ],
      interviewer: [
        'Present the case prompt.',
        'Answer reasonable clarification questions.',
        'Do not reveal the solution path.',
      ],
    },
    {
      key: 'hypothesis',
      title: 'Form an initial hypothesis',
      time: '2 min',
      candidate: [
        'State an initial point of view.',
        'Explain what information would confirm or challenge it.',
      ],
      interviewer: ['Let the candidate think aloud without steering them.'],
      observe: [
        'Does the hypothesis connect to the objective?',
        'Is the candidate willing to revise it?',
      ],
      // some case formats do not support an early hypothesis
      skip: 'Continue without hypothesis',
    },
    {
      key: 'structure',
      title: 'Structure the approach',
      time: '5 min',
      candidate: [
        'Create a clear structure tailored to this case.',
        'Explain why each branch matters.',
        'Prioritise where to begin.',
      ],
      interviewer: ['Give the candidate quiet time, then ask them to walk you through it.'],
      observe: [
        'Is the structure relevant to this case?',
        'Are the categories clear and non-overlapping?',
        'Is the candidate prioritising?',
      ],
      note: 'There is no single correct framework. A structure that fits this case is the goal.',
    },
    {
      key: 'analyse',
      title: 'Analyse and investigate',
      time: '15-20 min',
      candidate: [
        'Work through the information provided.',
        'Explain calculations and assumptions.',
        'Interpret exhibits in relation to the business question.',
        'Update the hypothesis when the evidence changes.',
      ],
      interviewer: [
        'Release information according to the case.',
        'Ask appropriate follow up questions.',
        'Record observations without interrupting unnecessarily.',
      ],
    },
    {
      key: 'recommendation',
      title: 'Deliver the recommendation',
      time: '2-3 min',
      candidate: [
        'Lead with the recommendation.',
        'Support it with the most important evidence.',
        'State key risks or uncertainties.',
        'Propose a practical next step.',
      ],
      interviewer: ['Listen without interrupting, then ask one follow up.'],
      observe: [
        'Was the answer direct?',
        'Was it supported by the analysis?',
        'Were risks and next steps addressed?',
      ],
    },
    {
      key: 'feedback',
      title: 'Feedback and switch',
      time: '5-10 min',
      shared: FEEDBACK_PROMPTS,
      note: 'Say it out loud. Nothing here is recorded.',
      cta: 'Finish round',
    },
  ],
}

// ── Full Mock Swap · Behavioural ────────────────────────────────────
const FULL_MOCK_BEHAVIOURAL = {
  key: 'full_mock_swap:behavioural',
  mode: 'full_mock_swap',
  category: 'behavioural',
  title: 'Full Mock Swap',
  subtitle: 'Behavioural interview',
  prepare: [
    'Two or three behavioural questions you are permitted to use',
    'A video or voice call',
    'Somewhere quiet enough to listen closely',
  ],
  stages: [
    {
      key: 'set_up',
      title: 'Set up',
      time: null,
      shared: [
        'Select two or three behavioural questions.',
        'Confirm who is Candidate and who is Interviewer.',
        'Agree that the Interviewer may ask follow up questions.',
      ],
      cta: 'Begin the interview',
    },
    {
      key: 'ask',
      title: 'Ask the question',
      time: '1 min',
      interviewer: [
        'Ask one clear behavioural question.',
        'Avoid explaining the answer you are hoping for.',
      ],
      candidate: ['Take a moment to choose the experience you will use.'],
    },
    {
      key: 'story',
      title: 'Deliver the story',
      time: '3-5 min',
      candidate: [
        'Establish the situation and the context that matters.',
        'Explain what you were responsible for.',
        'Focus on your own actions and judgement.',
        'State the results and the impact.',
        'Include what you learned, where it is relevant.',
      ],
      interviewer: ['Listen without interrupting. Note anything you want to probe.'],
    },
    {
      key: 'probe',
      title: 'Probe deeper',
      time: '3-5 min',
      interviewer: [
        'What was your personal contribution?',
        'What alternatives did you consider?',
        'What resistance did you face?',
        'What would you do differently?',
        'How did you measure the result?',
      ],
      candidate: ['Answer directly, and keep the thread of the story.'],
    },
    {
      key: 'feedback',
      title: 'Oral feedback',
      time: '3-5 min',
      shared: FEEDBACK_PROMPTS,
      observe: [
        'Story clarity',
        'Relevance to the question',
        'Ownership',
        'Decision making',
        'Evidence of impact',
        'Reflection',
        'Concision',
        'Clear pacing and composure',
      ],
      note: 'Describe what you noticed. No scores, and nothing recorded.',
      cta: 'Finish round',
    },
  ],
}

// ── Quick Skill Drills ──────────────────────────────────────────────
// One definition per structured skill from src/data/practiceModes.js.
// Each carries its objective, setup, the candidate's steps, what the
// interviewer watches for, a suggested duration, how many repetitions
// and the copy shown when the drill is done.
const drill = (d) => ({ reps: 1, time: '10-12 min', ...d })

export const CASE_DRILLS = {
  problem_clarification: drill({
    title: 'Problem clarification',
    objective: 'Get to the real question before doing any analysis.',
    setup: ['Interviewer picks a short case prompt they are permitted to use.'],
    steps: [
      'Interviewer gives the short case prompt.',
      'Candidate restates the objective in their own words.',
      'Candidate asks only the questions they genuinely need.',
      'Interviewer answers from the prompt, nothing more.',
      'Interviewer names one question that improved clarity and one that was not needed.',
    ],
    observe: ['Did the restatement match the prompt?', 'Were the questions essential or habitual?'],
    completion: 'You have both practised getting to the real question first.',
  }),
  hypothesis_development: drill({
    title: 'Hypothesis development',
    objective: 'Start with a view, and let evidence move it.',
    setup: ['Interviewer picks a short business problem.'],
    steps: [
      'Interviewer gives the short business problem.',
      'Candidate states an initial hypothesis.',
      'Candidate names the evidence that would confirm or challenge it.',
      'Interviewer provides one new fact.',
      'Candidate updates or keeps the hypothesis, and explains why.',
    ],
    observe: ['Is the hypothesis tied to the objective?', 'Did new evidence actually change the thinking?'],
    completion: 'You have both practised forming and testing a first view.',
  }),
  structuring: drill({
    title: 'Structuring',
    objective: 'Build a structure that fits this problem, not a template.',
    setup: ['Interviewer picks a case prompt they are permitted to use.'],
    steps: [
      'Interviewer gives the case prompt.',
      'Candidate takes up to 90 seconds to think.',
      'Candidate presents a structure tailored to the problem.',
      'Interviewer tests one branch with a follow up question.',
      'Candidate explains what they would look at first, and why.',
    ],
    observe: ['Is it tailored or generic?', 'Are the branches clear and separate?', 'Is there a priority?'],
    completion: 'You have both practised structuring a specific problem.',
  }),
  quantitative_reasoning: drill({
    title: 'Quantitative reasoning',
    objective: 'Set up the maths clearly, then say what the number means.',
    setup: ['Interviewer prepares a calculation prompt of their own.'],
    steps: [
      'Interviewer gives the calculation prompt.',
      'Candidate sets up the calculation before calculating.',
      'Candidate states assumptions and units.',
      'Candidate calculates out loud.',
      'Candidate interprets what the result means for the business.',
    ],
    observe: ['Was the setup explained first?', 'Were assumptions stated?', 'Did the number get interpreted?'],
    completion: 'You have both practised working through numbers out loud.',
  }),
  exhibit_interpretation: drill({
    title: 'Exhibit interpretation',
    objective: 'Read an exhibit for the insight, not the decoration.',
    setup: ['Interviewer shares an exhibit they are permitted to use.'],
    steps: [
      'Interviewer shares the exhibit.',
      'Candidate describes what it shows.',
      'Candidate identifies the most important insight.',
      'Candidate connects it to the objective.',
      'Candidate names the next question or analysis.',
    ],
    observe: ['Description before conclusion?', 'Was the insight the important one?'],
    completion: 'You have both practised turning an exhibit into a next step.',
  }),
  synthesis: drill({
    title: 'Synthesis',
    objective: 'Pull findings together around the objective.',
    setup: ['Interviewer prepares three or four findings.'],
    steps: [
      'Interviewer gives three or four findings.',
      'Candidate takes 60 seconds to prepare.',
      'Candidate synthesises them around the business objective.',
      'Interviewer asks one implication question.',
      'Candidate answers concisely.',
    ],
    observe: ['Was it a synthesis or a list?', 'Did it stay tied to the objective?'],
    completion: 'You have both practised synthesising under time pressure.',
  }),
  final_recommendation: drill({
    title: 'Final recommendation',
    objective: 'Answer first, then support it.',
    setup: ['Interviewer prepares a problem and its key findings.'],
    steps: [
      'Interviewer gives the problem and key findings.',
      'Candidate takes 60 seconds to prepare.',
      'Candidate gives a two minute recommendation.',
      'Interviewer asks one risk or next step question.',
      'Candidate answers.',
    ],
    observe: ['Did the recommendation come first?', 'Was the evidence the strongest available?', 'Were risks addressed?'],
    completion: 'You have both practised leading with the answer.',
  }),
  communication: drill({
    title: 'Communication',
    objective: 'Say the same thing more clearly the second time.',
    setup: ['Choose a short case segment you are both comfortable using.'],
    steps: [
      'Candidate explains their reasoning out loud for three minutes.',
      'Interviewer notes clarity, signposting and concision.',
      'Interviewer shares one specific improvement.',
      'Candidate gives the answer again with that improvement.',
    ],
    observe: ['Was it signposted?', 'Could a listener follow it the first time?'],
    completion: 'You have both practised saying it more clearly.',
  }),
}

export const BEHAVIOURAL_DRILLS = {
  story_selection: drill({
    title: 'Story selection',
    objective: 'Choose the experience that actually answers the question.',
    setup: ['Interviewer picks a competency to ask about.'],
    steps: [
      'Interviewer names the competency.',
      'Candidate selects the most relevant experience.',
      'Candidate explains why that experience fits.',
      'Interviewer tests whether the story really shows the competency.',
    ],
    observe: ['Does the story demonstrate the competency, or only mention it?'],
    completion: 'You have both practised choosing the right story.',
  }),
  situation_and_context: drill({
    title: 'Situation and context',
    objective: 'Give only the context needed to understand the challenge.',
    setup: ['Candidate picks a story they know well.'],
    steps: [
      'Candidate explains the context needed to understand the challenge.',
      'Interviewer names anything missing or unnecessary.',
      'Candidate gives the context again, more concisely.',
    ],
    observe: ['Could you follow the situation without extra background?'],
    completion: 'You have both practised setting the scene efficiently.',
  }),
  personal_actions: drill({
    title: 'Personal actions',
    objective: 'Make your own decisions and actions visible.',
    setup: ['Candidate picks a story involving a team.'],
    steps: [
      'Candidate describes their decisions and actions.',
      'Interviewer flags where "we" hides who did what.',
      'Interviewer asks what the candidate personally owned.',
      'Candidate clarifies their own contribution.',
    ],
    observe: ['Is it clear what this person decided and did?'],
    completion: 'You have both practised owning your part of the story.',
  }),
  results_and_impact: drill({
    title: 'Results and impact',
    objective: 'Say what changed, and how you know.',
    setup: ['Candidate picks a story with an outcome.'],
    steps: [
      'Candidate states the results.',
      'Interviewer asks for evidence or a measurement.',
      'Candidate strengthens the impact statement.',
    ],
    observe: ['Is the impact specific?', 'Is there evidence, not just a claim?'],
    completion: 'You have both practised evidencing impact.',
  }),
  reflection_and_learning: drill({
    title: 'Reflection and learning',
    objective: 'Be specific about what you would do differently.',
    setup: ['Candidate picks a story that did not go perfectly.'],
    steps: [
      'Candidate explains what they learned and would change.',
      'Interviewer tests whether the reflection is specific.',
      'Candidate makes the learning concrete.',
    ],
    observe: ['Is the reflection specific, or a general lesson anyone could say?'],
    completion: 'You have both practised reflecting concretely.',
  }),
  concision: drill({
    title: 'Concision',
    objective: 'Same answer, less of it.',
    setup: ['Candidate picks a question they tend to over answer.'],
    steps: [
      'Candidate gives the answer once.',
      'Interviewer identifies what could be removed.',
      'Candidate gives it again, shorter.',
    ],
    observe: ['Did anything essential get lost when it got shorter?'],
    completion: 'You have both practised tightening an answer.',
  }),
  follow_up_questions: drill({
    title: 'Follow-up questions',
    objective: 'Handle probing without losing the thread.',
    setup: ['Candidate picks a short story.'],
    steps: [
      'Candidate gives the short story.',
      'Interviewer asks two probing questions.',
      'Candidate answers without losing the main narrative.',
    ],
    observe: ['Did the answers stay connected to the story?'],
    completion: 'You have both practised staying steady under follow ups.',
  }),
  executive_presence: drill({
    title: 'Executive presence',
    objective: 'Practise pacing, directness and composure. This is a skill you practise, not a fixed trait.',
    setup: ['Candidate picks a question they will answer twice.'],
    steps: [
      'Candidate answers the question.',
      'Interviewer interrupts once with a reasonable question.',
      'Candidate responds and returns to the point.',
      'Candidate answers again with one adjustment to pacing or directness.',
    ],
    observe: [
      'Clear pacing',
      'Direct answers',
      'Composed recovery after an interruption',
      'Confident language that does not overstate',
    ],
    note: 'Observe delivery only. Never comment on personality, accent, cultural style, disability or appearance.',
    completion: 'You have both practised pacing and composure.',
  }),
}

export const DRILLS_BY_CATEGORY = { case: CASE_DRILLS, behavioural: BEHAVIOURAL_DRILLS }
export const FULL_MOCK_GUIDES = {
  case: FULL_MOCK_CASE,
  behavioural: FULL_MOCK_BEHAVIOURAL,
}
