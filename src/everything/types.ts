export interface EverythingSearchResult {
  path: string
  isDirectory: boolean
}

export type SearchWithSdk = (search: string, limit: number) => Promise<EverythingSearchResult[]>
