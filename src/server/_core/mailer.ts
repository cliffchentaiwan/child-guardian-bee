import nodemailer from 'nodemailer';

// 🔥 改用明確的 host 與 port 設定，解決 Timeout 問題
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // 使用 SSL 加密連線
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS, 
    },
    // 增加連線逾時設定，避免轉圈轉太久 (設為 10秒)
    connectionTimeout: 10000, 
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
    
    // HTML 內容 (維持您原本漂亮的樣式)
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #F59E0B; padding: 16px; text-align: center;">
            <h2 style="color: white; margin: 0;">🐝 兒少守護小蜂 - 新通報通知</h2>
        </div>
        <div style="padding: 24px; background-color: #FFFBF0;">
            <p><strong>嫌疑人：</strong> ${report.suspectName}</p>
            <p><strong>地點：</strong> ${report.location || '未提供'}</p>
            <p><strong>描述：</strong> ${report.description}</p>
            <p style="font-size: 12px; color: #888;">來源 IP: ${report.reporterIp}</p>
        </div>
    </div>
    `;

    try {
        console.log(`📧 [系統] 準備透過 Port 465 寄信給: ${recipients.join(', ')}`);
        
        const info = await transporter.sendMail({
            from: `"兒少守護小蜂" <${process.env.GMAIL_USER}>`, 
            to: recipients.join(', '), 
            subject: subject,
            html: htmlContent, 
        });

        console.log('✅ Email 寄送成功！Message ID:', info.messageId);
        return true;
    } catch (error: any) {
        console.error('❌ Email 寄送失敗:', error.message);
        // 如果是 Timeout，可以在這裡看到更清楚的原因
        return false;
    }
}