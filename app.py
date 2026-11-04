"""Streamlit 前端：两个 tab，问答 + 合同审查。

本地运行：
    streamlit run app.py
"""
import os
from pathlib import Path

import streamlit as st

# Streamlit Cloud 部署时密钥放在 Secrets 里，这里桥接成环境变量，
# 这样 config.py 在本地和云端都不用改。
try:
    for _k, _v in st.secrets.items():
        os.environ.setdefault(_k, str(_v))
except Exception:  # noqa: BLE001
    pass

from src.qa import answer  # noqa: E402
from src.retrieve import _load  # noqa: E402
from src.review import review_contract  # noqa: E402

st.set_page_config(page_title="用工合规 AI Agent", page_icon="⚖️", layout="wide")

BADGE = {"高": "🔴 高", "中": "🟠 中", "低": "🟡 低", "无": "🟢 无", "未知": "⚪ 未知"}

# 访问密码：只有配置了 APP_PASSWORD 才启用（公开 demo 防别人烧你的余额）
_PWD = os.environ.get("APP_PASSWORD")
if _PWD and not st.session_state.get("_authed"):
    st.title("⚖️ 用工合规 AI Agent")
    st.caption("该 Demo 已设置访问密码")
    _typed = st.text_input("访问密码", type="password", key="pwd_input")
    if st.button("进入", type="primary"):
        if _typed == _PWD:
            st.session_state["_authed"] = True
            st.rerun()
        else:
            st.error("密码错误")
    st.stop()


@st.cache_resource(show_spinner="加载知识库索引 ...")
def _warm_index():
    """把 4MB 索引加载一次并缓存，避免每次交互都重读。"""
    _load()
    return True


_warm_index()

st.title("⚖️ 用工合规 AI Agent")
st.caption("劳动法问答 · 劳动合同风险审查（知识库 14 部法规 / 678 条，仅供学习参考，不构成法律意见）")

tab_qa, tab_review = st.tabs(["💬 劳动法问答", "📄 劳动合同审查"])

EXAMPLES = [
    "试用期最长可以约定多久？",
    "公司拖欠工资三个月不给，能要赔偿金吗？",
    "公司不给交社保，说折成工资发，行吗？",
]

with tab_qa:
    st.markdown("**试试这几个问题**")
    _cols = st.columns(len(EXAMPLES))
    for _i, (_c, _q) in enumerate(zip(_cols, EXAMPLES)):
        if _c.button(_q, key=f"ex_{_i}", use_container_width=True):
            st.session_state["qa_q"] = _q

    question = st.text_area(
        "问题",
        key="qa_q",
        height=100,
        placeholder="例：公司让我周末加班但不给加班费，合法吗？",
    )
    if st.button("提问", type="primary", key="btn_qa"):
        if not question.strip():
            st.warning("先写一个问题。")
        else:
            with st.spinner("检索法条并生成回答 ..."):
                result = answer(question)
            st.markdown(result["answer"])
            with st.expander(f"📚 引用的法条（{len(result['sources'])} 条）"):
                for h in result["sources"]:
                    st.markdown(f"**《{h['law_name']}》{h['article_no']}**")
                    st.caption(h["text"])

with tab_review:
    st.markdown("上传一份劳动合同（txt），系统会逐条审查并给出风险清单。")

    _sample = Path(__file__).parent / "data" / "contracts" / "合同A-科技公司.txt"
    if _sample.exists():
        st.download_button(
            "先下载一份示例合同试试（里面埋了 6 个风险点）",
            _sample.read_bytes(),
            file_name="示例劳动合同（含风险点）.txt",
            mime="text/plain",
        )

    uploaded = st.file_uploader("选择合同文件", type=["txt"])
    manual = st.text_area("或直接粘贴合同正文", height=200, placeholder="第一条 合同期限 ...")

    if st.button("开始审查", type="primary", key="btn_review"):
        text = ""
        if uploaded is not None:
            raw = uploaded.read()
            for enc in ("utf-8-sig", "utf-8", "gb18030"):
                try:
                    text = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
        if not text:
            text = manual

        if len(text.strip()) < 30:
            st.warning("内容太短，请上传或粘贴完整合同。")
        else:
            with st.spinner("逐条审查中，约需 30-90 秒 ..."):
                report = review_contract(text)

            s = report["summary"]
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("条款数", s["clauses"])
            c2.metric("高风险", s["high"])
            c3.metric("中风险", s["mid"])
            c4.metric("引用有效率", f"{s['citation_valid_rate']:.0%}")
            if s.get("insufficient_basis"):
                st.caption(f"⚠️ 有 {s['insufficient_basis']} 个高/中风险问题在候选法条中找不到依据，已如实标注「依据不足」")

            for item in report["items"]:
                _title = item["issue"][:40] if item["issue"] else item["risk_type"]
                with st.expander(f"{BADGE.get(item['risk_level'], item['risk_level'])} · {item.get('clause_label', '')} · {item['risk_type']} · {_title}"):
                    st.markdown(f"**条款原文**\n\n> {item['clause']}")
                    st.markdown(f"**问题**：{item['issue']}")
                    if item.get("insufficient_basis"):
                        st.warning("⚠️ 依据不足：检索到的候选法条中没有能支撑该判断的依据（宁缺勿编）")
                    st.markdown(f"**建议**：{item['suggestion']}")
                    if item["legal_basis"]:
                        st.markdown("**法律依据**（只允许引用检索到的候选条文）")
                        for b in item["legal_basis"]:
                            flag = "✅" if b.get("exists") else "⚠️ 候选外引用"
                            if b.get("exists") and not b.get("quote_ok"):
                                flag += " · 摘录与原文不符"
                            st.markdown(f"- 《{b['law']}》{b['article']} {flag}　{b.get('quote', '')}")

st.divider()
st.caption("知识库：劳动法 / 劳动合同法 / 调解仲裁法 / 社会保险法 / 工会法 / 工伤保险条例 / 年休假条例 / "
           "工资支付暂行规定 / 医疗期规定 / 最低工资规定 / 女职工特别规定 / 司法解释(一)(二) / 湖北省工伤保险实施办法")
