export type OfficeKind = 'docx' | 'xlsx' | 'pptx';
export const OFFICE_FORMATS = {
  docx: { path: 'word/document.xml', root: 'document', namespace: 'wordprocessingml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { path: 'xl/workbook.xml', root: 'workbook', namespace: 'spreadsheetml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { path: 'ppt/presentation.xml', root: 'presentation', namespace: 'presentationml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
} as const;
export function isOfficeKind(value: unknown): value is OfficeKind { return value === 'docx' || value === 'xlsx' || value === 'pptx'; }
export function kindFromFilename(filename: string): OfficeKind | undefined { const value = filename.split('.').at(-1)?.toLowerCase(); return isOfficeKind(value) ? value : undefined; }
export function officeNamespace(uri: string, family: string): boolean { return uri === `http://schemas.openxmlformats.org/${family}/2006/main` || uri === `http://purl.oclc.org/ooxml/${family}/main`; }
