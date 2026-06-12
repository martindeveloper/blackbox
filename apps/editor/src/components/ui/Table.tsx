import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn.js";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("editor-table w-full text-left", className)}>{children}</table>;
}

export function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={cn("sticky top-0", className)}>{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  selected,
  onClick,
  className,
}: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cn(onClick && "cursor-pointer", selected && "selected", className)}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("px-2 py-1", className)} {...props}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-2 py-[3px]", className)} {...props}>
      {children}
    </td>
  );
}
