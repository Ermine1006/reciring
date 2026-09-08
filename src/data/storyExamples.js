// Fictional demo records only. These are never Supabase users or member posts,
// and must never enter a draft, an own-words pledge, or a story mutation RPC.
export const STORY_EXAMPLE_WRITERS = {
  maya: { name: 'Maya', role: 'MBA alum', note: 'Learning to ask for help at work.' },
  jonah: { name: 'Jonah', role: 'MBA student', note: 'Finding my voice in the classroom.' },
  leila: { name: 'Leila', role: 'MBA student', note: 'Making room for ordinary conversations.' },
  rin: { name: 'Rin', role: 'MBA alum', note: 'Taking the next chapter one page at a time.' },
}

export const STORY_EXAMPLES = [
  {
    id: 'example-work', topic: 'work', writer: 'maya', title: 'I sent the wrong file',
    body: `Three weeks into my new job, I sent a client the wrong version of a spreadsheet. Not a tiny typo. The numbers were from the previous month.

I noticed on the subway home. For a few stops I just stared at the email, trying to think of a way to fix it without anyone knowing I had made the mistake.

Eventually I called my manager. She asked which file had gone out and what needed correcting. We sent an update. The next morning we added a second check before anything went to the client.

I wish I could say I stopped replaying it after that. I didn't. I was still embarrassed at lunch.

But a week later, when I was unsure about another number, I asked someone to look at it with me. That felt like a small change. I am trying to let it count.`,
  },
  {
    id: 'example-mba', topic: 'mba', writer: 'jonah', title: 'The question I didn’t ask',
    body: `I spent most of today's case discussion trying to make one question sound clever enough to say out loud.

By the time I had the sentence ready, we were on the next slide. This happens more often than I'd like to admit. I understand the reading, but in the room my thoughts suddenly feel very slow.

After class, I asked the person sitting beside me what one of the charts meant. She opened her notes and said, “Wait, I was confused by that too.” We sat there for another ten minutes, drawing arrows that probably made sense only to us.

I still haven't become the person who puts a hand up without rehearsing. Maybe next class I can ask the unfinished version of the question.

For now, I understood the chart. And I have someone to sit next to on Thursday.`,
  },
  {
    id: 'example-people', topic: 'people', writer: 'leila', title: 'An ordinary coffee chat',
    body: `I arrived twelve minutes early with eight questions in my notebook. I had even practised how to introduce myself while walking there.

Then I knocked my spoon onto the floor before we had ordered.

The alum I was meeting laughed and told me she had once arrived at a coffee chat at the wrong café. I put my notebook away for a bit. We talked about moving cities, her first very quiet month at work, and how hard it can be to ask for help when everyone looks busy.

I asked two of my eight questions. There was no referral at the end. I sent a thank-you later and mentioned a book we had talked about.

On the way home, I realised I wasn't scoring the conversation in my head. I was just glad we'd had it. I'd like more of that, even if I still bring the notebook.`,
  },
  {
    id: 'example-becoming', topic: 'becoming', writer: 'rin', title: 'Still figuring it out',
    body: `Someone asked me what was next after the MBA and I gave the tidy answer. A role, an industry, a sentence that sounded like a plan.

The less tidy answer is that I'm interested in a few different things. Some mornings that feels exciting. Other mornings I open job descriptions and wonder whether I should have figured this out already.

This week I helped a friend think through an idea for her small business. We spent an hour at her kitchen table with a piece of paper and cold tea. I came home with more energy than I'd had all day.

I don't know what that means for a job title yet. I'm writing it down because I don't want to forget the feeling while I'm busy trying to sound certain.

There isn't a lesson at the end of this page. Just something I noticed.`,
  },
]
