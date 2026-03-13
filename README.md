# Reciprocity – Frontend

Hinge-style frontend for the Rotman MBA anonymous request and coffee-chat platform.

## Run locally

```bash
npm install
npm run dev
```

Then open **http://localhost:5173** in your browser.

## Features

- **Discover (card stack)**  
  Browse anonymous requests. **Swipe right** = “I can help”, **swipe left** = pass. Use the buttons at the bottom if you’re on desktop or prefer not to swipe.

- **Post**  
  Submit an anonymous request (category + text). It appears at the top of the Discover stack.

- **Matches**  
  When you and another user pick each other’s requests, you “match”. This screen lists matches and their status (scheduled / completed) and lets you leave a review after completion.

- **Reviews**  
  Rate (1–5) and optionally review your match after a coffee chat. Reviews are anonymous and support the community.

## Tech stack

- **React 18** + **Vite**
- **Tailwind CSS** (custom theme: Reciprocity navy, teal, cream)
- **Framer Motion** (card drag, swipe, match modal animation)
- **React Router** (optional; currently a single app with tab state)

## Project structure

```
src/
  components/
    CardStack.jsx      # Hinge-style stack, swipe logic, match modal trigger
    RequestCard.jsx    # Single card with drag, “I can help” / “Pass” overlays
    MatchModal.jsx     # “It’s a match!” modal
    SubmitRequest.jsx  # Post anonymous request form
    MatchesList.jsx    # List of matches (scheduled / completed)
    RatingReview.jsx   # Star rating + optional review after meeting
  data/
    mockRequests.js    # Sample requests and categories
  App.jsx
  main.jsx
  index.css
```

## Next steps (backend / product)

- Replace mock data with API calls (submit request, fetch stack, record swipe, create match, submit review).
- Add auth (e.g. Rotman email) and optional profiles (skills, background, hobbies).
- Add calendar/scheduling for coffee chats and optional anonymization rules for when to reveal identity.
