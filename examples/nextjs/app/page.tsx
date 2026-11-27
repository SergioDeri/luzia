export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>Jamie Rivera</h1>
      <p>Full-stack developer. Ask luzIA about Jamie:</p>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f4f4f5', padding: '1rem' }}>
        {`curl -N http://localhost:3000/api/luzia \\
  -H 'content-type: application/json' \\
  -d '{"messages":[{"role":"user","content":"What role is Jamie looking for?"}]}'`}
      </pre>
    </main>
  );
}
