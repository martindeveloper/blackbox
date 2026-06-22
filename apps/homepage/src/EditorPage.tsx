"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Footer } from "./components/Footer";
import "./i18n/index";

type AuthoringFeature = {
  index: string;
  title: string;
  body: string;
  tags: string[];
};

type WorkspaceFeature = {
  title: string;
  body: string;
};

type ToolItem = {
  command: string;
  title: string;
  body: string;
};

type McpCapability = {
  title: string;
  body: string;
};

export function EditorPage() {
  const { t } = useTranslation();
  const authoringFeatures = t("editorPage.story.features", {
    returnObjects: true,
  }) as AuthoringFeature[];
  const workspaceFeatures = t("editorPage.workspace.features", {
    returnObjects: true,
  }) as WorkspaceFeature[];
  const tools = t("editorPage.tools.items", { returnObjects: true }) as ToolItem[];
  const previewBullets = t("editorPage.preview.bullets", { returnObjects: true }) as string[];
  const analyticsLenses = t("editorPage.tools.analytics.lenses", {
    returnObjects: true,
  }) as string[];
  const mcpCapabilities = t("editorPage.mcp.capabilities", {
    returnObjects: true,
  }) as McpCapability[];
  const mcpAudit = t("editorPage.mcp.audit.items", { returnObjects: true }) as string[];
  const frameFooter = t("editorPage.hero.frame.footer", { returnObjects: true }) as string[];

  return (
    <>
      <main className="editor-page">
        <section className="editor-page-hero">
          <div className="editor-page-grid" aria-hidden="true" />
          <div className="editor-page-orbit editor-page-orbit--one" aria-hidden="true" />
          <div className="editor-page-orbit editor-page-orbit--two" aria-hidden="true" />
          <div className="container editor-page-hero-inner">
            <div className="editor-page-kicker editor-page-reveal">
              <span>{t("editorPage.hero.kicker.brand")}</span>
              <span>{t("editorPage.hero.kicker.version")}</span>
            </div>
            <div className="editor-page-hero-copy">
              <div>
                <h1 className="editor-page-reveal editor-page-delay-1">
                  {t("editorPage.hero.headline")
                    .split("\n")
                    .map((line, i) => (
                      <span key={i}>
                        {line}
                        {i === 0 && <br />}
                      </span>
                    ))}
                </h1>
                <p className="editor-page-lead editor-page-reveal editor-page-delay-2">
                  {t("editorPage.hero.lead")}
                </p>
              </div>
              <div className="editor-page-hero-note editor-page-reveal editor-page-delay-3">
                <span>{t("editorPage.hero.note.label")}</span>
                <p>{t("editorPage.hero.note.body")}</p>
              </div>
            </div>
            <div className="editor-page-hero-frame editor-page-reveal editor-page-delay-3">
              <div className="editor-page-frame-bar">
                <span>{t("editorPage.hero.frame.bar")}</span>
                <span>
                  <i />
                  {t("editorPage.hero.frame.status")}
                </span>
              </div>
              <div className="editor-page-hero-image">
                <Image
                  src="/editor_graph.webp"
                  alt={t("editorPage.hero.frame.image_alt")}
                  fill
                  priority
                  sizes="(max-width: 767px) 100vw, 1120px"
                />
              </div>
              <div className="editor-page-frame-footer">
                {frameFooter.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-story" id="story">
          <div className="container">
            <header className="editor-page-section-head">
              <div>
                <span className="section-label">{t("editorPage.story.label")}</span>
                <h2>{t("editorPage.story.headline")}</h2>
              </div>
              <p>{t("editorPage.story.body")}</p>
            </header>

            <div className="editor-page-feature-grid">
              {authoringFeatures.map((feature) => (
                <article className="editor-page-feature-card" key={feature.index}>
                  <span className="editor-page-feature-index">{feature.index}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                  <div className="editor-page-tags">
                    {feature.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-workspace" id="workspace">
          <div className="container">
            <div className="editor-page-split">
              <div className="editor-page-split-copy">
                <span className="section-label">{t("editorPage.workspace.label")}</span>
                <h2>{t("editorPage.workspace.headline")}</h2>
                <p>{t("editorPage.workspace.body")}</p>
                <div className="editor-page-workspace-list">
                  {workspaceFeatures.map((feature, index) => (
                    <article key={feature.title}>
                      <span>0{index + 1}</span>
                      <div>
                        <h3>{feature.title}</h3>
                        <p>{feature.body}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <figure className="editor-page-tall-shot">
                <div className="editor-page-shot-label">
                  <span>{t("editorPage.workspace.shot.label")}</span>
                  <strong>{t("editorPage.workspace.shot.title")}</strong>
                </div>
                <Image
                  src="/editor_items.webp"
                  alt={t("editorPage.workspace.shot.alt")}
                  fill
                  sizes="(max-width: 899px) 100vw, 48vw"
                />
              </figure>
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-preview" id="preview">
          <div className="container">
            <div className="editor-page-preview-grid">
              <figure className="editor-page-preview-shot">
                <Image
                  src="/editor_preview.webp"
                  alt={t("editorPage.preview.alt")}
                  fill
                  sizes="(max-width: 899px) 100vw, 52vw"
                />
                <figcaption>{t("editorPage.preview.caption")}</figcaption>
              </figure>
              <div className="editor-page-preview-copy">
                <span className="section-label">{t("editorPage.preview.label")}</span>
                <h2>{t("editorPage.preview.headline")}</h2>
                <p>{t("editorPage.preview.body")}</p>
                <ul>
                  {previewBullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="editor-page-live-card">
                  <span>
                    <i />
                    {t("editorPage.preview.liveCard.label")}
                  </span>
                  <strong>{t("editorPage.preview.liveCard.title")}</strong>
                  <small>{t("editorPage.preview.liveCard.subtitle")}</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-tools" id="tools">
          <div className="container">
            <header className="editor-page-section-head editor-page-section-head--dark">
              <div>
                <span className="section-label">{t("editorPage.tools.label")}</span>
                <h2>{t("editorPage.tools.headline")}</h2>
              </div>
              <p>{t("editorPage.tools.body")}</p>
            </header>
            <div className="editor-page-tools-layout">
              <div className="editor-page-tool-list">
                {tools.map((tool, index) => (
                  <article key={tool.command}>
                    <span>0{index + 1}</span>
                    <div>
                      <code>{tool.command}</code>
                      <h3>{tool.title}</h3>
                      <p>{tool.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <figure className="editor-page-tool-shot">
                <Image
                  src="/editor_tools_simulator.webp"
                  alt={t("editorPage.tools.shot_alt")}
                  fill
                  sizes="(max-width: 899px) 100vw, 54vw"
                />
              </figure>
            </div>

            <div className="editor-page-analytics">
              <div>
                <span>{t("editorPage.tools.analytics.label")}</span>
                <h3>{t("editorPage.tools.analytics.headline")}</h3>
              </div>
              <p>{t("editorPage.tools.analytics.body")}</p>
              <div
                className="editor-page-analytics-keys"
                aria-label={t("editorPage.tools.analytics.lenses_aria")}
              >
                {analyticsLenses.map((lens) => (
                  <span key={lens}>{lens}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="editor-page-section editor-page-mcp" id="mcp">
          <div className="editor-page-mcp-grid" aria-hidden="true" />
          <div className="container editor-page-mcp-inner">
            <header className="editor-page-section-head editor-page-mcp-head">
              <div>
                <span className="section-label">{t("editorPage.mcp.label")}</span>
                <h2>{t("editorPage.mcp.headline")}</h2>
              </div>
              <p>{t("editorPage.mcp.body")}</p>
            </header>

            <div className="editor-page-mcp-layout">
              <div className="editor-page-mcp-copy">
                <p>{t("editorPage.mcp.intro")}</p>
                <div className="editor-page-mcp-capabilities">
                  {mcpCapabilities.map((capability) => (
                    <article key={capability.title}>
                      <span aria-hidden="true" />
                      <div>
                        <h3>{capability.title}</h3>
                        <p>{capability.body}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="editor-page-mcp-security">
                  <span>{t("editorPage.mcp.security.label")}</span>
                  <p>{t("editorPage.mcp.security.body")}</p>
                </div>
                <Link href="/docs" className="editor-page-docs-link">
                  {t("editorPage.mcp.docsLink")}
                </Link>
              </div>

              <div
                className="editor-page-mcp-console"
                aria-label={t("editorPage.mcp.console.aria")}
              >
                <div className="editor-page-mcp-console-bar">
                  <span>{t("editorPage.mcp.console.title")}</span>
                  <span>
                    <i />
                    {t("editorPage.mcp.console.status")}
                  </span>
                </div>

                <div className="editor-page-mcp-flow">
                  <div>
                    <span>01</span>
                    <strong>{t("editorPage.mcp.flow.agent")}</strong>
                    <small>{t("editorPage.mcp.flow.agentMeta")}</small>
                  </div>
                  <i aria-hidden="true" />
                  <div>
                    <span>02</span>
                    <strong>{t("editorPage.mcp.flow.protocol")}</strong>
                    <small>127.0.0.1 · bearer auth</small>
                  </div>
                  <i aria-hidden="true" />
                  <div>
                    <span>03</span>
                    <strong>{t("editorPage.mcp.flow.editor")}</strong>
                    <small>{t("editorPage.mcp.flow.editorMeta")}</small>
                  </div>
                </div>

                <pre className="editor-page-mcp-config">
                  <code>{`{
  "mcpServers": {
    "blackbox-editor": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:••••/mcp",
      "headers": { "Authorization": "Bearer ••••••••" }
    }
  }
}`}</code>
                </pre>

                <div className="editor-page-mcp-audit">
                  <div>
                    <span>{t("editorPage.mcp.audit.label")}</span>
                    <strong>{t("editorPage.mcp.audit.title")}</strong>
                  </div>
                  <ul>
                    {mcpAudit.map((item, index) => (
                      <li key={item}>
                        <time>14:{String(32 - index * 3).padStart(2, "0")}</time>
                        <span>{item}</span>
                        <i>{index === 1 ? "18ms" : `${7 + index * 4}ms`}</i>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="editor-page-final">
          <div className="editor-page-final-grid" aria-hidden="true" />
          <div className="container editor-page-final-inner">
            <span className="section-label">{t("editorPage.final.label")}</span>
            <h2>{t("editorPage.final.headline")}</h2>
            <p>{t("editorPage.final.body")}</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
