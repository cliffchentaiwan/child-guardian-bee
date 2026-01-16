/**
 * 通報資料匯出模組
 * 
 * 將通報資料匯出為 Excel 檔案並上傳到 Google Drive
 */

import ExcelJS from 'exceljs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// Google Drive 設定
const GDRIVE_CONFIG = '/home/ubuntu/.gdrive-rclone.ini';
const GDRIVE_REMOTE = 'manus_google_drive';
const GDRIVE_FOLDER = '兒少守護小蜂/通報資料';

/**
 * 通報資料介面
 */
export interface ReportData {
  id: number;
  suspectName: string;
  location: string | null;
  description: string;
  status: string;
  reviewNote: string | null;
  reporterIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 建立 Excel 檔案
 */
export async function createReportExcel(reports: ReportData[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '兒少守護小蜂';
  workbook.created = new Date();
  
  const worksheet = workbook.addWorksheet('通報資料', {
    properties: { tabColor: { argb: 'FFF59E0B' } }
  });

  // 設定欄位標題
  worksheet.columns = [
    { header: '編號', key: 'id', width: 10 },
    { header: '被通報人姓名', key: 'suspectName', width: 20 },
    { header: '發生地點', key: 'location', width: 20 },
    { header: '事件描述', key: 'description', width: 50 },
    { header: '狀態', key: 'status', width: 12 },
    { header: '審核備註', key: 'reviewNote', width: 30 },
    { header: '通報時間', key: 'createdAt', width: 20 },
    { header: '更新時間', key: 'updatedAt', width: 20 },
  ];

  // 設定標題列樣式
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF59E0B' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // 狀態對照表
  const statusMap: Record<string, string> = {
    'pending': '待審核',
    'reviewing': '審核中',
    'approved': '已通過',
    'rejected': '已駁回',
  };

  // 新增資料列
  reports.forEach((report, index) => {
    const row = worksheet.addRow({
      id: report.id,
      suspectName: report.suspectName,
      location: report.location || '未提供',
      description: report.description,
      status: statusMap[report.status] || report.status,
      reviewNote: report.reviewNote || '',
      createdAt: report.createdAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
      updatedAt: report.updatedAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    });

    // 交替列背景色
    if (index % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF8E1' }
      };
    }

    // 設定狀態欄位顏色
    const statusCell = row.getCell('status');
    switch (report.status) {
      case 'pending':
        statusCell.font = { color: { argb: 'FFFF9800' } };
        break;
      case 'approved':
        statusCell.font = { color: { argb: 'FF4CAF50' } };
        break;
      case 'rejected':
        statusCell.font = { color: { argb: 'FFF44336' } };
        break;
    }
  });

  // 設定邊框
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });
  });

  // 凍結首列
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // 新增統計工作表
  const statsSheet = workbook.addWorksheet('統計摘要', {
    properties: { tabColor: { argb: 'FF4CAF50' } }
  });

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const approvedCount = reports.filter(r => r.status === 'approved').length;
  const rejectedCount = reports.filter(r => r.status === 'rejected').length;

  statsSheet.addRow(['統計項目', '數量']);
  statsSheet.addRow(['總通報數', reports.length]);
  statsSheet.addRow(['待審核', pendingCount]);
  statsSheet.addRow(['已通過', approvedCount]);
  statsSheet.addRow(['已駁回', rejectedCount]);
  statsSheet.addRow(['匯出時間', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })]);

  // 設定統計表樣式
  statsSheet.getColumn(1).width = 15;
  statsSheet.getColumn(2).width = 20;
  const statsHeader = statsSheet.getRow(1);
  statsHeader.font = { bold: true };
  statsHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4CAF50' }
  };

  // 匯出為 Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * 上傳檔案到 Google Drive
 */
export async function uploadToGoogleDrive(
  buffer: Buffer,
  filename: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const tempDir = '/tmp/child-guardian-bee';
  const tempFile = path.join(tempDir, filename);

  try {
    // 確保暫存目錄存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 寫入暫存檔案
    fs.writeFileSync(tempFile, buffer);

    // 確保 Google Drive 目標資料夾存在
    try {
      await execAsync(
        `rclone mkdir "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}" --config ${GDRIVE_CONFIG}`
      );
    } catch (e) {
      // 資料夾可能已存在，忽略錯誤
    }

    // 上傳檔案
    const remotePath = `${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/${filename}`;
    await execAsync(
      `rclone copy "${tempFile}" "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}" --config ${GDRIVE_CONFIG}`
    );

    // 取得分享連結
    const { stdout } = await execAsync(
      `rclone link "${remotePath}" --config ${GDRIVE_CONFIG}`
    );
    const url = stdout.trim();

    // 清理暫存檔案
    fs.unlinkSync(tempFile);

    return { success: true, url };
  } catch (error) {
    // 清理暫存檔案
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('上傳到 Google Drive 失敗:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 匯出通報資料到 Google Drive
 */
export async function exportReportsToGoogleDrive(
  reports: ReportData[]
): Promise<{ success: boolean; url?: string; filename?: string; error?: string }> {
  try {
    // 產生檔名（包含時間戳記）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `通報資料_${timestamp}.xlsx`;

    // 建立 Excel 檔案
    const buffer = await createReportExcel(reports);

    // 上傳到 Google Drive
    const result = await uploadToGoogleDrive(buffer, filename);

    if (result.success) {
      return {
        success: true,
        url: result.url,
        filename,
      };
    } else {
      return {
        success: false,
        error: result.error,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('匯出通報資料失敗:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
