// src/server/_core/mailer.ts
import nodemailer from 'nodemailer';

// 建立共用的傳送器
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        // 這些資料會從環境變數讀取
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS, 
    },
});

export async function sendNotificationEmail(report: {
    suspectName: string;
    location?: string;
    description: string;
    reporterIp: string;
}) {
    // 您的收件者 (除了您自己，也包含另一位管理者)
    const recipients = ['crazy555059@gmail.com', 'a09552871010731@gmail.com'];

    const subject = `🚨 [兒少通報] 發現可疑人士：${report.suspectName}`;
    
    // HTML 信件內容
    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #F59E0B; padding: 16px; text-align: center;">
            <h2 style="color: white; margin: 0;">🐝 兒少守護小蜂 - 新通報通知</h2>
        </div>
        <div style="padding: 24px; background-color: #FFFBF0;">
            <p style="font-size: 16px; color: #333;">管理員您好，系統收到一則新的通報案件：</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 100px;">嫌疑人</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; color: #d32f2f; font-weight: bold;">${report.suspectName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">發生地點</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${report.location || '未提供'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">通報來源</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace;">${report.reporterIp}</td>
                </tr>
            </table>

            <div style="margin-top: 20px; padding: 16px; background-color: white; border-left: 4px solid #F59E0B; border-radius: 4px;">
                <p style="margin: 0; font-weight: bold; color: #555;">詳細描述：</p>
                <p style="margin-top: 8px; line-height: 1.6; color: #333; white-space: pre-wrap;">${report.description}</p>
            </div>

            <p style="margin-top: 24px; font-size: 12px; color: #888; text-align: center;">
                此郵件由系統自動發送。<br>
                收到時間：${new Date().toLocaleString('zh-TW')}
            </p>
        </div>
    </div>
    `;

    try {
        console.log(`📧 [系統] 嘗試透過 Gmail 寄信給: ${recipients.join(', ')}`);
        
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