import { ArrowLeft, ArrowRight, FolderOpen, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createProject } from "@/lib/projectApi.js";
import { pickProjectFolder } from "@/lib/pickProjectFolder.js";
import { notifyFromError } from "@/lib/notifyApi.js";
import { useScenarioStore } from "@/store/useScenarioStore.js";
import { transitionToEditor } from "@/lib/projectTransition.js";
import { Page } from "@/lib/pages.js";
import { editorNavigate } from "@/lib/projectRoute.js";
import { Icon } from "@/components/icons/Icon.js";
import { Checkbox } from "@/components/ui/Checkbox.js";
import { ThemeSelector } from "@/components/layout/ThemeSelector.js";

interface NewProjectWizardProps {
  onBack: () => void;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "_")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
}

type Direction = "forward" | "back";

const STEPS = [
  {
    label: "Identity",
    title: "Name your project",
    subtitle: "Give this project a title and choose its folder name.",
  },
  {
    label: "First Chapter",
    title: "Opening chapter",
    subtitle: "Every story needs a first scene. Set up the opening chapter.",
  },
  {
    label: "Location",
    title: "Choose location",
    subtitle: "Pick the parent directory where your project folder will be created.",
  },
] as const;

export function NewProjectWizard({ onBack }: NewProjectWizardProps) {
  const navigate = useNavigate();
  const openProject = useScenarioStore((state) => state.openProject);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<Direction>("forward");
  const [animKey, setAnimKey] = useState(0);

  const [title, setTitle] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderManuallyEdited, setFolderManuallyEdited] = useState(false);

  const [chapterTitle, setChapterTitle] = useState("Prologue");
  const [chapterId, setChapterId] = useState("prologue");
  const [chapterIdManuallyEdited, setChapterIdManuallyEdited] = useState(false);

  const [withExample, setWithExample] = useState(true);
  const [withCode, setWithCode] = useState(false);

  const [parentPath, setParentPath] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const go = (next: number, dir: Direction) => {
    setDirection(dir);
    setAnimKey((k) => k + 1);
    setStep(next);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!folderManuallyEdited) {
      setFolderName(slugify(value));
    }
  };

  const handleChapterTitleChange = (value: string) => {
    setChapterTitle(value);
    if (!chapterIdManuallyEdited) {
      setChapterId(slugify(value));
    }
  };

  const handlePickParent = async () => {
    try {
      const folder = await pickProjectFolder();
      if (folder) setParentPath(folder);
    } catch (err) {
      notifyFromError(err);
    }
  };

  const handleCreate = async () => {
    if (!parentPath || !title.trim() || !folderName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({
        parentPath,
        folderName: folderName.trim(),
        title: title.trim(),
        firstChapterId: chapterId.trim() || "prologue",
        firstChapterTitle: chapterTitle.trim() || "Prologue",
        withExample,
        withCode,
      });
      if (!(await openProject(project.id))) return;
      await transitionToEditor(() =>
        editorNavigate(navigate, { to: Page.EditorDashboard, search: {} }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setCreating(false);
    }
  };

  const step1Valid = title.trim().length > 0 && folderName.trim().length > 0;
  const step2Valid = chapterId.trim().length > 0 && chapterTitle.trim().length > 0;
  const step3Valid = parentPath !== null;

  const canCreate = step1Valid && step2Valid && step3Valid;

  const bodyClass = `wizard-panel-body wizard-panel-body--animate-${direction === "forward" ? "forward" : "back"}`;

  const fullPath = parentPath && folderName ? `${parentPath}/${folderName}` : null;

  return (
    <div className="editor-welcome">
      <div className="editor-welcome-theme">
        <ThemeSelector />
      </div>
      <div className="wizard-card">
        <div className="wizard-panel">
          <div className="wizard-panel-header">
            <button type="button" className="wizard-back-btn" onClick={onBack}>
              <Icon icon={ArrowLeft} size={10} />
              Projects
            </button>

            <div className="wizard-stepper">
              {STEPS.flatMap((s, i) => {
                const cls =
                  i < step
                    ? "wizard-step-dot wizard-step-dot--past"
                    : i === step
                      ? "wizard-step-dot wizard-step-dot--active"
                      : "wizard-step-dot wizard-step-dot--future";
                const items = [];
                if (i > 0) items.push(<div key={`conn-${i}`} className="wizard-step-connector" />);
                items.push(<div key={`dot-${i}`} className={cls} title={s.label} />);
                return items;
              })}
            </div>

            <div className="wizard-step-label">{`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]!.label}`}</div>
            <h2 className="wizard-panel-title">{STEPS[step]!.title}</h2>
            <p className="wizard-panel-subtitle">{STEPS[step]!.subtitle}</p>
          </div>

          <div key={animKey} className={bodyClass}>
            {step === 0 && (
              <>
                <div className="wizard-field">
                  <label className="wizard-field-label" htmlFor="wiz-title">
                    Project title
                  </label>
                  <input
                    id="wiz-title"
                    ref={titleInputRef}
                    className="editor-input"
                    type="text"
                    placeholder="Silent Archive"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    maxLength={80}
                  />
                  <span className="wizard-field-hint">
                    The display name shown in the project picker.
                  </span>
                </div>

                <div className="wizard-field">
                  <label className="wizard-field-label" htmlFor="wiz-folder">
                    Folder name
                  </label>
                  <input
                    id="wiz-folder"
                    className="editor-input font-mono"
                    type="text"
                    placeholder="my_project"
                    value={folderName}
                    onChange={(e) => {
                      setFolderManuallyEdited(true);
                      setFolderName(e.target.value.replace(/[^a-z0-9_-]/gi, "_").toLowerCase());
                    }}
                    maxLength={64}
                  />
                  <span className="wizard-field-hint">
                    The directory name created on disk. Auto-derived from title.
                  </span>
                </div>

                <div className="wizard-field">
                  <Checkbox
                    checked={withCode}
                    onChange={(e) => setWithCode(e.target.checked)}
                    label="Include custom code starter"
                  />
                  <span className="wizard-field-hint">
                    Scaffold a <code>src/</code> folder (React App, game config, styles) with
                    commented starter files. For developers customising the UI — data-only projects
                    can leave this off.
                  </span>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="wizard-field">
                  <label className="wizard-field-label" htmlFor="wiz-ch-title">
                    Chapter title
                  </label>
                  <input
                    id="wiz-ch-title"
                    className="editor-input"
                    type="text"
                    placeholder="Prologue"
                    value={chapterTitle}
                    onChange={(e) => handleChapterTitleChange(e.target.value)}
                    autoFocus
                    maxLength={80}
                  />
                  <span className="wizard-field-hint">
                    The title of the first chapter (displayed in-game).
                  </span>
                </div>

                <div className="wizard-field">
                  <label className="wizard-field-label" htmlFor="wiz-ch-id">
                    Chapter ID
                  </label>
                  <input
                    id="wiz-ch-id"
                    className="editor-input font-mono"
                    type="text"
                    placeholder="prologue"
                    value={chapterId}
                    onChange={(e) => {
                      setChapterIdManuallyEdited(true);
                      setChapterId(e.target.value.replace(/[^a-z0-9_-]/gi, "_").toLowerCase());
                    }}
                    maxLength={48}
                  />
                  <span className="wizard-field-hint">
                    Unique machine identifier used in references and file names.
                  </span>
                </div>

                <div className="wizard-field">
                  <Checkbox
                    checked={withExample}
                    onChange={(e) => setWithExample(e.target.checked)}
                    label="Add example content"
                  />
                  <span className="wizard-field-hint">
                    Fill the first chapter and a second chapter with a short, neutral guided tour —
                    nodes, choices, items, a skill check, a game over, and an ending — that teaches
                    the editor. Uncheck for a single empty chapter.
                  </span>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="wizard-field">
                  <button
                    type="button"
                    className="wizard-pick-btn"
                    onClick={() => void handlePickParent()}
                    disabled={creating}
                  >
                    <span className="wizard-pick-btn-icon">
                      <Icon icon={FolderOpen} size={13} />
                    </span>
                    {parentPath ? "Change parent folder…" : "Choose parent folder…"}
                  </button>
                  <span className="wizard-field-hint">
                    Select the directory that will contain the new{" "}
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        color: "var(--editor-text-muted)",
                        background: "var(--editor-surface-2)",
                        border: "1px solid var(--editor-border-subtle)",
                        padding: "0 4px",
                        borderRadius: "2px",
                      }}
                    >
                      {folderName || "project"}
                    </code>{" "}
                    folder.
                  </span>
                </div>

                {fullPath && (
                  <div className="wizard-location-preview">
                    <div className="wizard-location-preview-label">Project will be created at</div>
                    <div className="wizard-location-preview-path">
                      {parentPath}/<strong>{folderName}</strong>
                    </div>
                  </div>
                )}

                {error && <div className="wizard-error">{error}</div>}
              </>
            )}
          </div>

          <div className="wizard-panel-footer">
            {step > 0 && (
              <button
                type="button"
                className="wizard-secondary-btn"
                onClick={() => go(step - 1, "back")}
                disabled={creating}
              >
                <Icon icon={ArrowLeft} size={11} />
                Back
              </button>
            )}

            <div style={{ flex: 1 }} />

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                className="wizard-primary-btn"
                disabled={step === 0 ? !step1Valid : !step2Valid}
                onClick={() => go(step + 1, "forward")}
              >
                Continue
                <Icon icon={ArrowRight} size={11} />
              </button>
            ) : (
              <button
                type="button"
                className="wizard-primary-btn"
                disabled={!canCreate || creating}
                onClick={() => void handleCreate()}
              >
                <Icon icon={Plus} size={11} />
                {creating ? "Creating…" : "Create project"}
              </button>
            )}
          </div>
        </div>

        <div className="wizard-right" aria-hidden>
          <div className="splash-art" />
          <div className="splash-crt" />
          <div className="wizard-right-content">
            <div className="wizard-right-eyebrow">New Project</div>
            <h3 className="wizard-right-heading">{title || "Untitled Project"}</h3>
            {step === 1 && chapterTitle && (
              <p className="wizard-right-tagline">Ch. 1 — {chapterTitle}</p>
            )}
            {step === 2 && fullPath && (
              <p
                className="wizard-right-tagline"
                style={{ fontFamily: "var(--font-mono)", fontSize: "9px", opacity: 0.65 }}
              >
                {fullPath}
              </p>
            )}
            {step === 0 && (
              <p className="wizard-right-tagline">
                Author game projects — manifests, chapter graphs, and media.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
