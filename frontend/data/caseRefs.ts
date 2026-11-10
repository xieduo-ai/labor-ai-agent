/**
 * 「常见争议」与「类案」数据 —— 智能助手页右侧资料栏的数据源。
 *
 * 设计原则（延续项目「结论敢被人查」）：
 * 1. COMMON_DISPUTES 是**自建 40 题口语化评测集**里的真实题目
 *    （eval/qa_set.hard.jsonl），不是裁判案例，界面必须标明出处，不许冒充判例。
 *    作用：没提问时页面不空，且这些题都能用仓库脚本复现。
 * 2. JUDGMENT_CASES 是真实裁判案例，**当前为空**。
 *    由队长按《案例采集清单.md》采集后填入；在拿到带出处的数据前，
 *    界面如实显示「尚未接入」，绝不编造案号 / 法院 / 金额。
 * 3. 案例只做闭集展示：只显示本文件里的数据，点「查看依据」跳到给出的
 *    官方来源链接。没有检索、没有模型生成，因此不会引入新的幻觉环节。
 */

export interface CommonDispute {
  id: number;
  category: string;
  question: string;
  /** 该评测题标注的法条，仅作展示，不参与判定 */
  articles: string[];
}

/** 来自自建 40 题口语化评测集（eval/qa_set.hard.jsonl），逐题可复现 */
export const COMMON_DISPUTES: CommonDispute[] = [
  { id: 4, category: "违法解除", question: "公司搞末位淘汰把我辞了，这算违法解除吗？", articles: ["劳动合同法第八十七条", "劳动合同法第四十条"] },
  { id: 1, category: "经济补偿", question: "我在公司干了三年被裁，工资一万二，能拿多少钱走人？", articles: ["劳动合同法第四十七条"] },
  { id: 2, category: "试用期", question: "老板说试用期只给两千块生活费，行不行？", articles: ["劳动合同法第二十条", "最低工资规定第十二条"] },
  { id: 13, category: "社保", question: "公司不给我交社保，说把钱折成工资发给我，行吗？", articles: ["社会保险法第五十八条"] },
  { id: 6, category: "加班费", question: "上个月加班费按一倍半给我算的，对不对？", articles: ["劳动法第四十四条"] },
  { id: 3, category: "三期保护", question: "怀孕了公司想让我自己辞职，我不同意的话他们能直接开除我吗？", articles: ["劳动合同法第四十二条"] },
  { id: 25, category: "竞业限制", question: "竞业限制的补偿一般给多少？", articles: ["劳动合同法第二十三条"] },
  { id: 8, category: "仲裁时效", question: "仲裁时效从哪天开始算？我离职半年了还能告吗？", articles: ["劳动争议调解仲裁法第二十七条"] },
];

/**
 * 真实裁判案例的数据契约。
 * 必填 sourceUrl（官方原文链接）+ caseNo（案号）——两者缺一不得入库，
 * 因为评委一定会点开核验；填不出处的条目不如留空。
 */
export interface JudgmentCase {
  /** 案件标题，如「张某与某公司违法解除劳动合同纠纷」 */
  title: string;
  /** 案号，如「(2024)鄂01民终1234号」 */
  caseNo: string;
  /** 审理法院 */
  court: string;
  /** 裁判日期 YYYY-MM-DD */
  date: string;
  /** 争议类型：违法解除 / 经济补偿 / 试用期 / 社保 / 加班费 / 竞业限制 / 工伤 / 三期保护 */
  category: string;
  /** 关键事实，2~3 条，每条一句话 */
  facts: string[];
  /** 裁判要旨，一句话 */
  holding: string;
  /** 结果，如「支付赔偿金 48,000 元」「调解结案」，金额必须来自原文 */
  result: string;
  /** 来源名称，如「最高人民法院指导案例 183 号」「中国裁判文书网」 */
  source: string;
  /** 官方原文链接，必须可直接打开 */
  sourceUrl: string;
  /** 与用户提问的相似点，用于「与你情况的相似点」 */
  similarity: string;
}

/** 待队长采集真实案例后填入。空数组时界面显示「尚未接入」，不编造。 */
export const JUDGMENT_CASES: JudgmentCase[] = [];
