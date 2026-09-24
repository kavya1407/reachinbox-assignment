import nodemailer from "nodemailer";

async function createEtherealAccount() {
  const testAccount = await nodemailer.createTestAccount();

  console.log("✅ Ethereal account created!");
  console.log("");
  console.log("Username:", testAccount.user);
  console.log("Password:", testAccount.pass);
  console.log("SMTP Host:", testAccount.smtp.host);
  console.log("SMTP Port:", testAccount.smtp.port);
  console.log("Web:", testAccount.web);
}

createEtherealAccount().catch(console.error);