import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 게시판에 붙는 이미지 파일 저장소.
 *
 * 파일은 `data/uploads/board/<YYYY-MM>/<임의이름>.<확장자>`에 두고, DB(`BoardAttachment`)에는
 * 메타만 남긴다 — 이미지를 SQLite에 넣으면 DB가 급격히 커지고 WAL·일별 백업이 함께 무거워진다.
 * `data/`는 빌드 폴더(.next-a/.next-b) 밖이라 무중단 배포로 프로세스를 옮겨도 그대로 남는다.
 *
 * 보안상 지키는 것 세 가지:
 *   1. 저장 이름은 **서버가 만든다**. 업로드된 파일명은 표시용으로만 쓰고 경로에 절대 넣지 않는다.
 *   2. 클라이언트가 알려준 MIME을 믿지 않고 **첫 바이트(매직 넘버)로 직접 판별**한다.
 *   3. 허용 형식·크기를 넘으면 저장하지 않는다.
 */

/** 허용 이미지 형식 — 매직 넘버로 판별한 결과만 신뢰한다. */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** 한 장 최대 크기. 화면에 붙여넣는 캡처 이미지 기준으로 넉넉하다. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function uploadsRoot(): string {
  const base = process.env.BOARD_UPLOAD_DIR ?? path.join('data', 'uploads', 'board');
  return path.isAbsolute(base) ? base : path.join(process.cwd(), base);
}

/**
 * 파일 내용으로 실제 형식을 판별한다. 확장자나 Content-Type이 아니라 **첫 바이트**를 본다 —
 * `.png`으로 위장한 HTML을 그대로 저장했다가 나중에 그 경로를 열게 되는 경로를 막는다.
 */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  // WEBP = "RIFF" .... "WEBP"
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

/**
 * PNG·GIF·JPEG의 헤더에서 크기를 읽는다(있으면 목록에서 자리를 미리 잡아 화면이 덜 흔들린다).
 * 못 읽으면 null — 크기를 모르는 것이 저장을 막을 이유는 아니다.
 */
export function readImageSize(bytes: Uint8Array, type: AllowedImageType): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === 'image/png') return { width: view.getUint32(16), height: view.getUint32(20) };
    if (type === 'image/gif') return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (type === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        const length = view.getUint16(offset + 2);
        // SOF0~SOF15(단, DHT/DAC/RST 제외)에 세로·가로가 들어 있다.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    return null; // 헤더가 잘려 있어도 저장 자체는 막지 않는다
  }
  return null;
}

export type StoredImage = {
  fileName: string;
  mimeType: AllowedImageType;
  byteSize: number;
  width: number | null;
  height: number | null;
};

/** 저장 이름은 임의로 만든다 — 업로드된 이름이 경로에 섞이지 않게 한다. */
function makeFileName(type: AllowedImageType): string {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  return `${month}/${randomUUID()}.${EXTENSION[type]}`;
}

export async function storeImage(bytes: Uint8Array, declaredName: string): Promise<StoredImage> {
  if (bytes.byteLength === 0) throw new Error('빈 파일입니다.');
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`이미지가 너무 큽니다(최대 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB).`);
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) throw new Error('PNG · JPEG · GIF · WEBP 이미지만 올릴 수 있습니다.');

  const fileName = makeFileName(mimeType);
  const target = path.join(uploadsRoot(), fileName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);

  const size = readImageSize(bytes, mimeType);
  void declaredName; // 원본 이름은 DB에만 남긴다(경로 계산에는 쓰지 않는다)
  return { fileName, mimeType, byteSize: bytes.byteLength, width: size?.width ?? null, height: size?.height ?? null };
}

/**
 * 저장된 파일을 읽는다. `fileName`은 DB에 있는 값만 넘어오지만, 혹시라도 조작된 값이 닿았을 때를
 * 대비해 **저장소 밖을 가리키면 거부**한다(경로 탈출 방어의 마지막 관문).
 */
export async function readImage(fileName: string): Promise<Buffer | null> {
  const root = uploadsRoot();
  const target = path.resolve(root, fileName);
  if (target !== path.normalize(target) || !target.startsWith(path.resolve(root) + path.sep)) return null;
  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

export async function deleteImage(fileName: string): Promise<void> {
  const root = uploadsRoot();
  const target = path.resolve(root, fileName);
  if (!target.startsWith(path.resolve(root) + path.sep)) return;
  await fs.rm(target, { force: true });
}

/** 같은 내용이면 같은 값 — 브라우저 캐시 검증(ETag)에 쓴다. */
export function etagFor(id: string, byteSize: number): string {
  return `"${createHash('sha256').update(`${id}:${byteSize}`).digest('hex').slice(0, 32)}"`;
}
