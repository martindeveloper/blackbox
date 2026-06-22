import { ArrowUpCircle, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EDITOR_VERSION } from "@/lib/version.js";
import { useUpdateCheck } from "@/hooks/useUpdateCheck.js";
import { Icon } from "@/components/icons/Icon.js";

interface DepEntry {
  name: string;
  roleKey: string;
  url?: string;
}

interface DepGroup {
  titleKey: string;
  entries: DepEntry[];
}

const DEP_GROUPS: DepGroup[] = [
  {
    titleKey: "about.groups.runtime",
    entries: [
      { name: "Electron", roleKey: "about.deps.electron", url: "https://www.electronjs.org/" },
      { name: "Node.js", roleKey: "about.deps.nodeJs", url: "https://nodejs.org/" },
      { name: "React", roleKey: "about.deps.react", url: "https://react.dev/" },
      {
        name: "TypeScript",
        roleKey: "about.deps.typescript",
        url: "https://www.typescriptlang.org/",
      },
    ],
  },
  {
    titleKey: "about.groups.editorUi",
    entries: [
      {
        name: "TanStack Router",
        roleKey: "about.deps.tanstackRouter",
        url: "https://tanstack.com/router",
      },
      { name: "Zustand", roleKey: "about.deps.zustand", url: "https://zustand.docs.pmnd.rs/" },
      { name: "XYFlow", roleKey: "about.deps.xyflow", url: "https://xyflow.com/" },
      {
        name: "@dagrejs/dagre",
        roleKey: "about.deps.dagre",
        url: "https://github.com/dagrejs/dagre",
      },
      { name: "Tailwind CSS", roleKey: "about.deps.tailwind", url: "https://tailwindcss.com/" },
      { name: "Lucide", roleKey: "about.deps.lucide", url: "https://lucide.dev/" },
      { name: "i18next", roleKey: "about.deps.i18next", url: "https://www.i18next.com/" },
    ],
  },
  {
    titleKey: "about.groups.build",
    entries: [
      { name: "Rolldown", roleKey: "about.deps.rolldown", url: "https://rolldown.rs/" },
      { name: "Fastify", roleKey: "about.deps.fastify", url: "https://fastify.dev/" },
      { name: "oxlint / oxfmt", roleKey: "about.deps.oxlint", url: "https://oxc.rs/" },
    ],
  },
  {
    titleKey: "about.groups.engine",
    entries: [
      { name: "Rust", roleKey: "about.deps.rust", url: "https://www.rust-lang.org/" },
      {
        name: "Cargo",
        roleKey: "about.deps.cargo",
        url: "https://doc.rust-lang.org/cargo/",
      },
      { name: "blackbox-core", roleKey: "about.deps.blackboxCore" },
      { name: "blackbox-lint", roleKey: "about.deps.blackboxLint" },
      { name: "blackbox-bundler", roleKey: "about.deps.blackboxBundler" },
      { name: "blackbox-convert", roleKey: "about.deps.blackboxConvert" },
      { name: "blackbox-scout", roleKey: "about.deps.blackboxScout" },
      { name: "blackbox-simulator", roleKey: "about.deps.blackboxSimulator" },
    ],
  },
  {
    titleKey: "about.groups.platform",
    entries: [
      { name: "Local Project API", roleKey: "about.deps.localProjectApi" },
      {
        name: "Model Context Protocol",
        roleKey: "about.deps.mcp",
        url: "https://modelcontextprotocol.io/",
      },
      { name: "WebAssembly", roleKey: "about.deps.webAssembly" },
    ],
  },
];

const AI_AGENTS: DepEntry[] = [
  { name: "Cursor", roleKey: "about.deps.cursor" },
  { name: "Claude", roleKey: "about.deps.claude" },
  { name: "Codex", roleKey: "about.deps.codex" },
];

function DepCard({ entry }: { entry: DepEntry }) {
  const { t } = useTranslation();
  const inner = (
    <>
      <span className="about-dep-name">{entry.name}</span>
      <span className="about-dep-role">{t(entry.roleKey)}</span>
    </>
  );

  if (entry.url) {
    return (
      <a
        className="about-dep-card about-dep-card--link"
        href={entry.url}
        target="_blank"
        rel="noreferrer"
      >
        {inner}
      </a>
    );
  }

  return <div className="about-dep-card">{inner}</div>;
}

function UpdateCheck() {
  const { t } = useTranslation();
  const { status, result, error, check } = useUpdateCheck();
  const checking = status === "checking";

  return (
    <div className="about-update">
      {status === "available" && result ? (
        <a
          className="editor-btn editor-btn-sm editor-btn-primary about-update-button"
          href={result.latest.downloadUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Icon icon={Download} size={13} />
          {t("update.updateToVersion", { version: result.latest.version })}
        </a>
      ) : (
        <button
          type="button"
          className="editor-btn editor-btn-sm about-update-button"
          onClick={() => void check()}
          disabled={checking}
        >
          <Icon
            icon={checking ? Loader2 : RefreshCw}
            size={13}
            className={checking ? "spin" : ""}
          />
          {t("update.checkButton")}
        </button>
      )}

      {status === "checking" && <span className="about-update-status">{t("update.checking")}</span>}
      {status === "current" && (
        <span className="about-update-status about-update-status--ok">
          <Icon icon={CheckCircle2} size={13} />
          {t("update.upToDate")}
        </span>
      )}
      {status === "available" && (
        <span className="about-update-status about-update-status--available">
          <Icon icon={ArrowUpCircle} size={13} />
          {t("update.available")}
        </span>
      )}
      {status === "error" && (
        <span className="about-update-status about-update-status--error">
          {error ?? t("update.checkFailed")}
        </span>
      )}
    </div>
  );
}

export function AboutScreen() {
  const { t } = useTranslation();

  return (
    <div className="about-screen">
      <header className="about-hero">
        <div className="about-wordmark" aria-hidden>
          <span className="about-wordmark-black">BLACK</span>
          <span className="about-wordmark-box">BOX</span>
        </div>
        <p className="about-tagline">{t("about.tagline")}</p>
        <p className="about-lead">{t("about.lead")}</p>
        <span className="about-version">v{EDITOR_VERSION}</span>
        <UpdateCheck />
      </header>

      <div className="about-sections">
        {DEP_GROUPS.map((group) => (
          <section key={group.titleKey} className="about-section">
            <h2 className="about-section-title">{t(group.titleKey)}</h2>
            <div className="about-dep-grid">
              {group.entries.map((entry) => (
                <DepCard key={entry.name} entry={entry} />
              ))}
            </div>
          </section>
        ))}

        <section className="about-section about-section--ai">
          <h2 className="about-section-title">{t("about.ai.title")}</h2>
          <p className="about-ai-lead">{t("about.ai.lead")}</p>
          <div className="about-dep-grid about-dep-grid--ai">
            {AI_AGENTS.map((entry) => (
              <DepCard key={entry.name} entry={entry} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
