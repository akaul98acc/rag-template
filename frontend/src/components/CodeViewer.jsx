import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "../contexts/ThemeContext.jsx";

export default function CodeViewer({ code, requiresEnv }) {
  const { resolvedTheme } = useTheme();

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
      <SyntaxHighlighter
        language="python"
        style={resolvedTheme === "dark" ? vscDarkPlus : vs}
        customStyle={{ margin: 0, borderRadius: 6, fontSize: "0.85rem", padding: "1rem" }}
      >
        {code ?? ""}
      </SyntaxHighlighter>
    </div>
  );
}
