import nodemailer from 'nodemailer';

// 🔥 改用 Port 587 (STARTTLS)，這是防毒軟體或防火牆最不容易擋的 Port
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // 587 埠必須設為 false，它會自動升級成加密連線
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS, 
    },
    tls: {
        rejectUnauthorized: false // 允許某些憑證寬容度，避免太嚴格被擋
    },
    // 增加詳細日誌，如果失敗可以看到是哪一步卡住
    logger: true,
    debug: true, 
    connectionTimeout: 15000, // 放寬到 15 秒
});

export async function sendNotificationEmail(report: {
    suspectName: string;
    location?: string;
    description: string;
    reporterIp: string;
}) {
    const recipients = ['crazy555059@gmail.com', 'a09552871010731@gmail.com'];
    const subject = `🚨 [兒少通報] 發現可疑人士：${report.suspectName}`;
    
    // HTML 內容 (保持原樣)
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
        console.log(`📧 [系統] 嘗試透過 Port 587 寄信給: ${recipients.join(', ')}`);
        
        const info = await transporter.sendMail({
            from: `"兒少守護小蜂" <${process.env.GMAIL_USER}>`, 
            to: recipients.join(', '), 
            subject: subject,
            html: htmlContent, 
        });

        console.log('✅ Email 寄送成功！Message ID:', info.messageId);
        return true;
    } catch (error: any) {
        console.error('❌ Email 寄送失敗:', error);
        return false;
    }
}