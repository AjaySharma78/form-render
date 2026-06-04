import type { FormSchema } from "../src/types";

/**
 * Comprehensive multi-step demo schema for the PostgreSQL connection form.
 *
 * Three gated steps (the SSH step is conditional), exercising every supported
 * input type plus the major features:
 * - text-like: text, email, password, search, tel, url
 * - numeric:   number, range
 * - pickers:   color, date, datetime-local, month, time, week
 * - choice:    checkbox, switch, radio, select, select+multiple, file, file+multiple, hidden
 * - other:     textarea
 * - features:  multi-step + gated nav, conditional step/fields (visibleWhen),
 *              requiredWhen, cross-field rule, sections, layout, addons,
 *              async validation, per-field styling.
 */
export const postgresSchema: FormSchema = {
  id: "postgres-connection",
  version: 1,
  settings: {
    columns: 2,
    validateOn: "onBlur",
    stepValidation: "gated",
    navigation: { next: "Next", back: "Back", finish: "Save Connection" },
    persist: "session",
  },
  rules: [
    {
      type: "equals",
      fields: ["password", "confirmPassword"],
      path: "confirmPassword",
      message: "Passwords must match.",
    },
  ],
  steps: [
    // ───────────────────────── Step 1: core connection ─────────────────────
    {
      id: "connection",
      title: "Connection",
      layout: [
        ["connectionName"],
        ["host", "port"],
        ["username"],
        ["password", "confirmPassword"],
        ["database"],
        ["useSshTunnel"],
      ],
      fields: [
        {
          name: "connectionName",
          type: "text",
          label: "Connection Name",
          placeholder: "My Production Database",
          description: "A unique name to identify this database connection.",
          validation: {
            required: { message: "Connection Name is required." },
            pattern: { value: "^[A-Za-z0-9 ]+$", message: "Letters, numbers and spaces only." },
          },
          asyncValidation: { resolver: "checkConnectionName", debounceMs: 400 },
        },
        {
          name: "host",
          type: "text",
          label: "Host",
          placeholder: "localhost",
          prefix: "postgres://",
          validation: { required: { message: "Host is required." } },
        },
        {
          name: "port",
          type: "number",
          label: "Port",
          placeholder: "5432",
          default: 5432,
          step: 1,
          validation: {
            required: { message: "Port is required." },
            min: { value: 1, message: "Port must be between 1 and 65535." },
            max: { value: 65535, message: "Port must be between 1 and 65535." },
          },
        },
        {
          name: "username",
          type: "text",
          label: "Username",
          placeholder: "postgres",
          validation: {
            required: { message: "Username is required." },
            minLength: { value: 3, message: "Username must be at least 3 characters." },
          },
        },
        {
          name: "password",
          type: "password",
          label: "Password",
          placeholder: "Enter password",
          validation: {
            required: { message: "Password is required." },
            minLength: { value: 8, message: "Password must be at least 8 characters." },
          },
        },
        {
          name: "confirmPassword",
          type: "password",
          label: "Confirm Password",
          placeholder: "Re-enter password",
          validation: { required: { message: "Please confirm the password." } },
        },
        {
          name: "database",
          type: "text",
          label: "Database Name",
          placeholder: "myapp_production",
          validation: {
            required: { message: "Database Name is required." },
            minLength: { value: 1, message: "Database Name must not be empty." },
          },
        },
        {
          name: "useSshTunnel",
          type: "switch",
          label: "Use SSH Tunnel",
          description: "Enable to add an SSH Tunnel step.",
          default: false,
          width: "full",
        },
      ],
    },

    // ──────────────────── Step 2: every other input type ───────────────────
    {
      id: "details",
      title: "Owner & Options",
      sections: [
        { id: "contact", title: "Owner Contact", fields: ["ownerEmail", "ownerPhone", "docsUrl", "searchTag"] },
        { id: "tuning", title: "Tuning", fields: ["poolSize", "queryTimeout"] },
        {
          id: "schedule",
          title: "Schedule",
          fields: ["activationDate", "maintenanceAt", "billingMonth", "backupTime", "reportWeek"],
        },
        {
          id: "preferences",
          title: "Preferences",
          fields: ["brandColor", "sslMode", "region", "features", "enableLogging", "readOnlyMode"],
          // explicit rows inside the section (each row's fields split evenly)
          layout: [
            ["brandColor", "sslMode"],
            ["features", "region"],
            ["enableLogging", "readOnlyMode"],
          ],
        },
        { id: "misc", title: "Notes & Files", fields: ["notes", "caCertificate", "attachments", "internalId"] },
      ],
      fields: [
        // text-like
        {
          name: "ownerEmail",
          type: "email",
          label: "Owner Email",
          placeholder: "you@example.com",
          width: "half",
          validation: {
            required: { message: "Owner email is required." },
            email: { message: "Enter a valid email address." },
          },
        },
        { name: "ownerPhone", type: "tel", label: "Phone", placeholder: "+1 555 123 4567", width: "half" },
        {
          name: "docsUrl",
          type: "url",
          label: "Docs URL",
          placeholder: "https://wiki.example.com/db",
          width: "half",
          validation: { url: { message: "Enter a valid URL." } },
        },
        { name: "searchTag", type: "search", label: "Search Tag", placeholder: "Search a tag…", width: "half" },

        // numeric
        {
          name: "poolSize",
          type: "number",
          label: "Pool Size",
          default: 10,
          width: "half",
          validation: {
            min: { value: 1, message: "At least 1 connection." },
            max: { value: 100, message: "At most 100 connections." },
          },
        },
        {
          name: "queryTimeout",
          type: "range",
          label: "Query Timeout (seconds)",
          default: 30,
          min: 5,
          max: 120,
          step: 5,
          width: "half",
        },

        // date & time
        { name: "activationDate", type: "date", label: "Activation Date", width: "half" },
        { name: "maintenanceAt", type: "datetime-local", label: "Maintenance Window", width: "half" },
        { name: "billingMonth", type: "month", label: "Billing Month", width: "third" },
        { name: "backupTime", type: "time", label: "Daily Backup Time", default: "02:00", width: "third" },
        { name: "reportWeek", type: "week", label: "Report Week", width: "third" },

        // pickers & choices
        // (no per-field width — the section's `layout` rows split evenly)
        { name: "brandColor", type: "color", label: "Dashboard Color", default: "#4f46e5" },
        {
          name: "sslMode",
          type: "radio",
          label: "SSL Mode",
          default: "require",
          options: [
            { value: "disable", label: "Disable" },
            { value: "require", label: "Require" },
            { value: "verify-full", label: "Verify Full" },
          ],
        },
        {
          name: "region",
          type: "select",
          label: "Region",
          placeholder: "Select a region",
          clearable: true,
          options: [
            { value: "us-east-1", label: "US East (N. Virginia)" },
            { value: "eu-west-1", label: "EU West (Ireland)" },
            { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
          ],
        },
        {
          name: "features",
          type: "select",
          multiple: true, // ← multi-select dropdown (array value)
          label: "Enabled Features",
          placeholder: "Select features",
          options: [
            { value: "pgvector", label: "pgvector" },
            { value: "postgis", label: "PostGIS" },
            { value: "timescale", label: "TimescaleDB" },
            { value: "citus", label: "Citus" },
          ],
          validation: { maxItems: { value: 3, message: "Pick at most 3 features." } },
        },
        { name: "enableLogging", type: "checkbox", label: "Enable query logging" },
        { name: "readOnlyMode", type: "switch", label: "Read-only connection" },

        // other
        {
          name: "notes",
          type: "textarea",
          label: "Notes",
          placeholder: "Anything worth recording about this connection…",
          rows: 4,
          width: "full",
        },
        {
          name: "caCertificate",
          type: "file",
          label: "CA Certificate",
          description: "Optional. PDF/CRT, up to 1 MB.",
          accept: [".pdf", ".crt"],
          width: "full",
          validation: { maxSize: { value: 1, message: "Max file size is 1 MB." } },
        },
        {
          name: "attachments",
          type: "file",
          label: "Attachments",
          description: "Optional. Up to 5 files, 5 MB each. Drag and drop several at once.",
          multiple: true,
          accept: [".pdf", ".png", ".jpg", ".jpeg", ".txt"],
          width: "full",
          validation: {
            maxFiles: { value: 5, message: "Attach at most 5 files." },
            maxSize: { value: 5, message: "Each file must be 5 MB or smaller." },
          },
        },
        { name: "internalId", type: "hidden", default: "auto-generated" },
      ],
    },

    // ─────────────── Step 3: conditional SSH tunnel (visibleWhen) ───────────
    {
      id: "ssh",
      title: "SSH Tunnel",
      description: "Connect through a bastion/jump host for databases in private networks.",
      visibleWhen: { field: "useSshTunnel", is: true },
      fields: [
        {
          name: "sshHost",
          type: "text",
          label: "SSH Host",
          placeholder: "bastion.example.com",
          width: "half",
          requiredWhen: { field: "useSshTunnel", is: true },
        },
        { name: "sshPort", type: "number", label: "SSH Port", default: 22, width: "half" },
        {
          name: "sshAuthMethod",
          type: "radio",
          label: "Authentication Method",
          default: "password",
          width: "full",
          options: [
            { value: "password", label: "Password" },
            { value: "privateKey", label: "Private Key" },
          ],
        },
        {
          name: "sshPassword",
          type: "password",
          label: "SSH Password",
          placeholder: "Enter SSH password",
          width: "full",
          visibleWhen: { field: "sshAuthMethod", is: "password" },
        },
        {
          name: "sshPrivateKey",
          type: "textarea",
          label: "SSH Private Key",
          placeholder: "-----BEGIN RSA PRIVATE KEY-----\n...",
          rows: 8,
          width: "full",
          classNames: { control: "font-mono text-sm" },
          visibleWhen: { field: "sshAuthMethod", is: "privateKey" },
        },
      ],
    },
  ],
  actions: [{ name: "test", type: "button", text: "Test Connection", action: "test" }],
};
