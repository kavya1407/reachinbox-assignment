import nodemailer from "nodemailer";

interface SenderSMTPConfig {
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
}

export async function sendEmail(
  sender: SenderSMTPConfig,
  to: string,
  subject: string,
  body: string
) {
  /*
   * Create a transporter for the configured sender.
   *
   * Each sender can therefore have its own
   * SMTP server and credentials.
   */
  const transporter =
    nodemailer.createTransport({
      host: sender.smtpHost,
      port: sender.smtpPort,

      /*
       * Port 465 normally uses SSL.
       * Port 587 normally uses STARTTLS.
       */
      secure:
        sender.smtpPort === 465,

      auth: {
        user: sender.smtpUser,
        pass: sender.smtpPassword
      }
    });

  /*
   * Verify the SMTP connection before sending.
   * This gives clearer errors if the sender
   * configuration is incorrect.
   */
  await transporter.verify();

  const info =
    await transporter.sendMail({
      from: sender.email,
      to,
      subject,
      text: body
    });

  /*
   * Ethereal provides a preview URL when
   * using Ethereal SMTP.
   */
  const previewUrl =
    nodemailer.getTestMessageUrl(info);

  return {
    messageId:
      info.messageId,
    previewUrl
  };
}