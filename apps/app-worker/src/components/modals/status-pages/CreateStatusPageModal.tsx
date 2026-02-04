import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { createStatusPageFn } from "@/server/functions/status-pages";

interface CreateStatusPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function CreateStatusPageModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateStatusPageModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [accessMode, setAccessMode] = useState<
    "public" | "private" | "internal"
  >("public");
  const [password, setPassword] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#007bff");
  const [customCss, setCustomCss] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createStatusPage = useServerFn(createStatusPageFn);

  const handleClose = () => {
    setName("");
    setSlug("");
    setAccessMode("public");
    setPassword("");
    setLogoUrl("");
    setBrandColor("#007bff");
    setCustomCss("");
    setError(null);
    onClose();
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createStatusPage({
        data: {
          name,
          slug,
          access_mode: accessMode,
          password: accessMode === "private" ? password : undefined,
          logo_url: logoUrl.trim() || undefined,
          brand_color: brandColor.trim() || "#007bff",
          custom_css: customCss.trim() || undefined,
        },
      });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Status Page">
      <form className="form" onSubmit={onCreate}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="status-name">Name</label>
        <input
          id="status-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Customer status"
          required
        />
        <label htmlFor="status-slug">Slug</label>
        <input
          id="status-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="status"
          required
        />

        <label htmlFor="status-access-mode">Access</label>
        <select
          id="status-access-mode"
          value={accessMode}
          onChange={(event) =>
            setAccessMode(event.target.value as typeof accessMode)
          }
        >
          <option value="public">Public</option>
          <option value="private">Private (password)</option>
          <option value="internal">Internal (team-only)</option>
        </select>

        {accessMode === "private" && (
          <>
            <label htmlFor="status-password">Password</label>
            <input
              id="status-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </>
        )}

        <div className="mb-2 mt-4 font-semibold">Customization (optional)</div>

        <label htmlFor="logo-url">Logo URL</label>
        <input
          id="logo-url"
          type="url"
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          placeholder="https://example.com/logo.png"
        />

        <label htmlFor="brand-color">Brand Color</label>
        <div className="flex items-center gap-2">
          <input
            id="brand-color"
            type="color"
            value={brandColor}
            onChange={(event) => setBrandColor(event.target.value)}
            className="h-8 w-16 cursor-pointer rounded border-none p-0"
          />
          <input
            type="text"
            value={brandColor}
            onChange={(event) => setBrandColor(event.target.value)}
            placeholder="#007bff"
            className="flex-1"
          />
        </div>

        <label htmlFor="custom-css">Custom CSS</label>
        <textarea
          id="custom-css"
          value={customCss}
          onChange={(event) => setCustomCss(event.target.value)}
          placeholder=".status-page { background: #f8f9fa; }"
          rows={4}
          className="font-mono text-sm"
        />

        <FormActions>
          <button type="submit">Create Status Page</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
