/**
 * 관리자 비밀번호를 바꾼다.
 *
 * 설계 DB(prisma/meta.db)가 저장소에 함께 들어 있어 **비밀번호 해시도 같이 공개된다**.
 * 받은 쪽에서든 원본에서든, 실제로 쓰는 곳이라면 받은 직후 한 번 바꾸는 것이 맞다.
 *
 * 실행: pnpm admin:password "새 비밀번호"
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import path from 'node:path';

const password = process.argv[2];
if (!password || password.length < 6) {
  console.error('사용법: pnpm admin:password "새 비밀번호"   (6자 이상)');
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: `file:${path.join(process.cwd(), 'prisma', 'meta.db')}` });
const user = await prisma.adminUser.findFirst();
if (!user) {
  console.error('관리자 계정이 없습니다. `pnpm db:seed`로 먼저 만드세요.');
  process.exit(1);
}
await prisma.adminUser.update({
  where: { id: user.id },
  data: { passwordHash: await bcrypt.hash(password, 10) },
});
await prisma.$disconnect();
console.log(`'${user.username}' 계정의 비밀번호를 바꿨습니다. 열려 있던 세션은 그대로이니 필요하면 로그아웃하세요.`);
