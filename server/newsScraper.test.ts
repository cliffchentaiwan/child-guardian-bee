import { describe, expect, it } from 'vitest';
import {
  isChildRelatedNews,
  identifyRole,
  extractNewsRiskTags,
  extractNamesFromNews,
  maskNewsName,
  CHILD_SAFETY_KEYWORDS,
  NEWS_SOURCES
} from './newsScraper';

describe('newsScraper', () => {
  describe('isChildRelatedNews', () => {
    it('should detect child-related keywords in title', () => {
      const result = isChildRelatedNews('男子涉嫌性侵未成年少女遭逮', '');
      expect(result.isRelated).toBe(true);
      expect(result.matchedKeywords).toContain('性侵');
      expect(result.matchedKeywords).toContain('未成年');
    });

    it('should detect keywords in content', () => {
      const result = isChildRelatedNews('社會新聞', '保母涉嫌虐童案件');
      expect(result.isRelated).toBe(true);
      expect(result.matchedKeywords).toContain('保母');
      expect(result.matchedKeywords).toContain('虐童');
    });

    it('should return false for unrelated news', () => {
      const result = isChildRelatedNews('股市大漲創新高', '台股今日收盤上漲');
      expect(result.isRelated).toBe(false);
      expect(result.matchedKeywords).toHaveLength(0);
    });
  });

  describe('identifyRole', () => {
    it('should identify 保母 role', () => {
      expect(identifyRole('保母涉嫌虐待幼童')).toBe('保母');
      expect(identifyRole('托嬰中心爆發虐童案')).toBe('保母');
    });

    it('should identify 家教 role', () => {
      expect(identifyRole('家教老師涉嫌性騷擾')).toBe('家教');
    });

    it('should identify 補習班老師 role', () => {
      expect(identifyRole('補習班老師被控猥褻')).toBe('補習班老師');
    });

    it('should identify 教練 role', () => {
      expect(identifyRole('游泳教練涉嫌性侵')).toBe('教練');
    });

    it('should return 其他 for unknown roles', () => {
      expect(identifyRole('男子涉嫌犯案')).toBe('其他');
    });
  });

  describe('extractNewsRiskTags', () => {
    it('should extract 性侵害 tag', () => {
      const tags = extractNewsRiskTags('男子涉嫌性侵少女');
      expect(tags).toContain('性侵害');
    });

    it('should extract 猥褻 tag', () => {
      const tags = extractNewsRiskTags('教師涉嫌猥褻學生');
      expect(tags).toContain('猥褻');
    });

    it('should extract 兒童虐待 tag', () => {
      const tags = extractNewsRiskTags('保母虐童案件');
      expect(tags).toContain('兒童虐待');
    });

    it('should extract multiple tags', () => {
      const tags = extractNewsRiskTags('男子涉嫌性侵並虐待兒童');
      expect(tags).toContain('性侵害');
      expect(tags).toContain('兒童虐待');
    });

    it('should return empty array for no risk tags', () => {
      const tags = extractNewsRiskTags('今日天氣晴朗');
      expect(tags).toHaveLength(0);
    });
  });

  describe('extractNamesFromNews', () => {
    it('should extract names with 被告 prefix', () => {
      const names = extractNamesFromNews('被告王○○涉嫌犯案');
      expect(names.length).toBeGreaterThan(0);
      expect(names.some(n => n.startsWith('王'))).toBe(true);
    });

    it('should extract names with 嫌犯 prefix', () => {
      const names = extractNamesFromNews('嫌犯李某某被逮捕');
      expect(names.length).toBeGreaterThan(0);
      expect(names.some(n => n.startsWith('李'))).toBe(true);
    });

    it('should extract names with 男子/女子 prefix', () => {
      const names = extractNamesFromNews('男子陳○明涉嫌性侵');
      expect(names.length).toBeGreaterThan(0);
      expect(names.some(n => n.startsWith('陳'))).toBe(true);
    });

    it('should return empty array for text without names', () => {
      const names = extractNamesFromNews('今日天氣晴朗');
      expect(names).toHaveLength(0);
    });
  });

  describe('maskNewsName', () => {
    it('should mask single character name', () => {
      expect(maskNewsName('王')).toBe('王○○');
    });

    it('should mask two character name', () => {
      expect(maskNewsName('王明')).toBe('王○');
    });

    it('should mask three character name', () => {
      expect(maskNewsName('王小明')).toBe('王○明');
    });

    it('should mask four character name', () => {
      expect(maskNewsName('歐陽小明')).toBe('歐○○明');
    });
  });

  describe('NEWS_SOURCES', () => {
    it('should have valid RSS sources', () => {
      expect(NEWS_SOURCES.length).toBeGreaterThan(0);
      for (const source of NEWS_SOURCES) {
        expect(source.name).toBeTruthy();
        expect(source.url).toMatch(/^https?:\/\//);
        expect(source.category).toBeTruthy();
      }
    });
  });

  describe('CHILD_SAFETY_KEYWORDS', () => {
    it('should have comprehensive keyword list', () => {
      expect(CHILD_SAFETY_KEYWORDS).toContain('性侵');
      expect(CHILD_SAFETY_KEYWORDS).toContain('猥褻');
      expect(CHILD_SAFETY_KEYWORDS).toContain('虐童');
      expect(CHILD_SAFETY_KEYWORDS).toContain('保母');
      expect(CHILD_SAFETY_KEYWORDS).toContain('家教');
    });
  });
});
