# 用工合规 AI Agent

> **在线体验（新版 Web）**：<https://mingqi.up.railway.app/>
> **Streamlit 版（评测复现用）**：<https://labor-ai-agent-4k7w5pjajymvfsvwcdwkwd.streamlit.app/>

> 上传一份劳动合同，逐条给出风险等级、法条依据和修改建议；同时支持带引用的劳动法问答。

面向中小企业的用工合规助手。核心是一条 **「按条切分 → BM25 + 向量混合检索 → RRF 融合 → Cross-Encoder 重排 → 强制引用生成」** 的 RAG pipeline，外加一套自建的劳动法评测集。

## 团队信息

| 项 | 内容 |
|---|---|
| 团队名称 | 明契 |
| 队长 / 开发者 | 谢多（中南财经政法大学 · 劳动关系 + 人工智能双学位） |
| 分工说明 | 检索管线、合同审查逻辑、后端 API、前端界面、评测集均由队长独立开发 |
| 指导教师 | 无 |

## 两种使用方式

| | Streamlit 版（在线 Demo） | Web 版（FastAPI + Next.js） |
|---|---|---|
| 入口 | `streamlit run app.py` | `uvicorn main:app` + `cd frontend && npm run dev` |
| 合同审查 | 整份一次性返回 | **SSE 流式**，每审完一条立即推送渲染 |
| 界面 | 单页 | 落地页 / 劳动者问答 / 合同审查 / 赔偿计算器 / Agent |

## 为什么做这个

- 中小企业普遍没有专职法务，劳动合同、规章制度里的坑（试用期超期、放弃社保、竞业限制无补偿）常年没人查；
- 通用大模型答劳动法问题会编法条，而劳动纠纷里「引错一条」的代价是真实的钱；
- 所以关键不是「能答」，而是 **「答得有出处、查得到原文、错了能算出来」**。

## 效果

| 指标 | 数值 | 怎么测的 |
|---|---|---|
| 知识库规模 | 14 部法律法规 / 678 条 | `data/raw` 切分后条数，与官方目录逐条核对 |
| 法条检索 Recall@5（口语化） | **82.5%**（33/40） | 自建 40 题口语化评测集，人工标注 gold 条文 |
| 法条检索 Recall@5（教科书式） | 100%（23/23） | 同上，但题目使用了法条原词，**偏乐观，不作为对外指标** |
| 合同风险召回 | **100%**（19/19） | 3 份埋坑合同（19 个人工埋点）+ 1 份合规示范文本 |
| 合规文本高风险误报 | **0 条** | 合规示范文本 9 条条款，被判"高"的为 0 |
| 引用有效率 | 100% | **closed-set**：候选法条编号喂给模型、按编号反查，44 条引用 0 条越界、0 条「依据不足」 |
| 摘录逐字率 | 97.7% | 每条引用的「原文摘录」与所引条文逐字比对，1 条不符被自动标出 |

> 说明：82.5% 这组数字来自「口语化」题集（"老板说试用期只给两千生活费行不行"），题目不含法条词汇；
> 同一套系统在教科书式题集上是 100%，但那是因为题目直接用了法条原词，指标偏乐观。
> **对外只报口语化那组。**

## 评测方法

```
eval/qa_set.hard.jsonl   40 题口语化问答，字段：question / gold_articles / category
eval/run_eval.py         检索前 5 条命中任一 gold 即算召回，输出 Recall@5 + 明细 CSV
data/contracts/          3 份埋坑合同 + 1 份合规示范 + 埋点清单.md
```

- `gold_articles` 允许多条：一个问题常有多个正确依据（如"怀孕被辞"既可引劳动合同法第42条，也可引女职工特别规定第5条），只标一条会低估系统；
- 合同审查的人工核对方式是：把模型输出的 `items` 和 `埋点清单.md` 逐条对照，**标为"高/中"且命中同一个坑才算召回**；
- 明细见 `docs/合同审查结果.md`。

## 消融实验

同一套 40 题口语化评测集，逐层拆开看每一层贡献多少（`python eval/ablate.py`）：

| 方案 | Recall@5 | 说明 |
|---|---|---|
| ① 纯向量 | 72.5%（29/40） | bge-m3 语义召回 |
| ② 纯 BM25 | 42.5%（17/40） | 口语提问几乎打不中，法条术语和用户说法差太远 |
| ③ 混合 RRF（等权） | 52.5%（21/40） | **比纯向量还低**：等权融合把 BM25 的弱信号灌进来 |
| ④ 混合 + 重排（等权） | 80.0%（32/40） | 重排救回来了 |
| ⑤ 纯向量 + 重排 | 82.5%（33/40） | **重排才是主力** |
| ③′ 混合 RRF（加权 0.8/0.2） | 65.0%（26/40） | 调权重后不再拖后腿 |
| ④′ 混合 + 重排（加权 0.8/0.2） | **82.5%（33/40）** | 当前线上配置 |

结论（比"我用了混合检索"更值钱的部分）：

- **重排贡献最大**：纯向量 72.5% → 82.5%，+10 个百分点；
- **等权 RRF 有害**：BM25 单路只有 42.5%，等权融合让混合（52.5%）反而低于纯向量（72.5%）；
- **加权后 BM25 变成无害但也没功劳**：0.8/0.2 让混合回到 82.5%，与纯向量+重排打平。在当前 678 条语料和口语题集上，语义检索已经够用，BM25 的价值主要在长尾精确术语，这套题没测到。

## 架构

```
data/raw/*.txt
   │  src/ingest.py      按「第X条」切分，保留 法律名/章/条号 元数据
   ▼
data/processed/chunks.jsonl
   │  src/index.py       bge-m3 向量化 + src/tokenize.py 分词后建 BM25
   ▼
embeddings.npy + bm25.pkl
   │  src/retrieve.py    查询扩展 → 双路召回 → RRF → bge-reranker 重排
   ▼
src/qa.py          问答（强制引用 + 资料不足则拒答）
src/review.py      合同逐条审查（多问题拆分 + 合同期限背景 + closed-set 引用 + 摘录逐字核验）
src/vision.py      合同照片 / 扫描件识别（视觉模型只做「读字」，不改审查逻辑）
src/compensation.py 第 47/87 条经济补偿规则（三倍封顶、12 年上限、违法解除 2N）
src/tools.py       Agent 工具实现 + function calling schema（登记执行计划 / 查法条 / 审合同 / 算赔偿 / 写仲裁申请书）
   ▼
app.py             Streamlit 界面（评测复现用）
main.py            FastAPI 后端（Web 版唯一入口）
  ├─ /api/review, /api/review_image, /api/review_text   SSE 流式逐条审查（含多模态识别回显）
  ├─ /api/agent/stream, /api/agent/run                 规划 + 多轮 Function Calling 工具循环（SSE 展示计划与调用过程）
  ├─ /api/qa, /api/calc, /api/health                   问答 / 赔偿计算 / 探活
  └─ api/review_stream.py, api/agent.py                 流式编排层（不改动已评测的 src/review.py）
frontend/          Next.js 前端（App Router 5 页面，fetch 流式解析 SSE，拍照上传 + 语音输入/朗读）
  ├─ components/   可复用组件（风险卡 memo、统计卡、执行计划、引用列表、语音、富文本）
  └─ error.tsx / global-error.tsx / loading.tsx        错误边界与加载骨架
```

多模态覆盖文本、图像（视觉识别转写）、语音（浏览器语音输入 + 本地 TTS 朗读）。
语音与图像一样只负责「转成文本」，之后复用同一条已评测的 RAG / 审查管线，
不新增不可核验的生成环节；浏览器不支持时自动隐藏语音入口，不阻塞主流程。

模型分工：问答与审查用 `DeepSeek-V3`（长文本质量），Agent 用 `DeepSeek-V3.1`（实测 V3 在硅基流动
不总返回原生 `tool_calls`，会把调用写成正文 JSON 的「假调用」），视觉识别用 `Qwen3-VL-30B-A3B`。
换供应商只改 `.env`，业务代码不写死模型名（见 `config.py` / `src/llm.py`）。

## 快速开始

```bash
conda create -n laborai python=3.11 -y
conda activate laborai
pip install -r requirements.txt

cp .env.example .env          # 填入 LLM / embedding / reranker 的 key

python -m src.ingest          # 切分法规
python -m src.index           # 建索引（首次 2-5 分钟）
python -m src.qa "试用期最长可以约定多久"
python eval/run_eval.py eval/qa_set.hard.jsonl   # 评测
python -m src.review data/contracts/合同A-科技公司.txt  # 合同审查
streamlit run app.py          # Streamlit 界面
```

### Web 版（FastAPI + Next.js）

```bash
# 后端（终端 1）
uvicorn main:app --reload --port 8000
curl http://127.0.0.1:8000/api/health    # 探活

# 前端（终端 2）
cd frontend
cp .env.example .env.local               # 可留空，默认连 localhost:8000
npm install
npm run dev                              # http://localhost:3000
```

生产部署：后端用 Dockerfile（Railway/Render 均可，环境变量见 `.env.example` 与 `render.yaml`）；
前端构建时注入 `NEXT_PUBLIC_API_BASE=https://<后端域名>`。

环境变量（后端，完整模板见 `.env.example`，本地复制为 `.env`，线上由平台注入）：

| 变量 | 默认值 / 说明 |
|---|---|
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 硅基流动 `deepseek-ai/DeepSeek-V3`，问答与合同审查 |
| `LLM_VL_MODEL` / `VL_MAX_PAGES` / `VL_MAX_SIDE` | `Qwen/Qwen3-VL-30B-A3B-Instruct`；扫描 PDF 最多 3 页、图片长边 1600px |
| `AGENT_MODEL` | `deepseek-ai/DeepSeek-V3.1`，Agent 专用（见上方模型分工） |
| `EMBED_API_KEY` / `EMBED_BASE_URL` / `EMBED_MODEL` | `BAAI/bge-m3` 向量化 |
| `RERANK_MODEL` / `USE_RERANK` | `BAAI/bge-reranker-v2-m3` 重排；调不通设 `USE_RERANK=0` |
| `PORT` | 生产平台注入，Dockerfile 不硬编码 |
| `NEXT_PUBLIC_API_BASE`（前端） | 构建期变量，见 `frontend/.env.example`；改后必须重新构建前端 |

依赖清单在 `requirements.txt`，其中 `pypdfium2` 是 `pdfplumber.page.to_image()` 的隐式依赖，
缺了会让「扫描版 PDF 多模态识别」在全新容器里直接失败（本机装过不代表线上装过）。

## 几个设计选择

**按「条」切分，不用固定长度**：法条本身就是最小完整语义单元，按 512 字切会把「试用期不得超过…」和它的例外情况劈开，模型就会答错。元数据保留法律名和章，检索时可以按法律过滤。

**混合检索而不是纯向量**：法律问题里大量精确术语（代通知金、经济补偿、竞业限制），BM25 命中率高；口语化提问（「公司让我走人不给钱」）才需要语义检索。两路召回后用 RRF 融合，不用调权重。

**统一分词器（`src/tokenize.py`）**：jieba 默认会把「百分之一百五十」切成「百/分/之/一/百/五/十」，BM25 直接失效。灌入 60 个法律术语自定义词典，且**建索引和查询必须用同一个 `cut()`**，否则两套切词永远对不上。

**口语 → 术语的查询扩展**：用户说「一倍半」「调到外地」「末位淘汰」，法条里写的是「百分之一百五十」「变更劳动合同」「不能胜任工作」。检索前做一层词表映射，只影响召回，重排仍用原句。

**不用向量数据库**：语料只有几千条，numpy 矩阵算余弦相似度几毫秒就够，省掉 Chroma/Milvus 的安装和调试成本。生产环境再换。

**引用有效性校验**：模型输出的每条法条都和知识库比对，不存在就标红。这是防幻觉最便宜的一招。

## 已知局限

- **closed-set 只保证"引用来自候选"，不保证"选了候选里最对的那条"**：合同A 的违约金条款，模型引了劳动法第31条 + 劳动合同法第90条（候选内、法理沾边），但最直接的是候选里排第 6 的劳动合同法第25条。检索排序把"通知/责任"类条文排在"禁止"类条文前面是根因之一。改进方向：违约金/押金类 query 的检索增强，或让模型对候选做一轮法理排序。
- **多问题拆分偶有语义重复**：竞业限制的"未约定补偿"与"约定无需支付补偿"会被拆成两个 issue。宁多勿漏的权衡，详见 `docs/合同审查结果.md`。
- **文件头噪音**：合同开头的"甲方/乙方"信息块被当作独立条款，会报一条"必备条款缺失"的中风险（不判高）。改进方向：识别并跳过前导信息块。
- **口语化检索 82.5%**：瓶颈在重排。实测「加班费按一倍半算对不对」这道题，劳动法第44条在向量召回、BM25、RRF 融合里都排第 1，被 reranker 挤出前 5——`bge-reranker-v2-m3` 对「中文口语 ↔ 法条书面语」的跨域匹配偏弱。试过拼法律名前缀、重排分数与 RRF 加权融合，都无效（后者还让教科书题集掉到 95.7%），已回滚，记录在 `docs/notes.md`。
- 地方裁审口径目前**只有湖北省**一份，其他地区会答得偏保守。
- 合同条款切分靠正则，遇到「第一条」被写成「1.」混排的扫描件会切错。
- 没有多轮追问，用户一次问不清就得重问。
- 单轮处理上限 40 条（v1 是 25 条），超长合同仍会被截断。

## 免责声明

本项目输出仅供学习研究，不构成法律意见。
