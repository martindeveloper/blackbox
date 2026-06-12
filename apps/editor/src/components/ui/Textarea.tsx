import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn.js";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { mono, className, ...props },
  ref,
) {
  return (
    <textarea ref={ref} className={cn("editor-input", mono && "font-mono", className)} {...props} />
  );
});
