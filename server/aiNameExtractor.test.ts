import { describe, expect, it } from "vitest";
import { maskExtractedName, normalizeRole } from "./aiNameExtractor";

describe("aiNameExtractor", () => {
  describe("maskExtractedName", () => {
    it("應該正確遮罩完整姓名", () => {
      expect(maskExtractedName("王小明")).toBe("王○明");
      expect(maskExtractedName("李大華")).toBe("李○華");
    });

    it("應該正確處理兩個字的姓名", () => {
      expect(maskExtractedName("王明")).toBe("王○");
    });

    it("應該正確處理四個字的姓名", () => {
      expect(maskExtractedName("歐陽小明")).toBe("歐○○明");
    });

    it("應該保留已遮罩的姓名", () => {
      expect(maskExtractedName("王○○")).toBe("王○○");
      expect(maskExtractedName("李某某")).toBe("李○○");
    });

    it("應該處理單字姓名", () => {
      expect(maskExtractedName("王")).toBe("王○○");
    });
  });

  describe("normalizeRole", () => {
    it("應該正確標準化家教角色", () => {
      expect(normalizeRole("家教")).toBe("家教");
      expect(normalizeRole("家庭教師")).toBe("家教");
      expect(normalizeRole("私人教師")).toBe("家教");
    });

    it("應該正確標準化保母角色", () => {
      expect(normalizeRole("保母")).toBe("保母");
      expect(normalizeRole("托嬰人員")).toBe("保母");
      expect(normalizeRole("褓姆")).toBe("保母");
    });

    it("應該正確標準化老師角色", () => {
      expect(normalizeRole("老師")).toBe("學校老師");
      expect(normalizeRole("教師")).toBe("學校老師");
      expect(normalizeRole("補習班老師")).toBe("補習班老師");
      expect(normalizeRole("安親班老師")).toBe("補習班老師");
    });

    it("應該正確標準化才藝老師角色", () => {
      expect(normalizeRole("才藝老師")).toBe("才藝老師");
      expect(normalizeRole("音樂老師")).toBe("才藝老師");
      expect(normalizeRole("美術老師")).toBe("才藝老師");
      expect(normalizeRole("舞蹈老師")).toBe("才藝老師");
    });

    it("應該正確標準化教練角色", () => {
      expect(normalizeRole("教練")).toBe("教練");
      expect(normalizeRole("游泳教練")).toBe("教練");
      expect(normalizeRole("體育教練")).toBe("教練");
    });

    it("應該將未知角色標準化為其他", () => {
      expect(normalizeRole("不明人士")).toBe("其他");
      expect(normalizeRole("")).toBe("其他");
    });
  });
});
