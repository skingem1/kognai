export interface BlacklistEntry {
  domain: string;
  reason: string;
  addedAt?: Date;
}

export interface SpamBlacklistTableProps {
  data?: BlacklistEntry[];
  loading?: boolean;
}