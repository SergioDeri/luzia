import { LuziaWidget } from '@luzia/react';

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Jamie Rivera</h1>
      <p>Full-stack developer. Open the luzIA bubble in the corner to ask about Jamie.</p>
      <LuziaWidget
        endpoint="/api/luzia"
        contact="jamie.rivera@example.com"
        theme="auto"
        greeting="Hi! I'm luzIA, an AI agent that answers questions about Jamie. What would you like to know?"
        suggestedQuestions={[
          'What role is Jamie looking for?',
          'What is Jamie’s main tech stack?',
          'Is Jamie open to remote work?',
        ]}
        style={{ '--luzia-accent': '#0f766e' }}
      />
    </main>
  );
}
