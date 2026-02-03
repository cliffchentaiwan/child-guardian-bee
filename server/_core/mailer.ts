// server/_core/mailer.ts
import { Resend } from 'resend'; // 🔥【修正】改用 Resend 寄信
import { ENV } from './env'; // 導入 ENV 來取環境變數

// 初始化 Resend 客戶端
// 如果沒有環境變數，會自動切換為「僅在終端機顯示日誌」模式，避免報錯
const resend = ENV.resendApiKey ? new Resend(ENV.resendApiKey) : null;

interface EmailData {
  suspectName: string;
  location?: string;
  description: string;
  reporterIp: string;
}

export async function sendNotificationEmail(data: EmailData): Promise<boolean> {
  const { suspectName, location, description, reporterIp } = data;

  console.log(`📨 [系統通知] 收到新通報！對象：${suspectName}`);

  // 🔥【最終偵錯日誌】讓程式告訴我們它讀到了什麼
  const apiKey = ENV.resendApiKey;
  const senderEmail = ENV.resendSenderEmail;
  const adminEmail = ENV.adminEmail || senderEmail;
  
  console.log("\n📧 [郵件系統診斷]");
  console.log(` - RESEND_API_KEY: ${apiKey ? `✅ 已讀取 (前4碼: ${apiKey.substring(0, 4)}...)` : '❌ 未設定或空白'}`);
  console.log(` - RESEND_SENDER_EMAIL (寄件人): ${senderEmail ? `✅ ${senderEmail}` : '❌ 未設定或空白'}`);
  console.log(` - ADMIN_EMAIL (收件人): ${adminEmail ? `✅ ${adminEmail}` : '❌ 未設定或空白'}`);

  // 如果沒有設定 Resend API 金鑰或寄件人 Email，就提前返回
  if (!resend || !senderEmail) {
    console.error("⛔ 嚴重錯誤：無法寄信，請檢查 .env 檔案中的 RESEND_API_KEY 和 RESEND_SENDER_EMAIL 設定。");
    return false;
  }

  try {
    const data = await resend.emails.send({
      from: `兒少守護小蜂 <${senderEmail}>`,
      to: adminEmail,
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
    });

    if (data.error) {
      console.error('❌ Resend API 拒絕發送:', JSON.stringify(data.error, null, 2));
      return false;
    }

    console.log('✅ 通報信件已寄出！ Message ID:', data.data?.id);
    return true;
  } catch (error) {
    console.error("❌ 寄信程式碼崩潰:", error);
    return false;
  }
}