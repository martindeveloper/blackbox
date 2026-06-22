"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Footer } from "@/components/Footer";
import "@/i18n/index";

type Doc = {
  slug: string;
  title: string;
  description: string;
  content: string;
};

type Props = {
  doc: Doc;
  nav: Pick<Doc, "slug" | "title">[];
  prose: ReactNode;
};

function href(slug: string) {
  return slug === "index" ? "/docs" : `/docs/${slug}`;
}

function RailLinkArrow() {
  return (
    <svg
      className="docs-shell-rail-link-arrow"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function DocsPage({ doc, nav, prose }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <main className="docs-shell">
        <div className="docs-shell-frame">
          <aside className="docs-shell-rail" aria-label={t("docsPage.rail.aria")}>
            <div className="docs-shell-rail-panel">
              <div className="docs-shell-rail-panel-inner">
                <div className="docs-shell-rail-head">
                  <span className="docs-shell-rail-eyebrow">{t("docsPage.rail.eyebrow")}</span>
                  <Link href="/docs" className="docs-shell-rail-title">
                    {t("docsPage.rail.title")}
                  </Link>
                </div>

                <nav className="docs-shell-nav" aria-label={t("docsPage.nav.aria")}>
                  <ul>
                    {nav.map((item) => (
                      <li key={item.slug}>
                        <Link
                          href={href(item.slug)}
                          className={
                            item.slug === doc.slug
                              ? "docs-shell-nav-link is-active"
                              : "docs-shell-nav-link"
                          }
                          aria-current={item.slug === doc.slug ? "page" : undefined}
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>

                <div className="docs-shell-rail-links">
                  <span>{t("docsPage.related.label")}</span>
                  <ul>
                    <li>
                      <Link href="/editor">
                        <RailLinkArrow />
                        {t("docsPage.related.editor")}
                      </Link>
                    </li>
                    <li>
                      <Link href="/download">
                        <RailLinkArrow />
                        {t("docsPage.related.download")}
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </aside>

          <div className="docs-shell-main">
            {doc.slug !== "index" ? (
              <nav className="docs-shell-breadcrumb" aria-label={t("docsPage.breadcrumb.aria")}>
                <Link href="/docs">{t("docsPage.breadcrumb.root")}</Link>
                <span aria-hidden="true">/</span>
                <span>{doc.title}</span>
              </nav>
            ) : null}

            <article className="docs-shell-article">
              <header className="docs-shell-article-head">
                <h1>{doc.title}</h1>
                <p>{doc.description}</p>
              </header>
              {prose}
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
