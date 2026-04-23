import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

const VOICE_ASSISTANT_DIRECTORY_NAME = 'voice-assistant';

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return '';
  }

  return fileName.slice(lastDotIndex).toLowerCase();
}

export function getAudioMimeType(fileName: string): string {
  const extension = getFileExtension(fileName);

  if (extension === '.wav') {
    return 'audio/wav';
  }

  if (extension === '.mp3') {
    return 'audio/mpeg';
  }

  if (extension === '.webm') {
    return 'audio/webm';
  }

  if (extension === '.ogg') {
    return 'audio/ogg';
  }

  if (extension === '.aac') {
    return 'audio/aac';
  }

  if (extension === '.flac') {
    return 'audio/flac';
  }

  return 'audio/mp4';
}

export function getAudioFileNameFromUri(uri: string): string {
  const decodedUri = decodeURIComponent(uri);
  const candidate = decodedUri.split('/').pop()?.trim();

  return candidate || `voice-note-${Date.now()}.m4a`;
}

export async function readRecordingAsBase64(uri: string) {
  const file = new File(uri);
  const fileName = getAudioFileNameFromUri(uri);

  return {
    fileName,
    audioMimeType: getAudioMimeType(fileName),
    audioBase64: await file.base64()
  };
}

function getReplyFileExtension(audioMimeType: string): string {
  if (audioMimeType === 'audio/wav') {
    return 'wav';
  }

  if (audioMimeType === 'audio/aac') {
    return 'aac';
  }

  return 'mp3';
}

export async function writeAssistantAudioToCache(
  audioBase64: string,
  audioMimeType: string
): Promise<string> {
  const voiceAssistantDirectory = new Directory(Paths.cache, VOICE_ASSISTANT_DIRECTORY_NAME);
  voiceAssistantDirectory.create({
    idempotent: true,
    intermediates: true
  });

  const outputFile = new File(
    voiceAssistantDirectory,
    `assistant-reply-${Date.now()}.${getReplyFileExtension(audioMimeType)}`
  );

  outputFile.create({
    overwrite: true,
    intermediates: true
  });
  await LegacyFileSystem.writeAsStringAsync(outputFile.uri, audioBase64, {
    encoding: LegacyFileSystem.EncodingType.Base64
  });

  return outputFile.uri;
}

export function deleteLocalAudioFile(uri: string | null | undefined) {
  if (!uri) {
    return;
  }

  try {
    const file = new File(uri);

    if (file.exists) {
      file.delete();
    }
  } catch {
    // Ignore cache cleanup issues for the prototype flow.
  }
}
