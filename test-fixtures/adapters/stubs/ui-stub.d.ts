/**
 * The shadcn template imports the CONSUMER's generated ui components
 * ("@/components/ui/…"), which don't exist here — wildcard-stub them so the
 * template's engine-facing types (FieldComponentProps, slots, fileKey, …)
 * still typecheck strictly. The real Chakra/Mantine/MUI/antd adapters compile
 * against their actual published types, no stubs involved.
 */
declare module "@/components/ui/*";
declare module "@/lib/utils" {
  export function cn(...inputs: unknown[]): string;
}
