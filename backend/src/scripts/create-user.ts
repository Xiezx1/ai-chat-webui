import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

function getArg(name: string) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const prisma = new PrismaClient();

  const username = getArg("username");
  const password = getArg("password");
  const adminFlag = process.argv.includes("--admin");

  if (!username || !password) {
    console.log(`用法：
npm run user:create -- --username admin --password 123456 [--admin]
`);
    process.exit(1);
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    console.error("用户已存在：", username);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      password: hash,
      isAdmin: adminFlag,
    },
    select: { id: true, username: true, isAdmin: true, createdAt: true },
  });

  console.log("创建成功：", user);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
