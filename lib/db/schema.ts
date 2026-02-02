import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ── Auth.js tables ──────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique().notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: varchar("password_hash", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  githubUsername: varchar("github_username", { length: 255 }),
  role: varchar("role", { length: 50 }).default("client").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 })
      .$type<AdapterAccountType>()
      .notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: varchar("session_token", { length: 255 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ── Application tables ──────────────────────────────────────────

export const solutions = pgTable("solutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  githubRepoName: varchar("github_repo_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").defaultRandom().primaryKey(),
  solutionId: uuid("solution_id").references(() => solutions.id),
  fileUrl: text("file_url"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  githubIssueNumber: integer("github_issue_number"),
  githubPrNumber: integer("github_pr_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const specVersions = pgTable("spec_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  solutionId: uuid("solution_id").references(() => solutions.id),
  uploadId: uuid("upload_id").references(() => uploads.id),
  versionNumber: integer("version_number"),
  markdownContent: text("markdown_content"),
  changeReason: text("change_reason"),
  githubCommitSha: varchar("github_commit_sha", { length: 40 }),
  isCurrent: boolean("is_current").default(false),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const skillDefinitions = pgTable("skill_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectorId: varchar("connector_id", { length: 255 }).unique().notNull(),
  actionName: varchar("action_name", { length: 255 }),
  businessMeaning: text("business_meaning"),
  failureImpact: text("failure_impact"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
