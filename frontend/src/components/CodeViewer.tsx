import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vs,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";

interface CodeViewerProps {
  code: string;
  requiresEnv?: string[];
}

export default function CodeViewer({ code, requiresEnv }: CodeViewerProps) {
  const { resolvedTheme } = useTheme();

  function copy() {
    navigator.clipboard?.writeText(code);
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-5">
      <div className="flex justify-between items-center mb-3">
        <h3 className="m-0 text-lg font-semibold">Generated code</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={copy}
          disabled={!code}
          aria-label="Copy generated code to clipboard"
        >
          Copy
        </Button>
      </div>
      {requiresEnv && requiresEnv.length > 0 && (
        <p className="text-sm text-fg-muted mb-2">
          Set these env vars:{" "}
          <code className="font-mono">{requiresEnv.join(", ")}</code>
        </p>
      )}
      {!code ? (
        <p className="text-fg-muted">No code generated yet.</p>
      ) : (
        <SyntaxHighlighter
          language="python"
          style={resolvedTheme === "dark" ? vscDarkPlus : vs}
          className="!m-0 !rounded-md !p-4 !text-[0.85rem]"
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  );
}
