"""劳动法问答：检索 -> 拼上下文 -> 生成 -> 返回答案 + 引用来源。"""
import config
from src.llm import chat
from src.prompts import QA_SYSTEM
from src.retrieve import search


def format_context(hits) -> str:
    blocks = []
    for i, h in enumerate(hits, 1):
        blocks.append(f"[{i}] 《{h['law_name']}》{h['chapter']} {h['article_no']}\n{h['text']}")
    return "\n\n".join(blocks)


def answer(question: str, top_k: int = 6):
    config.sanity_check()
    hits = search(question, top_k=top_k)
    messages = [
        {"role": "system", "content": QA_SYSTEM},
        {"role": "user", "content": f"参考资料：\n\n{format_context(hits)}\n\n问题：{question}"},
    ]
    return {"answer": chat(messages), "sources": hits}


if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) or "试用期最长可以约定多久？"
    result = answer(q)
    print("\n=== 回答 ===")
    print(result["answer"])
    print("\n=== 检索到的条文 ===")
    for h in result["sources"]:
        print(f"- 《{h['law_name']}》{h['article_no']}  score={h.get('score')}")
