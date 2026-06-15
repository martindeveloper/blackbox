import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../ui/cn.js";

interface AuthorDetailsProps {
  summary: ReactNode;
  children: ReactNode;
  configured?: boolean;
  badge?: ReactNode;
  open?: boolean;
  inline?: boolean;
  className?: string;
}

export function AuthorDetails({
  summary,
  children,
  configured,
  badge,
  open,
  inline,
  className,
}: AuthorDetailsProps) {
  const { t } = useTranslation();

  return (
    <details
      className={cn("author-details", inline && "author-details--inline", className)}
      open={open}
    >
      <summary>
        <ChevronDown size={13} />
        {summary}
        {badge !== undefined ? (
          <span>{badge}</span>
        ) : configured ? (
          <span>{t("textBlock.configured")}</span>
        ) : null}
      </summary>
      <div className="author-details-body">{children}</div>
    </details>
  );
}
