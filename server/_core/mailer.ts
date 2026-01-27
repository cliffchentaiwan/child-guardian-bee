// server/_core/mailer.ts
import nodemailer from 'nodemailer';

// 設定郵件傳送器 (使用 Gmail 或其他 SMTP)
// 如果沒有環境變數，會自動切換為「僅在終端機顯示日誌」模式，避免報錯
const transporter = process.env.GMAIL_USER && process.env.GMAIL_PASS
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    })
  : null;

interface EmailData {
  suspectName: string;
  location?: string;
  description: string;
  reporterIp: string;
}

export async function sendNotificationEmail(data: EmailData) {
  const { suspectName, location, description, reporterIp } = data;

  console.log(`📨 [系統通知] 收到新通報！對象：${suspectName}`);

  // 如果沒有設定 SMTP，就只印出 Log
  if (!transporter) {
    console.log("⚠️ 未設定 GMAIL_USER/PASS，跳過寄信。僅記錄於 Log。");
    return;
  }

  try {
    const mailOptions = {
      from: `"兒少守護小蜂" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.GMAIL_USER, // 寄給管理員
      subject: `🚨 [新通報] 發現潛在風險：${suspectName}`,
      html: `
        <h2>⚠️ 收到新的違規通報</h2>
        <p><strong>被通報人/單位：</strong> ${suspectName}</p>
        <p><strong>地點：</strong> ${location || '未提供'}</p>
        <p><strong>詳細描述：</strong></p>
        <blockquote style="background: #f9f9f9; padding: 10px; border-left: 5px solid #ff0000;">
          ${description.replace(/\n/g, '<br>')}
        </blockquote>
        <hr>
        <p><small>通報來源 IP: ${reporterIp}</small></p>
        <p><small>通報時間: ${new Date().toLocaleString()}</small></p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ 通報信件已寄出！");
  } catch (error) {
    console.error("❌ 寄信失敗:", error);
    // 不拋出錯誤，避免影響使用者介面
  }
}