import { useState } from "react";

import { uploadDocument } from "./api";
import { PaperclipIcon } from "./icons";

export function DocumentUpload({
  disabled,
  onUploaded,
  compact = false,
}: {
  disabled?: boolean;
  onUploaded: (name: string) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  return (
    <div className={compact ? "upload is-compact" : "upload"}>
      <label className="attach-button" title="Attach a Markdown or text file">
        <span className="sr-only">上传 RAG 文档（MD / TXT，24 KB）</span>
        <PaperclipIcon size={15} />
        <input
          type="file"
          accept=".md,.txt"
          disabled={disabled || busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            event.target.value = "";
            if (file.size > 24000) {
              setFailed(true);
              setMessage("文件不能超过 24 KB");
              return;
            }
            setBusy(true);
            setFailed(false);
            setMessage("正在上传并建立索引…");
            try {
              const body = await uploadDocument(file);
              onUploaded(body.name);
              setMessage(`${body.name} 已索引 · ${body.chunks} 个片段`);
            } catch (error) {
              setFailed(true);
              setMessage(error instanceof Error ? error.message : "上传失败");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {!compact && (
        <span className="upload-hint">
          加入本机共享知识库；后续研究可检索使用。
        </span>
      )}
      <span
        role="status"
        className={`upload-status${failed ? " is-error" : ""}`}
      >
        {message}
      </span>
    </div>
  );
}
