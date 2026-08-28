import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  MAX_IMAGE_BYTES,
  readImageSize,
  sniffImageType,
  type AllowedImageType,
} from '@/lib/db/board-uploads';

/**
 * Tech Report에 붙는 그림(산포·Meta·Stack·Wafer map) 저장소.
 *
 * 판별·크기 제한처럼 **틀리면 위험한 부분은 게시판 저장소의 것을 그대로 쓴다**(파일 내용의 첫
 * 바이트로 형식을 판별하고, 저장 이름은 서버가 만든다). 다만 저장 위치는 나눈다 — 게시판 쪽은
 * "보내지 않고 남은 첨부"를 하루 뒤에 청소하는데, 보고서 그림은 글에 붙는 것이 아니라 늘
 * 그 상태라서 같은 통에 두면 청소에 함께 쓸려 나간다.
 *
 * 파일 이름은 무작위 UUID이고, 읽을 때는 저장소 밖을 가리키는 경로를 거부한다.
 */

const EXTENSION: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function uploadsRoot(): string {
  const base = process.env.REPORT_UPLOAD_DIR ?? path.join('data', 'uploads', 'tech-report');
  return path.isAbsolute(base) ? base : path.join(process.cwd(), base);
}

export type StoredReportImage = {
  /** 저장 이름(`YYYY-MM/uuid.png`) — 보고서 행의 그림 칸에 이 값을 담는다. */
  file: string;
  mimeType: AllowedImageType;
  byteSize: number;
  width: number | null;
  height: number | null;
};

export async function storeReportImage(bytes: Uint8Array): Promise<StoredReportImage> {
  if (bytes.byteLength === 0) throw new Error('빈 파일입니다.');
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`이미지가 너무 큽니다(최대 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB).`);
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) throw new Error('PNG · JPEG · GIF · WEBP 이미지만 올릴 수 있습니다.');

  const file = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXTENSION[mimeType]}`;
  const target = path.join(uploadsRoot(), file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);

  const size = readImageSize(bytes, mimeType);
  return { file, mimeType, byteSize: bytes.byteLength, width: size?.width ?? null, height: size?.height ?? null };
}

/** 저장 이름이 가리키는 파일. **저장소 밖을 가리키면 거부한다**(경로 탈출 방어의 마지막 관문). */
export async function readReportImage(file: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const root = path.resolve(uploadsRoot());
  const target = path.resolve(root, file);
  if (target !== path.normalize(target) || !target.startsWith(root + path.sep)) return null;
  try {
    const bytes = await fs.readFile(target);
    const sniffed = sniffImageType(new Uint8Array(bytes.buffer, bytes.byteOffset, Math.min(16, bytes.byteLength)));
    return sniffed ? { bytes, mimeType: sniffed } : null;
  } catch {
    return null;
  }
}
