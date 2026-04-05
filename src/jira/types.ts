/** Jira issue as returned by the REST API v2 search endpoint */
export interface JiraIssue {
  readonly id: string;
  readonly key: string;
  readonly self: string;
  readonly fields: {
    readonly summary: string;
    readonly description: string | null;
    readonly status: { readonly name: string };
    readonly priority?: { readonly name: string } | null;
    readonly assignee?: {
      readonly displayName: string;
      readonly accountId: string;
    } | null;
    readonly labels: readonly string[];
    readonly issuetype: { readonly name: string };
  };
}

/** Jira search response (paginated) */
export interface JiraSearchResponse {
  readonly issues: readonly JiraIssue[];
  readonly total: number;
  readonly maxResults: number;
  readonly startAt: number;
}

/** Jira Cloud: email + API token → Basic auth.
 *  Jira Server/Data Center: PAT → Bearer auth. */
export type JiraAuthMode = "basic" | "bearer";

export interface JiraAuth {
  readonly mode: JiraAuthMode;
  readonly token: string;
  readonly email?: string;
}

export interface JiraClientConfig {
  readonly baseUrl: string;
  readonly auth: JiraAuth;
}
