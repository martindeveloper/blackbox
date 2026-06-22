import { useTranslation } from "react-i18next";
import {
  isCompleteSimulatorOutput,
  type BundleToolResult,
  type ToolResult,
} from "@/lib/toolsApi.js";
import { BundleView } from "./parsedOutput/BundleOutput.js";
import { LintView } from "./parsedOutput/LintOutput.js";
import { SimulatorFailureView, SimulatorView } from "./parsedOutput/SimulatorOutput.js";

interface ParsedOutputProps {
  result: ToolResult | BundleToolResult;
  rawText: string;
}

export function ParsedOutput({ result, rawText }: ParsedOutputProps) {
  const { t } = useTranslation();
  const { parsed } = result;

  if (parsed?.kind === "lint") {
    return <LintView parsed={parsed} rawText={rawText} exitCode={result.exitCode} />;
  }

  if (parsed?.kind === "bundle") {
    return <BundleView parsed={parsed} rawText={rawText} exitCode={result.exitCode} />;
  }

  if (parsed?.kind === "simulator") {
    if (isCompleteSimulatorOutput(parsed)) {
      return <SimulatorView parsed={parsed} rawText={rawText} exitCode={result.exitCode} />;
    }
    return <SimulatorFailureView parsed={parsed} rawText={rawText} exitCode={result.exitCode} />;
  }

  return (
    <>
      <div className="tools-output-header">
        <span className="tools-output-label">{t("tools.output")}</span>
        <span className="tools-output-header-end">
          <span className={`tools-exit-code${result.ok ? " tools-exit-code--ok" : ""}`}>
            {t("tools.exitCode", { code: result.exitCode })}
          </span>
        </span>
      </div>
      <div className="tools-output-body">
        <pre className="tools-output-pre">{rawText || t("tools.noOutput")}</pre>
      </div>
    </>
  );
}
