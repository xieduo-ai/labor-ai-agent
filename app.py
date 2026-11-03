"""Streamlit 前端：两个 tab，问答 + 合同审查。

本地运行：
    streamlit run app.py
"""
import os

import streamlit as st

# Streamlit Cloud 部署时密钥放在 Secrets 里，这里桥接成环境变量，
# 这样 config.py 在本地和云端都不用改。
try:
    for _k, _v in st.secrets.items():
        os.environ.setdefault(_k, str(_v))
except Exception:  # noqa: BLE001
    pass

from src.qa import answer  # noqa: E402
from src.review import review_contract  # noqa: E402

st.set_page_config(page_title="用工合规 AI Agent", page_icon="⚖️", layout="wide")

BADGE = {"高": "🔴 高", "中": "🟠 中", "低": "🟡 低", "无": "🟢 无", "未知": "⚪ 未知"}

st.title("⚖️ 用工合规 AI Agent")
st.caption("劳动法问答 · 劳动合同风险审查（知识库截止 2026-11，仅供学习参考，不构成法律意见）")

tab_qa, tab_review = st.tabs(["💬 劳动法问答", "📄 劳动合同审查"])

with tab_qa:
    question = st.text_area(
        "问题",
        value="试用期最长可以约定多久？",
        height=100,
        placeholder="例：公司让我周末加班但不给加班费，合法吗？",
    )
    if st.button("提问", type="primary", key="btn_qa"):
        with st.spinner("检索法条并生成回答 ..."):
            result = answer(question)
        st.markdown(result["answer"])
        with st.expander(f"📚 引用的法条（{len(result['sources'])} 条）"):
            for h in result["sources"]:
                st.markdown(f"**《{h['law_name']}》{h['article_no']}**")
                st.caption(h["text"])

with tab_review:
    st.markdown("上传一份劳动合同（txt），系统会逐条审查并给出风险清单。")
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

            for item in report["items"]:
                with st.expander(f"{BADGE.get(item['risk_level'], item['risk_level'])} · {item['risk_type']} · {item['issue'][:40]}"):
                    st.markdown(f"**条款原文**\n\n> {item['clause']}")
                    st.markdown(f"**问题**：{item['issue']}")
                    st.markdown(f"**建议**：{item['suggestion']}")
                    if item["legal_basis"]:
                        st.markdown("**法律依据**")
                        for b in item["legal_basis"]:
                            flag = "✅" if b.get("exists") else "⚠️ 未在知识库核到"
                            st.markdown(f"- 《{b['law']}》{b['article']} {flag}　{b.get('quote', '')}")

st.divider()
st.caption("知识库：劳动法 / 劳动合同法 / 调解仲裁法 / 社会保险法 / 工伤保险条例 / 司法解释(一)(二) / 湖北及主要省市裁审口径")
