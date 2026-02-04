import { useState, useEffect, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import { updateStatusPageFn } from "@/server/functions/status-pages";

type StatusPage = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  brand_color?: string;
  custom_css?: string;
};

interface EditStatusPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  page: StatusPage | null;
}

export function EditStatusPageModal({
  isOpen,
  onClose,
  onSuccess,
  page,
}: EditStatusPageModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#007bff");
  const [customCss, setCustomCss] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateStatusPage = useServerFn(updateStatusPageFn);

  useEffect(() => {
    if (page) {
      setName(page.name);
      setSlug(page.slug);
      setLogoUrl(page.logo_url || "");
      setBrandColor(page.brand_color || "#007bff");
      setCustomCss(page.custom_css || "");
    }
  }, [page]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const onUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!page) return;
    setError(null);
    try {
      await updateStatusPage({
        data: {
          id: page.id,
          name,
          slug,
          logo_url: logoUrl.trim() || null,
          brand_color: brandColor.trim() || "#007bff",
          custom_css: customCss.trim() || null,
        },
      });
      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Status Page">
      <form className="form" onSubmit={onUpdate}>
        {error && <div className="form-error">{error}</div>}
        <label htmlFor="edit-status-name">Name</label>
        <input
          id="edit-status-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <label htmlFor="edit-status-slug">Slug</label>
        <input
          id="edit-status-slug"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          required
        />

        <div className="mb-2 mt-4 font-semibold">Customization (optional)</div>

        <label htmlFor="edit-logo-url">Logo URL</label>
        <input
          id="edit-logo-url"
          type="url"
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          placeholder="https://example.com/logo.png"
        />

        <label htmlFor="edit-brand-color">Brand Color</label>
        <div className="flex items-center gap-2">
          <input
            id="edit-brand-color"
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

        <label htmlFor="edit-custom-css">Custom CSS</label>
        <textarea
          id="edit-custom-css"
          value={customCss}
          onChange={(event) => setCustomCss(event.target.value)}
          placeholder=".status-page { background: #f8f9fa; }"
          rows={4}
          className="font-mono text-sm"
        />

        <FormActions>
          <button type="submit">Save Changes</button>
          <button type="button" className="outline" onClick={handleClose}>
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}
