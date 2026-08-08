import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type FieldLabelProps = {
  htmlFor: string;
  children: React.ReactNode;
};

export function FieldLabel({ htmlFor, children }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className="field-label">
      {children}
    </label>
  );
}

type FieldInputProps = InputHTMLAttributes<HTMLInputElement>;

export function FieldInput({ className = "", ...props }: FieldInputProps) {
  return <input className={`field-input ${className}`.trim()} {...props} />;
}

type FieldTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function FieldTextarea({ className = "", ...props }: FieldTextareaProps) {
  return (
    <textarea className={`field-input resize-y ${className}`.trim()} {...props} />
  );
}
