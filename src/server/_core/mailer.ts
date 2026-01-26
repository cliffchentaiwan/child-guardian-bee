// src/server/_core/mailer.ts
import nodemailer from 'nodemailer';

// 🔥 Debug: 印出環境變數狀態 (只印前幾碼，不要印出完整密碼)
const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_PASS;

console.log("------------------------------------------------");
console.log("📧 Mailer 初始化檢查:");
console.log(`   User: ${user ? user : '❌ 未設定'}`);
console.log(`   Pass: ${pass ? '✅ 已設定 (長度: ' + pass.length + ')' : '❌ 未設定'}`);
console.log("------------------------------------------------");

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: user,
        pass: pass,
    },
});

export async function sendNotificationEmail(report: {
    suspectName: string;
    location?: string;
    description: string;
    reporterIp: string;
}) {
    // 您的收件者
    const recipients = ['crazy555059@gmail.com', 'a09552871010731@gmail.com'];

    const subject = `🚨 [兒少通報] 發現可疑人士：${report.suspectName}`;
    
    // HTML 內容保持不變，為了版面簡潔我省略 HTML code，請用您原本的即可，或是下面這段簡易版
    const htmlContent = `
        <h2>🚨 新通報通知</h2>
        <p><strong>嫌疑人:</strong> ${report.suspectName}</p>
        <p><strong>地點:</strong> ${report.location || '未提供'}</p>
        <p><strong>描述:</strong> ${report.description}</p>
        <p><strong>來源 IP:</strong> ${report.reporterIp}</p>
    `;

    try {
        console.log(`📧 [系統] 準備寄信給: ${recipients.join(', ')}`);
        
        if (!user || !pass) {
            throw new Error("GMAIL_USER 或 GMAIL_PASS 環境變數未設定！無法寄信。");
        }

        const info = await transporter.sendMail({
            from: `"兒少守護小蜂" <${user}>`, 
            to: recipients.join(', '), 
            subject: subject,
            html: htmlContent, 
        });

        console.log('✅ Email 寄送成功！Message ID:', info.messageId);
        return true;
    } catch (error: any) {
        console.error('❌ Email 寄送失敗:', error.message);
        // 這裡我們還是不 throw error，以免影響使用者體驗，但 Log 會紀錄失敗原因
        return false;
    }
}