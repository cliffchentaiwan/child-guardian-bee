import nodemailer from 'nodemailer';

// 🔥 回歸最單純的設定
// 因為我們已經修復了密碼空格問題，讓 Nodemailer 自動處理 Gmail 的複雜連線機制是最穩的
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS, 
    },
    // 加上這行：強制使用 IPv4 (有些雲端環境 IPv6 會爛掉)
    family: 4, 
});

export async function sendNotificationEmail(report: {
    suspectName: string;
    location?: string;
    description: string;
    reporterIp: string;
}) {
    const recipients = ['crazy555059@gmail.com', 'a09552871010731@gmail.com'];
    const subject = `🚨 [兒少通報] 發現可疑人士：${report.suspectName}`;
    
    // HTML 內容
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
        console.log(`📧 [系統] 嘗試使用 service: 'gmail' 寄信給: ${recipients.join(', ')}`);
        
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
        return false;
    }
}