/**
 * How to submit the form to your API.
 *
 * `FormRender` does not talk to your backend — you do, in `onSubmit`. This file
 * shows the full round-trip for the postgres demo schema:
 *
 *   1. upload any File / File[] fields and swap them for URLs   (uploadFiles)
 *   2. POST the values to your API                              (submitConnection)
 *   3. map server-side validation errors back onto the fields  (SubmitResult)
 *   4. run a side action ("Test Connection") via `onAction`     (testConnection)
 *   5. validate a field against the server via `resolvers`      (checkConnectionName)
 *
 * `onSubmit` only runs once the form passes client-side (Zod) validation, so by
 * the time you get here `values` is already well-formed. Return a `SubmitResult`
 * (`{ errors }`) to surface server errors on specific fields; return nothing on
 * success. Replace the `fetch` URLs with your real endpoints.
 */
import { FormRender } from "../src/index";
import { htmlComponents } from "../src/adapters/html";
import type { FormValues, SubmitResult } from "../src/types";
import { postgresSchema } from "./postgres";

// ── storage layer ────────────────────────────────────────────────────────

/** Upload one File (presigned-PUT pattern) and return the URL to persist. */
export async function uploadToS3(file: File): Promise<string> {
  // 1) ask your backend for a short-lived upload URL
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  if (!presign.ok) throw new Error("Could not get an upload URL.");
  const { uploadUrl, fileUrl } = (await presign.json()) as {
    uploadUrl: string;
    fileUrl: string;
  };

  // 2) PUT the bytes straight to S3 (no proxy through your server)
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed for ${file.name}.`);

  return fileUrl; // ← this string is what your DB stores
}

/** Replace every File / File[] in the values with its uploaded URL. */
export async function uploadFiles(values: FormValues): Promise<FormValues> {
  const out: FormValues = { ...values };
  for (const [name, v] of Object.entries(values)) {
    if (v instanceof File) {
      out[name] = await uploadToS3(v);
    } else if (Array.isArray(v) && v[0] instanceof File) {
      out[name] = await Promise.all((v as File[]).map(uploadToS3));
    }
  }
  return out;
}

// ── the submit handler ───────────────────────────────────────────────────

/**
 * POST the form to your backend. Files are uploaded first, then the resulting
 * URLs are sent. A 422 is treated as per-field validation errors and mapped to
 * a `SubmitResult` so each message lands under the right input; other failures
 * surface as a general error.
 */
export async function submitConnection(values: FormValues): Promise<SubmitResult | void> {
  const payload = await uploadFiles(values); // Files → URLs first

  const res = await fetch("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 422) {
    // server validation: { errors: { fieldName: "message", … } }
    const body = (await res.json()) as { errors: Record<string, string> };
    return { errors: body.errors };
  }
  if (!res.ok) {
    return { errors: { host: "Could not reach the server. Please try again." } };
  }
  // success — returning nothing clears any prior errors
}

/** The "Test Connection" action button (schema `actions: [{ action: "test" }]`). */
async function testConnection(values: FormValues): Promise<void> {
  await fetch("/api/connections/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

// ── the component ──────────────────────────────────────────────────────────

export function ConnectionForm() {
  return (
    <FormRender
      schema={postgresSchema}
      components={htmlComponents} // or your scaffolded shadcnComponents
      resolvers={{
        // async field validator referenced by schema (asyncValidation.resolver)
        checkConnectionName: async (value, signal) => {
          const res = await fetch(`/api/connections/check?name=${value}`, { signal });
          const { taken } = (await res.json()) as { taken: boolean };
          return taken ? "That name is already taken." : null;
        },
      }}
      onSubmit={submitConnection} // ← the API call on Save / Finish
      onAction={(action, values) => {
        if (action === "test") void testConnection(values);
      }}
    />
  );
}
