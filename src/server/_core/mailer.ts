// src/server/_core/mailer.ts
import { Resend } from 'resend';

// 初始化 Resend
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendNotificationEmail(report: {
    suspectName: string;
    location?: string;
    description: string;
    reporterIp: string;
}) {
    // ⚠️ 注意：Resend 免費版規定「只能寄給您註冊帳號時用的那個信箱」
    // 如果您註冊是用 crazy555059，那另一個信箱可能會收不到，這是正常的
    const recipients = ['crazy555059@gmail.com', 'a09552871010731@gmail.com'];

    const subject = `🚨 [兒少通報] 發現可疑人士：${report.suspectName}`;
    
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
        console.log(`📧 [系統] 嘗試透過 Resend API 寄信...`);
        
        const data = await resend.emails.send({
            from: '兒少守護小蜂 <onboarding@resend.dev>', // 測試專用官方帳號，別改它
            to: recipients,
            subject: subject,
            html: htmlContent,
        });

        if (data.error) {
            console.error('❌ Resend 回傳錯誤:', data.error);
            return false;
        }

        console.log('✅ Email 寄送成功！ID:', data.data?.id);
        return true;
    } catch (error: any) {
        console.error('❌ 寄信發生未預期錯誤:', error.message);
        return false;
    }
}