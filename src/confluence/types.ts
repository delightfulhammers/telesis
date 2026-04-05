/** Confluence API types for page fetching. */

export interface ConfluencePage {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly body: {
    readonly storage: {
      readonly value: string;
    };
  };
  readonly _links: {
    readonly webui: string;
  };
}

export interface ConfluenceSearchResponse {
  readonly results: readonly ConfluencePage[];
  readonly size: number;
  readonly start: number;
  readonly limit: number;
  readonly _links: {
    readonly next?: string;
  };
}

export interface ConfluenceClientConfig {
  readonly baseUrl: string;
  readonly auth: {
    readonly mode: "basic" | "bearer";
    readonly token: string;
    readonly email?: string;
  };
}
