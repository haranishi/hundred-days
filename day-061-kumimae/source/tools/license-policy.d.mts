export interface PackageMetadata { name: string; version: string; license: string }
export interface LockedMetadata { version: string; license: string; integrity: string }
export declare function policyFor(name: string): { files: string[]; scope: string }
export declare function validatePackageMetadata(pkg: PackageMetadata, locked: LockedMetadata, expectedName: string): void
export declare function validateMitText(text: string, source: string): string
export declare function validateEmbeddedNotices(notices: string[], source: string): void
export declare function embeddedNotices(source: string): string[]
export declare function viteCoreLicense(text: string): string
export declare function sha256(content: string | Uint8Array): string
export declare const virtualOwners: Map<string, string>
export declare const fiberLicense: { version: string; file: string; source: string; packageMetadata: string; sha256: string }
