/**
 * 政府資料爬蟲測試
 */

import { describe, it, expect } from 'vitest';
import {
  maskName,
  extractRiskTags,
  determineRole,
  extractLocation,
  getGovDataSourcesStatus,
} from './govDataScraper';

describe('maskName', () => {
  it('masks 2-character names correctly', () => {
    expect(maskName('王明')).toBe('王○');
  });

  it('masks 3-character names correctly', () => {
    expect(maskName('王小明')).toBe('王○明');
  });

  it('masks 4-character names correctly', () => {
    expect(maskName('歐陽小明')).toBe('歐○○明');
  });

  it('does not mask institution names', () => {
    expect(maskName('快樂幼兒園')).toBe('快樂幼兒園');
    expect(maskName('陽光托嬰中心')).toBe('陽光托嬰中心');
  });

  it('handles empty or short names', () => {
    expect(maskName('')).toBe('');
    expect(maskName('王')).toBe('王');
  });
});

describe('extractRiskTags', () => {
  it('extracts abuse-related tags', () => {
    const tags = extractRiskTags('虐待兒童');
    expect(tags).toContain('虐待');
  });

  it('extracts sexual harassment tags', () => {
    const tags = extractRiskTags('性騷擾');
    expect(tags).toContain('性騷擾');
  });

  it('extracts negligence tags', () => {
    const tags = extractRiskTags('疏忽照顧');
    expect(tags).toContain('疏忽照顧');
  });

  it('extracts improper discipline tags', () => {
    const tags = extractRiskTags('不當管教');
    expect(tags).toContain('不當管教');
  });

  it('extracts violation tags', () => {
    const tags = extractRiskTags('未立案經營');
    expect(tags).toContain('違規經營');
  });

  it('returns default tag when no match', () => {
    const tags = extractRiskTags('其他問題');
    expect(tags).toContain('違反兒少法');
  });

  it('extracts violation tag for 違規 keyword', () => {
    const tags = extractRiskTags('其他違規');
    expect(tags).toContain('違規經營');
  });
});

describe('determineRole', () => {
  it('identifies nanny role', () => {
    expect(determineRole('張小美', '保母')).toBe('保母');
    expect(determineRole('托育人員王小明')).toBe('保母');
  });

  it('identifies daycare center role', () => {
    expect(determineRole('陽光托嬰中心')).toBe('托嬰中心');
  });

  it('identifies kindergarten role', () => {
    expect(determineRole('快樂幼兒園')).toBe('幼兒園');
  });

  it('identifies cram school role', () => {
    expect(determineRole('', '補習班老師')).toBe('補習班老師');
  });

  it('identifies coach role', () => {
    expect(determineRole('', '游泳教練')).toBe('教練');
  });

  it('returns other for unknown roles', () => {
    expect(determineRole('某人')).toBe('其他');
  });
});

describe('extractLocation', () => {
  it('extracts city from text', () => {
    expect(extractLocation('台北市信義區')).toBe('台北市');
    expect(extractLocation('新北市板橋區')).toBe('新北市');
  });

  it('normalizes 臺 to 台', () => {
    expect(extractLocation('臺北市')).toBe('台北市');
    expect(extractLocation('臺中市')).toBe('台中市');
  });

  it('returns unknown for no match', () => {
    expect(extractLocation('某個地方')).toBe('未知');
  });
});

describe('getGovDataSourcesStatus', () => {
  it('returns correct status structure', () => {
    const status = getGovDataSourcesStatus();
    
    expect(status.available).toBe(true);
    expect(status.sources).toBeInstanceOf(Array);
    expect(status.sources.length).toBeGreaterThan(0);
    expect(status.message).toBeDefined();
  });

  it('includes all expected sources', () => {
    const status = getGovDataSourcesStatus();
    const sourceNames = status.sources.map(s => s.name);
    
    expect(sourceNames).toContain('CRC兒少法裁罰公告');
    expect(sourceNames).toContain('衛福部托育媒合平臺');
    expect(sourceNames).toContain('全國教保資訊網');
    expect(sourceNames).toContain('各縣市社會局');
    expect(sourceNames).toContain('KindyInfo幼園通');
  });
});
