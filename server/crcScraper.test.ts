import { describe, it, expect, vi } from 'vitest';
import {
  categorizeViolation,
  normalizeCrcDate,
  convertToCaseRecord,
  type CrcPenaltyRecord,
} from './crcScraper';

describe('CRC Scraper', () => {
  describe('categorizeViolation', () => {
    it('should categorize sexual assault violations', () => {
      expect(categorizeViolation('違反第49條第1項第9款規定 強迫、引誘、容留或媒介兒少猥褻或性交')).toBe('性侵害');
      expect(categorizeViolation('涉及猥褻行為')).toBe('性侵害');
      expect(categorizeViolation('涉及性交行為')).toBe('性侵害');
    });

    it('should categorize abuse violations', () => {
      expect(categorizeViolation('違反第49條第1項第2款規定 身心虐待')).toBe('身心虐待');
    });

    it('should categorize improper conduct violations', () => {
      expect(categorizeViolation('違反第49條第1項第15款規定 其他對待或利用兒少犯罪或不正當行為')).toBe('不當行為');
    });

    it('should categorize other violations', () => {
      expect(categorizeViolation('違反其他規定')).toBe('其他違規');
      expect(categorizeViolation('未知違規')).toBe('其他違規');
    });
  });

  describe('normalizeCrcDate', () => {
    it('should convert CRC date format to standard format', () => {
      expect(normalizeCrcDate('2026.01.14')).toBe('2026-01-14');
      expect(normalizeCrcDate('2025.12.31')).toBe('2025-12-31');
      expect(normalizeCrcDate('2024.06.01')).toBe('2024-06-01');
    });

    it('should handle already normalized dates', () => {
      expect(normalizeCrcDate('2026-01-14')).toBe('2026-01-14');
    });
  });

  describe('convertToCaseRecord', () => {
    it('should convert CRC record to case record format', () => {
      const crcRecord: CrcPenaltyRecord = {
        id: '10414',
        city: '桃園市',
        name: '測試人員',
        violation: '違反第49條第1項第9款規定 強迫、引誘、容留或媒介兒少猥褻或性交',
        date: '2026.01.14',
        detailUrl: 'https://crc.sfaa.gov.tw/ChildYoungLaw/Detail/10414',
        sourceType: 'CRC兒少法',
      };

      const result = convertToCaseRecord(crcRecord);

      expect(result.name).toBe('測試人員');
      expect(result.role).toBe('行為人');
      expect(result.location).toBe('桃園市');
      expect(result.riskTags).toContain('性侵害');
      expect(result.sourceType).toBe('CRC兒少法');
      expect(result.sourceLink).toBe('https://crc.sfaa.gov.tw/ChildYoungLaw/Detail/10414');
      expect(result.date).toBe('2026-01-14');
      expect(result.verified).toBe(true);
    });

    it('should handle different violation types', () => {
      const record: CrcPenaltyRecord = {
        id: '10000',
        city: '台北市',
        name: '另一人員',
        violation: '違反第49條第1項第15款規定 其他對待或利用兒少犯罪或不正當行為',
        date: '2025.12.01',
        detailUrl: '',
        sourceType: 'CRC兒少法',
      };

      const result = convertToCaseRecord(record);
      expect(result.riskTags).toContain('不當行為');
    });
  });

  describe('CRC record structure', () => {
    it('should have all required fields', () => {
      const record: CrcPenaltyRecord = {
        id: '12345',
        city: '新北市',
        name: '王小明',
        violation: '違反兒少法',
        date: '2026.01.01',
        detailUrl: 'https://crc.sfaa.gov.tw/ChildYoungLaw/Detail/12345',
        sourceType: 'CRC兒少法',
      };

      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('city');
      expect(record).toHaveProperty('name');
      expect(record).toHaveProperty('violation');
      expect(record).toHaveProperty('date');
      expect(record).toHaveProperty('detailUrl');
      expect(record).toHaveProperty('sourceType');
    });
  });
});
