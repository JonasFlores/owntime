"use client";

import { useFormStatus } from "react-dom";
import Spinner from "@/components/spinner";

/**
 * Submit button that knows its own form is in flight: disables while the
 * parent <form> action (server action or POST) runs and shows a spinner.
 * Must be rendered as a child of the <form> — that's how useFormStatus sees it.
 */
export default function SubmitButton({
  children,
  className,
  disabled = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={className}
      {...rest}
    >
      {pending && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
