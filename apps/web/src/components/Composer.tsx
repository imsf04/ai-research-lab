import { useEffect, type RefObject } from "react";

import { DocumentUpload } from "../DocumentUpload";
import { ArrowUpIcon, XIcon } from "../icons";

export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  disabled,
  disabledReason,
  attachments,
  onUploaded,
  onRemoveAttachment,
  placeholder,
  mode,
  inputRef,
  submitLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  disabled: boolean;
  disabledReason?: string;
  attachments: string[];
  onUploaded: (name: string) => void;
  onRemoveAttachment: (name: string) => void;
  placeholder: string;
  mode: "new" | "followup";
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  submitLabel?: string;
}) {
  const blocked = disabled || busy || !value.trim();

  useEffect(() => {
    const node = inputRef?.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [value, inputRef]);

  return (
    <div className="composer-shell">
      {disabledReason && (
        <p className="composer-status" role="status">
          <span className="composer-status-dot" aria-hidden="true" />
          {disabledReason}
        </p>
      )}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) onSubmit();
        }}
      >
        {attachments.length > 0 && (
          <div className="attachment-row">
            {attachments.map((name) => (
              <span key={name} className="attachment-chip">
                <span className="attachment-name">{name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => onRemoveAttachment(name)}
                >
                  <XIcon size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-main">
          <div className="composer-tools">
            <DocumentUpload compact disabled={busy} onUploaded={onUploaded} />
          </div>
          <textarea
            ref={inputRef}
            className="composer-input"
            rows={1}
            maxLength={8000}
            value={value}
            placeholder={placeholder}
            aria-label="研究问题"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!blocked) onSubmit();
              }
            }}
          />
          <button
            type="submit"
            className={submitLabel ? "send-button has-label" : "send-button"}
            disabled={blocked}
            aria-label={
              submitLabel ??
              (mode === "new" ? "Start research" : "Send message")
            }
            title={submitLabel ?? (mode === "new" ? "Start research" : "Send")}
          >
            <ArrowUpIcon size={16} />
            {submitLabel && <span>{submitLabel}</span>}
          </button>
        </div>
        <div className="composer-foot">
          <span>Enter to send · Shift+Enter for a new line</span>
          <span className="composer-mode">
            {mode === "new"
              ? "Creates a durable project"
              : "Continues this project"}
          </span>
        </div>
      </form>
    </div>
  );
}
