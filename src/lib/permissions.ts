export const PERMISSIONS = [
  { key: "crm.view", label: "View CRM records", group: "CRM" },
  { key: "crm.create", label: "Create CRM records", group: "CRM" },
  { key: "crm.edit", label: "Edit CRM records", group: "CRM" },
  { key: "crm.delete", label: "Delete CRM records", group: "CRM" },
  { key: "crm.export", label: "Export CRM records", group: "CRM" },
  { key: "opportunity.value.view", label: "See opportunity values", group: "CRM" },
  { key: "records.view_all", label: "See everyone's records (not just own)", group: "CRM" },
  { key: "leads.reassign", label: "Reassign leads", group: "Leads" },
  { key: "leads.manage_rules", label: "Manage assignment & escalation rules", group: "Leads" },
  { key: "settings.customize", label: "Customize pipelines & fields", group: "Admin" },
  { key: "users.manage", label: "Manage users & roles", group: "Admin" },
  { key: "integrations.manage", label: "Manage integrations", group: "Admin" },
  { key: "audit.view", label: "View audit log", group: "Admin" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export const DEFAULT_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: "Admin", permissions: ALL_PERMISSIONS },
  {
    name: "Manager",
    permissions: [
      "crm.view", "crm.create", "crm.edit", "crm.export", "opportunity.value.view",
      "records.view_all", "leads.reassign", "audit.view",
    ],
  },
  { name: "Sales", permissions: ["crm.view", "crm.create", "crm.edit"] },
];
