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
  // Its own capability rather than folded into managing users or plugins: a
  // key is standing machine access to the catalogue and, if the scope is
  // ticked, to people's names and phone numbers. Granting that is a different
  // decision from either of those, and it should have to be made on purpose.
  { key: "manage_api_keys", label: "Manage API keys", hint: "Create and revoke keys that let another system read this one" },
  { key: "view_analytics", label: "View analytics", hint: "See the views dashboard and trending content" },
  // Families, birth dates and who may collect whom. Deliberately not folded
  // into managing users: that grant is about accounts and access, this one is
  // about the people behind them, most of whom have no account at all.
  { key: "manage_people", label: "Manage households", hint: "Keep the family records, birthdays and follow-ups" },
  // The narrowest grant in the list, and on purpose: somebody running the
  // desk on a Sunday needs to check children in and out and nothing else.
  // It does not open the household list, and it is not implied by anything.
  { key: "run_checkin", label: "Run check-in", hint: "Work the check-in desk: sign children in, and release them to whoever may collect them" },
  // Money is its own decision, for the same reason an API key is: what a gift
  // record says about somebody is not something the diary's keeper should
  // acquire by being given the diary.
  { key: "manage_giving", label: "Manage giving", hint: "Set up funds, see gifts, and produce statements" },
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
  "manage_api_keys",
  "manage_categories",
  "manage_events",
  "moderate_prayer",
  "manage_people",
  "run_checkin",
  "manage_giving",
];
