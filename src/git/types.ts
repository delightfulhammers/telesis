/** Result of a git commit operation */
export interface CommitResult {
  readonly sha: string;
  readonly branch: string;
  readonly message: string;
  readonly filesChanged: number;
}

/** Result of a git push operation */
export interface PushResult {
  readonly branch: string;
  readonly remote: string;
}
