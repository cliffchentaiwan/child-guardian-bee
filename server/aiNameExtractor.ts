/**
 * AI 姓名提取模組
 * 
 * 使用 LLM 從新聞內容中精確提取涉案人姓名
 */

import { invokeLLM } from "./_core/llm";

/**
 * AI 提取結果介面
 */
export interface AIExtractionResult {
  names: Array<{
    name: string;
    role: string;
    confidence: number;
    context: string;
  }>;
  summary: string;
}

/**
 * 使用 AI 從新聞內容中提取涉案人姓名
 */
export async function extractNamesWithAI(
  title: string,
  content: string
): Promise<AIExtractionResult> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `你是一個專門分析台灣兒少安全新聞的助手。你的任務是從新聞中提取涉案人（加害者）的「真實姓名」和角色。

重要規則：
1. 只提取加害者/嫌疑人的「真實姓名」，不要提取受害者或其他人的姓名
2. 姓名必須是中文姓名格式，例如：
   - 完整姓名：「王小明」「陳大華」
   - 遮罩姓名：「王○○」「李某某」「陳○明」
   - 姓氏稱謂：「王姓男子」「陳姓女子」「吳男」「李女」
3. 「不要」提取親屬稱謂如：哥哥、妹妹、父親、母親、叔叔、阿姨等
4. 「不要」提取化名或代稱如：小明、小華、A男、B女等
5. 識別涉案人的角色（如：家教、保母、老師、教練等）
6. 對每個提取結果給出信心度（0-100）
7. 如果新聞中沒有提到真實姓名，返回空陣列

回應格式必須是有效的 JSON。`
        },
        {
          role: "user",
          content: `請分析以下新聞，提取涉案人（加害者）的姓名和角色：

標題：${title}

內容：${content}

請以 JSON 格式回應，包含：
- names: 姓名陣列，每個元素包含 name（姓名）、role（角色）、confidence（信心度 0-100）、context（出現的上下文）
- summary: 簡短摘要說明這則新聞的內容`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "name_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              names: {
                type: "array",
                description: "提取到的涉案人姓名列表",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "涉案人姓名（可能是遮罩形式）"
                    },
                    role: {
                      type: "string",
                      description: "涉案人角色（如家教、保母、老師等）"
                    },
                    confidence: {
                      type: "integer",
                      description: "提取信心度（0-100）"
                    },
                    context: {
                      type: "string",
                      description: "姓名出現的上下文"
                    }
                  },
                  required: ["name", "role", "confidence", "context"],
                  additionalProperties: false
                }
              },
              summary: {
                type: "string",
                description: "新聞內容摘要"
              }
            },
            required: ["names", "summary"],
            additionalProperties: false
          }
        }
      }
    });

    // 解析回應
    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      return { names: [], summary: "無法解析新聞內容" };
    }

    // 確保 content 是字串
    const content_str = typeof messageContent === 'string' 
      ? messageContent 
      : JSON.stringify(messageContent);

    const result = JSON.parse(content_str) as AIExtractionResult;
    return result;
  } catch (error) {
    console.error("AI 姓名提取失敗:", error);
    return { names: [], summary: "AI 處理失敗" };
  }
}

/**
 * 批次處理多則新聞的姓名提取
 */
export async function batchExtractNames(
  newsItems: Array<{ title: string; content: string }>
): Promise<AIExtractionResult[]> {
  const results: AIExtractionResult[] = [];
  
  for (const item of newsItems) {
    const result = await extractNamesWithAI(item.title, item.content);
    results.push(result);
    
    // 避免 API 請求過於頻繁
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

/**
 * 將 AI 提取的姓名轉換為遮罩格式
 */
export function maskExtractedName(name: string): string {
  // 如果已經是遮罩格式，直接返回
  if (name.includes('○') || name.includes('某')) {
    return name.replace(/某/g, '○');
  }
  
  // 對完整姓名進行遮罩
  if (name.length <= 1) return name + '○○';
  if (name.length === 2) return name[0] + '○';
  
  const chars = name.split('');
  for (let i = 1; i < chars.length - 1; i++) {
    chars[i] = '○';
  }
  return chars.join('');
}

/**
 * 角色標準化對照表
 */
const ROLE_MAPPING: Record<string, string> = {
  '家教': '家教',
  '家庭教師': '家教',
  '私人教師': '家教',
  '保母': '保母',
  '托嬰人員': '保母',
  '褓姆': '保母',
  '老師': '學校老師',
  '教師': '學校老師',
  '學校老師': '學校老師',
  '補習班老師': '補習班老師',
  '安親班老師': '補習班老師',
  '才藝老師': '才藝老師',
  '音樂老師': '才藝老師',
  '美術老師': '才藝老師',
  '舞蹈老師': '才藝老師',
  '教練': '教練',
  '游泳教練': '教練',
  '體育教練': '教練',
  '運動教練': '教練',
};

/**
 * 標準化角色名稱
 */
export function normalizeRole(role: string): string {
  // 檢查直接對照
  if (ROLE_MAPPING[role]) {
    return ROLE_MAPPING[role];
  }
  
  // 檢查部分匹配
  for (const [key, value] of Object.entries(ROLE_MAPPING)) {
    if (role.includes(key)) {
      return value;
    }
  }
  
  return '其他';
}
