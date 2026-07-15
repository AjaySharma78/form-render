import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormRender } from "../src/components/FormRender";
import { htmlComponents } from "../src/adapters/html";
import type { FormSchema, UploaderMap } from "../src/types";

const file = (name: string) => new File(["data"], name, { type: "text/plain" });

const schema = (multiple = false): FormSchema => ({
  id: "up",
  version: 2,
  fields: [{ name: "doc", type: "file", label: "Doc", upload: "s3", multiple }],
});

function renderForm(s: FormSchema, uploaders: UploaderMap) {
  const onSubmit = vi.fn();
  render(
    <FormRender schema={s} components={htmlComponents} uploaders={uploaders} onSubmit={onSubmit} />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe("uploaders", () => {
  it("uploads on selection with progress, gates submit, then swaps File → URL", async () => {
    let resolveUpload!: (url: string) => void;
    const s3 = vi.fn(
      (_f: File, { onProgress }: { onProgress: (p: number) => void }) =>
        new Promise<string>((res) => {
          onProgress(40);
          resolveUpload = res;
        }),
    );
    const { onSubmit, user } = renderForm(schema(), { s3: s3 as UploaderMap[string] });

    await user.upload(screen.getByLabelText("Doc"), file("cv.pdf"));
    expect(s3).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("40%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    resolveUpload("https://cdn.example/cv.pdf");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled(),
    );
    expect(screen.getByText("✓")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].doc).toBe("https://cdn.example/cv.pdf");
  });

  it("multiple: submits an array of URLs", async () => {
    const s3: UploaderMap[string] = async (f) => `https://cdn.example/${f.name}`;
    const { onSubmit, user } = renderForm(schema(true), { s3 });

    await user.upload(screen.getByLabelText("Doc"), [file("a.txt"), file("b.txt")]);
    await waitFor(() => expect(screen.getAllByText("✓")).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].doc).toEqual([
      "https://cdn.example/a.txt",
      "https://cdn.example/b.txt",
    ]);
  });

  it("blocks submit with a field error when an upload failed", async () => {
    const s3: UploaderMap[string] = async () => {
      throw new Error("boom");
    };
    const { onSubmit, user } = renderForm(schema(), { s3 });

    await user.upload(screen.getByLabelText("Doc"), file("bad.txt"));
    await waitFor(() => expect(screen.getByText("✖")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      await screen.findByText("Some uploads failed — remove the file and retry."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("aborts the upload when the file is removed mid-flight", async () => {
    let seenSignal: AbortSignal | undefined;
    const s3: UploaderMap[string] = (_f, { signal }) =>
      new Promise<string>(() => {
        seenSignal = signal; // never resolves
      });
    const { user } = renderForm(schema(), { s3 });

    await user.upload(screen.getByLabelText("Doc"), file("slow.txt"));
    await waitFor(() => expect(seenSignal).toBeTruthy());
    expect(seenSignal!.aborted).toBe(false);

    await user.click(screen.getByRole("button", { name: "Remove slow.txt" }));
    await waitFor(() => expect(seenSignal!.aborted).toBe(true));
    // gate released — nothing uploading anymore
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled(),
    );
  });

  it("fields without `upload` are untouched (Files pass through to onSubmit)", async () => {
    const plain: FormSchema = {
      id: "plain",
      version: 2,
      fields: [{ name: "doc", type: "file", label: "Doc" }],
    };
    const { onSubmit, user } = renderForm(plain, {});
    await user.upload(screen.getByLabelText("Doc"), file("raw.txt"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].doc).toBeInstanceOf(File);
  });

  it("a missing uploader does NOT block submit — the field degrades to a plain file field", async () => {
    // schema names an uploader, but the consumer forgot to inject it
    const { onSubmit, user } = renderForm(schema(), {});
    await user.upload(screen.getByLabelText("Doc"), file("cv.pdf"));
    expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // no swap happened — the File reaches onSubmit untouched
    expect(onSubmit.mock.calls[0][0].doc).toBeInstanceOf(File);
    expect(screen.queryByText(/wait for uploads/i)).not.toBeInTheDocument();
  });

  it("re-adding a removed (completed) file starts a fresh upload", async () => {
    const s3 = vi.fn(async (f: File) => `https://cdn.example/${f.name}`);
    const { user } = renderForm(schema(), { s3: s3 as unknown as UploaderMap[string] });

    await user.upload(screen.getByLabelText("Doc"), file("cv.pdf"));
    await waitFor(() => expect(screen.getByText("✓")).toBeInTheDocument());
    expect(s3).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Remove cv.pdf" }));
    await user.upload(screen.getByLabelText("Doc"), file("cv.pdf"));
    // stale "done" entry was dropped on removal → second upload runs
    await waitFor(() => expect(s3).toHaveBeenCalledTimes(2));
  });
});
