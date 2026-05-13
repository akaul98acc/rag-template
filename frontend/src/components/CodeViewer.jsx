export default function CodeViewer({ code, requiresEnv }) {
  function copy() {
    navigator.clipboard?.writeText(code);
  }

  return (
    <div className="card">
      <div className="code-header">
        <h3>Generated code</h3>
        <button onClick={copy}>Copy</button>
      </div>
      {requiresEnv?.length > 0 && (
        <p className="env-hint">
          Set these env vars: <code>{requiresEnv.join(", ")}</code>
        </p>
      )}
      <pre className="code-block">{code}</pre>
    </div>
  );
}
