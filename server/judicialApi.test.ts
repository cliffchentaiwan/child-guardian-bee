import { describe, expect, it } from "vitest";
import {
  isServiceAvailable,
  getServiceStatus,
  maskName,
  isChildRelatedCase,
  extractRiskTags,
  parseJudgmentId,
  extractDefendantNames
} from "./judicialApi";

describe("司法院 API 工具函數", () => {
  describe("isServiceAvailable", () => {
    it("應該回傳布林值", () => {
      const result = isServiceAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getServiceStatus", () => {
    it("應該回傳服務狀態物件", () => {
      const status = getServiceStatus();
      expect(status).toHaveProperty("available");
      expect(status).toHaveProperty("message");
      expect(typeof status.available).toBe("boolean");
      expect(typeof status.message).toBe("string");
    });

    it("當服務不可用時應該包含 nextAvailable", () => {
      const status = getServiceStatus();
      if (!status.available) {
        expect(status.nextAvailable).toBeDefined();
      }
    });
  });

  describe("maskName", () => {
    it("應該遮罩兩字姓名的第二個字", () => {
      expect(maskName("王明")).toBe("王○");
    });

    it("應該遮罩三字姓名的中間字", () => {
      expect(maskName("王小明")).toBe("王○明");
    });

    it("應該遮罩四字姓名的中間兩字", () => {
      expect(maskName("歐陽小明")).toBe("歐○○明");
    });

    it("單字姓名應該保持不變", () => {
      expect(maskName("王")).toBe("王");
    });
  });

  describe("isChildRelatedCase", () => {
    it("應該識別性侵害案件", () => {
      expect(isChildRelatedCase("妨害性自主", "")).toBe(true);
      expect(isChildRelatedCase("強制性交", "")).toBe(true);
    });

    it("應該識別兒童相關案件", () => {
      expect(isChildRelatedCase("", "被害人為未成年人")).toBe(true);
      expect(isChildRelatedCase("", "對兒童犯罪")).toBe(true);
    });

    it("應該識別虐待案件", () => {
      expect(isChildRelatedCase("傷害", "虐待兒童")).toBe(true);
    });

    it("不相關案件應該回傳 false", () => {
      expect(isChildRelatedCase("竊盜", "偷竊財物")).toBe(false);
      expect(isChildRelatedCase("詐欺", "詐騙金錢")).toBe(false);
    });
  });

  describe("extractRiskTags", () => {
    it("應該提取性侵害標籤", () => {
      const tags = extractRiskTags("妨害性自主", "強制性交");
      expect(tags).toContain("性侵害");
    });

    it("應該提取猥褻標籤", () => {
      const tags = extractRiskTags("強制猥褻", "");
      expect(tags).toContain("猥褻");
    });

    it("應該提取多個標籤", () => {
      const tags = extractRiskTags("妨害性自主", "對兒童猥褻並虐待");
      expect(tags.length).toBeGreaterThanOrEqual(2);
    });

    it("無相關內容應該回傳空陣列", () => {
      const tags = extractRiskTags("竊盜", "偷竊財物");
      expect(tags).toEqual([]);
    });
  });

  describe("parseJudgmentId", () => {
    it("應該正確解析裁判書 ID", () => {
      const result = parseJudgmentId("CHDM,105,交訴,51,20161216,1");
      expect(result).not.toBeNull();
      expect(result?.court).toBe("CHDM");
      expect(result?.year).toBe("105");
      expect(result?.caseType).toBe("交訴");
      expect(result?.caseNo).toBe("51");
      expect(result?.date).toBe("20161216");
      expect(result?.checkNo).toBe("1");
    });

    it("格式錯誤應該回傳 null", () => {
      expect(parseJudgmentId("invalid")).toBeNull();
      expect(parseJudgmentId("a,b,c")).toBeNull();
    });
  });

  describe("extractDefendantNames", () => {
    it("應該提取被告姓名", () => {
      const content = "被告 王小明 因犯罪被起訴";
      const names = extractDefendantNames(content);
      expect(names).toContain("王小明");
    });

    it("應該過濾過長的結果", () => {
      const content = "被告 這是一個很長的字串不是姓名";
      const names = extractDefendantNames(content);
      expect(names.length).toBe(0);
    });
  });
});

describe("司法院 API 認證", () => {
  it("環境變數應該已設定", () => {
    // 這個測試確認環境變數已正確設定
    // 注意：由於 API 只在凌晨 0-6 時可用，我們只檢查環境變數是否存在
    const user = process.env.JUDICIAL_API_USER;
    const password = process.env.JUDICIAL_API_PASSWORD;
    
    expect(user).toBeDefined();
    expect(password).toBeDefined();
    expect(user?.length).toBeGreaterThan(0);
    expect(password?.length).toBeGreaterThan(0);
  });
});
