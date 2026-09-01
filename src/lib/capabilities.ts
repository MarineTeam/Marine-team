/** Fixed set of grantable capabilities, phpBB/WordPress-style. Custom permission groups pick a subset of these. */
export const CAPABILITIES = [
  { key: "manage_categories", label: "Manage categories", hint: "Create, reorder, and delete categories" },
  { key: "manage_series", label: "Manage series", hint: "Create, edit, and delete series" },
  { key: "manage_videos", label: "Manage videos", hint: "Upload, edit, and delete videos" },
  { key: "manage_files", label: "Manage files", hint: "Upload, edit, and delete files" },
  { key: "publish_content", label: "Publish content", hint: "Publish/unpublish, feature, and pin content" },
  { key: "moderate_comments", label: "Moderate comments", hint: "Delete or hide any comment, not just your own" },
  { key: "share_content", label: "Share restricted content", hint: "Create share links that grant access to member-only or restricted content" },
  { key: "manage_users", label: "Manage users", hint: "Grant access and change roles" },
  { key: "manage_permissions", label: "Manage permissions", hint: "Create groups and assign them to users" },
  { key: "manage_plugins", label: "Manage plugins", hint: "Enable or disable optional features" },
  // Church life: the diary, the sign-up sheets and the group list are one
  // job, usually one person's. Prayer is deliberately not in with them —
  // approving a request somebody wrote about their marriage is pastoral work,
  // and often not the person who books the hall.
  { key: "manage_events", label: "Manage events, forms and groups", hint: "Publish events and see who signed up, build forms, and keep the small-group list" },
  { key: "moderate_prayer", label: "Moderate the prayer wall", hint: "Approve, hide and mark answered the requests members post" },
  { key: "view_audit_log", label: "View audit log", hint: "See the history of admin/editor actions" },
  { key: "view_analytics", label: "View analytics", hint: "See the views dashboard and trending content" },
] as const;

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"];

export const CAPABILITY_KEYS: CapabilityKey[] = CAPABILITIES.map((c) => c.key);

/** Capabilities that only make sense as a site-wide grant, not scoped to a category/series. */
export const SITE_WIDE_ONLY_CAPABILITIES: CapabilityKey[] = [
  "manage_users",
  "manage_permissions",
  "manage_plugins",
  "view_audit_log",
  "view_analytics",
  "manage_categories",
  "manage_events",
  "moderate_prayer",
];
