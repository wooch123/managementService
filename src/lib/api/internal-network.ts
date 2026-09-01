/**
 * 요청이 **사내에서 왔는지 인터넷에서 왔는지** 가르는 판단. 세션·DB에 기대지 않는 순수 함수라
 * 따로 두고 시험한다(tests/unit/external-api.test.ts).
 *
 * ── 소켓 IP를 보면 안 되는 이유 ─────────────────────────────────────────────────
 * cloudflared는 터널로 받은 요청을 `http://127.0.0.1:3000`으로 넘긴다
 * (deploy/cloudflared/config.yml). 그래서 **인터넷에서 들어온 요청도 서버 눈에는 127.0.0.1**,
 * 즉 내부 접속과 똑같이 보인다. "사설 IP면 통과"로 짰다면 창구가 인터넷에 활짝 열렸을 것이다.
 * 그래서 IP가 아니라 **지나온 경로가 남긴 표식**을 본다.
 */

/** Cloudflare 엣지가 프록시하는 요청에 **직접** 붙이는 헤더들. 클라이언트가 지울 수 없다. */
const CLOUDFLARE_HEADERS = ['cf-connecting-ip', 'cf-ray', 'cf-ipcountry'] as const;

export const DEFAULT_PUBLIC_HOSTNAME = 'demo.dove9999.com';

/** 헤더를 이름으로 찾아 주는 최소 인터페이스 — NextRequest.headers와 Headers 둘 다 들어맞는다. */
export type HeaderLookup = { get(name: string): string | null };

/**
 * 인터넷 쪽에서 들어왔다고 볼 표식을 모은다. **하나라도 있으면 바깥**으로 본다 — 서로 기댈 곳이
 * 다른 근거 셋이라, 한쪽이 어긋나도 다른 쪽이 잡는다. 애매하면 잠그는 쪽으로 기운다.
 *
 *   1. Cloudflare 헤더 — 엣지가 붙이고 클라이언트가 같은 이름으로 보내도 덮어쓴다.
 *   2. 공개 호스트 이름 — 사내에서는 `192.168.x.x:3000`이나 `localhost:3000`으로 부른다.
 *   3. `x-forwarded-for`의 첫 주소가 공인 IP — 앞에 프록시를 더 두게 될 날을 위한 것.
 *      이 헤더는 위조할 수 있지만 위조하면 **더 엄격해질 뿐**이라 뚫는 데는 쓸모가 없다.
 */
export function externalSignals(headers: HeaderLookup, publicHostname?: string): string[] {
  const found: string[] = [];

  for (const name of CLOUDFLARE_HEADERS) {
    if (headers.get(name)) found.push(name);
  }

  const publicHost = (publicHostname || DEFAULT_PUBLIC_HOSTNAME).trim().toLowerCase();
  const host = (headers.get('host') || '').trim().toLowerCase().split(':')[0];
  if (host && publicHost && host === publicHost) found.push('public-host');

  const firstHop = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (firstHop && !isPrivateAddress(firstHop)) found.push('forwarded-public-ip');

  return found;
}

/** 사설·루프백 대역인가. 판단이 서지 않으면 **공인으로 친다**(잠그는 쪽). */
export function isPrivateAddress(raw: string): boolean {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv6로 감싼 IPv4

  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(ip) || ip === 'fd00::1') return true; // unique local
  if (ip.startsWith('fe80:')) return true; // link local

  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  // 각 자리는 10진수 1~3자리여야 한다. '0x7f'·'1.evil.com' 같은 것을 여기서 막는다.
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return false;
  const [a, b] = parts.map(Number);
  if (parts.some((p) => Number(p) > 255)) return false;

  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link local
  return false;
}
