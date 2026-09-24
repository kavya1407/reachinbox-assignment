import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: {
      email: "test@reachinbox.local"
    },
    update: {},
    create: {
      name: "Test User",
      email: "test@reachinbox.local"
    }
  });

  const sender = await prisma.sender.upsert({
    where: {
      id: "test-sender-001"
    },
    update: {},
    create: {
      id: "test-sender-001",
      userId: user.id,
      email: "test@example.com",
      smtpHost: "smtp.ethereal.email",
      smtpPort: 587,
      smtpUser: "test-user",
      smtpPassword: "test-password"
    }
  });

  console.log("✅ Test user created:");
  console.log(user);

  console.log("✅ Test sender created:");
  console.log(sender);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });