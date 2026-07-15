/**
 * Next.js App Router example — the SAME schema validates on the client (via
 * <FormRender>) and on the server (via compileZod in a server action), so
 * tampered requests can't bypass validation.
 *
 * Structure in a real app:
 *   app/signup/schema.ts    ← the shared schema (this file's `signupSchema`)
 *   app/signup/actions.ts   ← "use server" (this file's `createAccount`)
 *   app/signup/page.tsx     ← client component rendering <FormRender>
 */
import { compileZod, defineSchema } from "../src";
import type { InferValues } from "../src";
import type { SubmitResult } from "../src/types";

// ── shared schema (imported by both sides) ──────────────────────────────

export const signupSchema = defineSchema({
  id: "signup",
  version: 1,
  title: "Create account",
  fields: [
    {
      name: "email",
      type: "email",
      label: "Email",
      validation: { required: { message: "Email is required." }, email: { message: "Invalid email." } },
    },
    {
      name: "password",
      type: "password",
      label: "Password",
      validation: {
        required: { message: "Password is required." },
        minLength: { value: 8, message: "At least {value} characters." },
      },
    },
    { name: "team", type: "text", label: "Team name" },
  ],
});

export type SignupValues = InferValues<typeof signupSchema>;

// ── server side (actions.ts — add "use server" at the top) ──────────────

export async function createAccount(values: SignupValues): Promise<SubmitResult | void> {
  // never trust the client: re-validate with the same compiled schema
  const parsed = compileZod(signupSchema).safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".")] ??= issue.message;
    }
    return { errors };
  }

  // domain checks map to field errors the form will focus + display
  const taken = await isEmailTaken(parsed.data.email as string);
  if (taken) return { errors: { email: "An account with this email already exists." } };

  await saveAccount(parsed.data as SignupValues);
  // return nothing on success — the form clears its draft automatically
}

// ── client side (page.tsx — "use client") ───────────────────────────────
//
// import { FormRender } from "schema-form-engine";
// import { shadcnComponents, shadcnSlots } from "@/lib/form-render-shadcn";
// import { signupSchema, createAccount, type SignupValues } from "./…";
//
// export default function SignupPage() {
//   return (
//     <FormRender<SignupValues>
//       schema={signupSchema}
//       components={shadcnComponents}
//       slots={shadcnSlots}
//       onSubmit={createAccount}   // ← the server action, typed end to end
//     />
//   );
// }

// (stubs so this example type-checks standalone)
async function isEmailTaken(_email: string): Promise<boolean> {
  return false;
}
async function saveAccount(_values: SignupValues): Promise<void> {}
