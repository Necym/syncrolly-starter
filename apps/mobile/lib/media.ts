import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File as ExpoFile } from 'expo-file-system';

export interface PendingUploadImage {
  base64: string;
  contentType: string;
  fileExtension: string;
  previewUri: string;
}

export interface PendingUploadVideo {
  uri: string;
  contentType: string;
  fileExtension: string;
  fileName: string;
  fileSize?: number;
  durationLabel?: string;
}

export type PendingUploadLessonAssetKind = 'video' | 'document';

export interface PendingUploadLessonAsset {
  kind: PendingUploadLessonAssetKind;
  uri: string;
  contentType: string;
  fileExtension: string;
  fileName: string;
  fileSize?: number;
  displayLabel?: string;
}

function getMediaContentType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  const fileName = asset.fileName?.trim().toLowerCase();

  if (fileName?.endsWith('.png')) {
    return 'image/png';
  }

  if (fileName?.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function getMediaExtension(asset: ImagePicker.ImagePickerAsset): string {
  const fileName = asset.fileName?.trim().toLowerCase();

  if (fileName?.includes('.')) {
    return fileName.split('.').pop() || 'jpg';
  }

  const contentType = getMediaContentType(asset);

  if (contentType === 'image/png') {
    return 'png';
  }

  if (contentType === 'image/webp') {
    return 'webp';
  }

  return 'jpg';
}

function getVideoContentType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  const fileName = asset.fileName?.trim().toLowerCase();

  if (fileName?.endsWith('.mov')) {
    return 'video/quicktime';
  }

  if (fileName?.endsWith('.m4v')) {
    return 'video/x-m4v';
  }

  if (fileName?.endsWith('.webm')) {
    return 'video/webm';
  }

  return 'video/mp4';
}

function getVideoExtension(asset: ImagePicker.ImagePickerAsset): string {
  const fileName = asset.fileName?.trim().toLowerCase();

  if (fileName?.includes('.')) {
    return fileName.split('.').pop() || 'mp4';
  }

  const contentType = getVideoContentType(asset);

  if (contentType === 'video/quicktime') {
    return 'mov';
  }

  if (contentType === 'video/webm') {
    return 'webm';
  }

  if (contentType === 'video/x-m4v') {
    return 'm4v';
  }

  return 'mp4';
}

function getDocumentContentType(asset: DocumentPicker.DocumentPickerAsset) {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  const fileName = asset.name?.trim().toLowerCase();

  if (fileName?.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (fileName?.endsWith('.doc')) {
    return 'application/msword';
  }

  if (fileName?.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return 'application/octet-stream';
}

function getDocumentExtension(asset: DocumentPicker.DocumentPickerAsset) {
  const fileName = asset.name?.trim().toLowerCase();

  if (fileName?.includes('.')) {
    return fileName.split('.').pop() || 'pdf';
  }

  const contentType = getDocumentContentType(asset);

  if (contentType === 'application/msword') {
    return 'doc';
  }

  if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }

  return 'pdf';
}

function getDocumentDisplayLabel(asset: DocumentPicker.DocumentPickerAsset) {
  const extension = getDocumentExtension(asset);

  if (extension === 'pdf') {
    return 'PDF document';
  }

  if (extension === 'doc' || extension === 'docx') {
    return 'Word document';
  }

  return 'Document';
}

function formatDurationLabel(durationMs: number | null | undefined) {
  if (!durationMs || durationMs <= 0) {
    return undefined;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!minutes) {
    return `${seconds}s`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function base64ToArrayBuffer(base64Value: string): ArrayBuffer {
  const binaryString = atob(base64Value);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes.buffer;
}

export async function fileUriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const file = new ExpoFile(uri);
  return file.arrayBuffer();
}

export async function pickImageForUpload(options?: {
  aspect?: [number, number];
  quality?: number;
}): Promise<PendingUploadImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: options?.aspect ?? [1, 1],
    quality: options?.quality ?? 0.82,
    base64: true
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset.base64) {
    throw new Error('The selected image could not be prepared for upload. Please try another image.');
  }

  return {
    base64: asset.base64,
    contentType: getMediaContentType(asset),
    fileExtension: getMediaExtension(asset),
    previewUri: asset.uri
  };
}

export async function pickVideoForUpload(): Promise<PendingUploadVideo | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    quality: 1
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];

  return {
    uri: asset.uri,
    contentType: getVideoContentType(asset),
    fileExtension: getVideoExtension(asset),
    fileName: asset.fileName?.trim() || `lesson-video.${getVideoExtension(asset)}`,
    fileSize: asset.fileSize,
    durationLabel: formatDurationLabel(asset.duration)
  };
}

export async function pickLessonDocumentForUpload(): Promise<PendingUploadLessonAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    multiple: false,
    copyToCacheDirectory: true
  });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];

  return {
    kind: 'document',
    uri: asset.uri,
    contentType: getDocumentContentType(asset),
    fileExtension: getDocumentExtension(asset),
    fileName: asset.name?.trim() || `lesson-document.${getDocumentExtension(asset)}`,
    fileSize: asset.size ?? undefined,
    displayLabel: getDocumentDisplayLabel(asset)
  };
}

export async function pickLessonVideoForUpload(): Promise<PendingUploadLessonAsset | null> {
  const asset = await pickVideoForUpload();

  if (!asset) {
    return null;
  }

  return {
    kind: 'video',
    uri: asset.uri,
    contentType: asset.contentType,
    fileExtension: asset.fileExtension,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    displayLabel: asset.durationLabel
  };
}
